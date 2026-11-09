"""Kaydedilenleri temizleme: tarama, envanter, filtre ve koleksiyon alımı + zamanlanmış bakım (SPEC-001 T-4a).

Kapsam (servis katmanı; router T-5'tir):
- Tarama: `start_scan` / `add_page` / `add_collections` / `finish_scan` (AC-S1, S2, S8, S13, S18, S19, S20, C22).
- Envanter ve filtre: `parse_filters`, `count_matching`, `matching_refs`, `inventory` (AC-S5, S14, S15, S16).
  Önizleme (T-4b) aynı filtre fonksiyonlarını kullanır (AC-S14).
- Koruma: `protection_context` ve `protected_clause` (AC-S21'in SQL yarısı). Python karşılığı `is_protected` ve ortak
  fixture T-4b'dedir; envanterin `state='protected'` kararı burada SQL'den gelir (tek kaynak).
- Bakım: `fail_stale_scans`, `stop_stale_batches`, `run_retention` (AC-C32, C44; görev sarmalayıcıları
  `tasks/cleanup_tasks.py`).

Kurallar:
- Saat enjekte edilir (`now`); bu dosyada gerçek saat okunmaz.
- Servisler `flush` eder, `commit` etmez (çağıran uç nokta/görev işlemi kapatır). Hatalar `CleanupError` ile gelir
  (kod ve HTTP durumu §7.9.2'dendir); router bunu `{"detail": {"code", …}}` zarfına çevirir.
- Hata gövdesine istemci girdisi yansıtılmaz (`fields` yalnız alan adlarıdır).
- Sıcak yol (başlat, sayfa, koleksiyon, envanter) silme çalıştırmaz. Silme yalnız `finish_scan` (AC-C22) ve
  zamanlanmış görevlerdedir; takılı taramayı `failed` yapmak ise `start_scan` içinde de olur (AC-S8).
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError, field_validator, model_validator
from sqlalchemy import and_, bindparam, case, cast, delete, func, not_, null, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, CleanupWriteGrant, SavedCollection, SavedTarget,
)
from app.models.session import Session
from app.services.cleanup_gate import compute_effective, lock_session
from app.services.cleanup_limits import DEFAULTS, get_limits, hard_cap

log = logging.getLogger("cleanup_scan")

KIND = "saved"

# Kurul K-5, K-21: kod düzeyindeki mod yalnız burada tanımlıdır (T-0c sonucu W). `scan/start` yanıtının
# `collection_choice` alanı ve `settings.saved.collection_choice_available` bu sabitten türer; eklenti modu
# kendisi belirlemez. Kod düzeyinde F'ye dönmek için False yapılır.
COLLECTION_CHOICE_AVAILABLE = True

MAX_PAGE_ITEMS = 50
MAX_COLLECTIONS_PER_CALL = 200
MAX_COLLECTIONS_PER_PROFILE = 200
INVENTORY_MAX_AGE = timedelta(hours=24)        # AC-S8: 24 saatten eski envanter "stale"
KEEP_SCANS = 20                                # AC-C32: tür başına son 20
SCAN_HOUR = timedelta(hours=1)
BLOCK_PAUSE = timedelta(hours=24)              # AC-C13
BLOCK_PAUSE_REASON = "Ek iş: Instagram işlemi engelledi"
STALE_FLOOR_S = 600                            # §6.6: T = max(600, 2 × delay_max + 120)
GRANT_RETENTION = timedelta(hours=48)          # R7 M5
DRAFT_RETENTION = timedelta(days=1)            # AC-C32
BATCH_DEAD_AFTER = timedelta(days=7)           # AC-C23
ACTIVE_BATCH = ("confirmed", "running", "stopped")
OUTCOMES = ("ok", "partial", "failed", "blocked")
ITEM_STATES = ("pending", "done", "already", "not_found", "protected")
MEDIA_TYPES = ("image", "video", "carousel", "ad")

_ID = re.compile(r"[0-9]{1,25}")
_OWNER = re.compile(r"[a-z0-9._]{1,30}")
_NOTE = re.compile(r"[a-z_]{1,30}")
_FIELD_NAME = re.compile(r"[a-z_][a-z0-9_]{0,39}")
_THUMB_HOSTS = (".cdninstagram.com", ".fbcdn.net")


class CleanupError(Exception):
    """İş kuralı hatası: `code` §7.9.2'deki kod, `status` HTTP durumu, `extra` zarfa eklenecek alanlar
    (`fields`, `retry_after`, `reason`, …). İstemci girdisi taşımaz."""

    def __init__(self, code: str, status: int = 409, **extra: Any):
        super().__init__(code)
        self.code = code
        self.status = status
        self.extra = extra


# ── Giriş şemaları (AC-S2: bilinmeyen alan 422) ────────────────────────────────

def _check_ids(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    if len(v) > 20:
        raise ValueError("too_long")
    for x in v:
        if not _ID.fullmatch(x):
            raise ValueError("bad_id")
    return v


class SavedIn(BaseModel):
    """`Saved` (§7.8). Sıkı tipler: sayı `media_id` yuvarlanabileceğinden kabul edilmez (R7 M6)."""
    model_config = ConfigDict(extra="forbid", strict=True)

    media_id: str
    shortcode: str
    owner_username: str | None = None
    media_type: Literal["image", "video", "carousel"] | None = None
    is_ad: bool = False
    thumbnail_url: str | None = None
    collection_ids: list[str] | None = None
    collections_unreadable: Literal[True] | None = None

    @field_validator("media_id")
    @classmethod
    def _media_id(cls, v: str) -> str:
        if not _ID.fullmatch(v):
            raise ValueError("bad_id")
        return v

    @field_validator("shortcode")
    @classmethod
    def _shortcode(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]{5,40}", v):
            raise ValueError("bad_shortcode")
        return v

    @field_validator("owner_username")
    @classmethod
    def _owner(cls, v: str | None) -> str | None:
        if v is not None and not _OWNER.fullmatch(v):
            raise ValueError("bad_owner")
        return v

    @field_validator("thumbnail_url")
    @classmethod
    def _thumb(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            u = urlsplit(v)
            host = u.hostname or ""
            port = u.port
        except ValueError:
            raise ValueError("bad_url")
        if (len(v) > 2000 or u.scheme != "https" or u.username or u.password or port not in (None, 443)
                or not host.endswith(_THUMB_HOSTS) or host in (h[1:] for h in _THUMB_HOSTS)):
            raise ValueError("bad_url")
        return v

    @field_validator("collection_ids")
    @classmethod
    def _cids(cls, v):
        return _check_ids(v)

    @model_validator(mode="after")
    def _exclusive(self):
        if self.collections_unreadable is not None and self.collection_ids is not None:
            raise ValueError("both")
        return self


_PAGE = TypeAdapter(list[SavedIn])


def clean_collection_name(name: str) -> str:
    """AC-S20: kırp; Unicode Cc ve Cf (yön denetimi U+202A-202E/U+2066-2069 ve sıfır genişlikli dahil) ile satır/paragraf
    ayırıcıları (Zl, Zp) at; sonucu yeniden kırp."""
    kept = "".join(ch for ch in name if unicodedata.category(ch) not in ("Cc", "Cf", "Zl", "Zp"))
    return kept.strip()


class CollectionIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    collection_id: str
    name: str

    @field_validator("collection_id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not _ID.fullmatch(v):
            raise ValueError("bad_id")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        if len(v) > 1000:
            raise ValueError("too_long")
        c = clean_collection_name(v)
        if not 1 <= len(c) <= 100:
            raise ValueError("bad_name")
        return c


class CollectionsIn(BaseModel):
    """`scan/{id}/collections` gövdesi (`viewer_id` router'dadır)."""
    model_config = ConfigDict(extra="forbid", strict=True)

    available: bool
    collections: list[CollectionIn] | None = None
    note_code: str | None = None

    @field_validator("note_code")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        if v is not None and not _NOTE.fullmatch(v):
            raise ValueError("bad_note")
        return v

    @model_validator(mode="after")
    def _shape(self):
        if self.available:
            if self.collections is None or self.note_code is not None:
                raise ValueError("shape")
            if len(self.collections) > MAX_COLLECTIONS_PER_CALL:
                raise ValueError("too_many")
        elif self.collections is not None:
            raise ValueError("shape")
        return self


def _invalid(exc: ValidationError, default: str) -> CleanupError:
    """Pydantic hatası -> 422 `invalid` + yalnız alan adları (girdi yansıtılmaz)."""
    names: list[str] = []
    for e in exc.errors():
        strs = [p for p in e.get("loc", ()) if isinstance(p, str)]
        n = strs[-1] if strs else default
        if _FIELD_NAME.fullmatch(n) and n not in names:
            names.append(n)
    return CleanupError("invalid", 422, fields=(names or [default])[:10])


# ── Ayarlar (tarama) ────────────────────────────────────────────────────────────

def _clamped(values, key: str) -> int:
    lo, hi = hard_cap(key)
    try:
        v = values[key]
        if type(v) is bool or isinstance(v, float) and v != v:
            raise ValueError
        v = int(v)
    except Exception:                                  # noqa: BLE001  (bozuk değer: varsayılan)
        v = int(DEFAULTS[key])
    return int(min(max(v, lo), hi))


@dataclass(frozen=True)
class ScanConfig:
    page_delay: tuple[int, int]
    max_pages: int
    max_per_hour: int


def scan_config(limits=None) -> ScanConfig:
    """Etkin tarama sınırları; dosya ne derse desin sert tavanlara yeniden kırpılır (AC-L2)."""
    lim = limits if limits is not None else get_limits()
    v = lim.values
    dmin, dmax = _clamped(v, "scan.page_delay_min"), _clamped(v, "scan.page_delay_max")
    if dmax < dmin + 1:
        dmax = min(hard_cap("scan.page_delay_max")[1], dmin + 1)
    return ScanConfig((dmin, dmax), _clamped(v, "scan.saved_max_pages"), _clamped(v, "scan.max_per_hour"))


def stale_threshold_s(delay_max: float) -> int:
    """§6.6 tek formül: T = max(600 sn, 2 × delay_max + 120 sn)."""
    return int(max(STALE_FLOOR_S, 2 * delay_max + 120))


def scan_stale_threshold_s(page_delay_max: float) -> int:
    """Tarama takılma eşiği: max(600 sn, 2 × page_delay_max + 120 sn) (§6.6)."""
    return stale_threshold_s(page_delay_max)


# ── Yardımcılar ─────────────────────────────────────────────────────────────────

def _require_enabled(session: Session) -> None:
    if not session.allow_unsave:
        raise CleanupError("feature_off", 403)


async def _scan_for(db: AsyncSession, session: Session, scan_id: int, *, lock: bool = False) -> CleanupScan:
    """IDOR: `id AND session_id`; başkasının ya da olmayan tarama 404."""
    q = select(CleanupScan).where(CleanupScan.id == scan_id, CleanupScan.session_id == session.id,
                                  CleanupScan.kind == KIND)
    if lock:
        q = q.with_for_update()
    scan = (await db.execute(q)).scalar_one_or_none()
    if scan is None:
        raise CleanupError("not_found", 404)
    return scan


async def current_inventory_scan(db: AsyncSession, session_id) -> CleanupScan | None:
    """§7.1: `status IN ('ok','partial')` olan en yeni tarama. Yalnız onun `saved_targets` satırları vardır."""
    return (await db.execute(
        select(CleanupScan).where(CleanupScan.session_id == session_id, CleanupScan.kind == KIND,
                                  CleanupScan.status.in_(("ok", "partial")))
        .order_by(CleanupScan.started_at.desc(), CleanupScan.id.desc()).limit(1))).scalar_one_or_none()


# ── Tarama başlat / sayfa / koleksiyon / bitir ──────────────────────────────────

@dataclass(frozen=True)
class ScanStart:
    scan_id: int
    max_pages: int
    page_delay: tuple[int, int]
    warn_after_ms: int
    stale_after_ms: int
    collection_choice: bool


async def start_scan(db: AsyncSession, session: Session, now: datetime, *, limits=None) -> ScanStart:
    """AC-S1, S8. Sıra: özellik açık mı -> takılı taramaları kapat -> çalışan tarama var mı -> kayan saat sınırı.
    `viewer_id`/`ext_version` denetimleri uç noktadadır (T-5)."""
    _require_enabled(session)
    await lock_session(db, session)                    # aynı profilde eşzamanlı iki başlatma sıraya girer
    _require_enabled(session)
    lim = limits if limits is not None else get_limits()
    cfg = scan_config(lim)
    await fail_stale_scans(db, now, limits=lim, session_id=session.id)

    running = (await db.execute(select(CleanupScan.id).where(
        CleanupScan.session_id == session.id, CleanupScan.kind == KIND, CleanupScan.status == "running"
    ).limit(1))).scalar_one_or_none()
    if running is not None:
        raise CleanupError("scan_running", 409)

    starts = list((await db.execute(
        select(CleanupScan.started_at).where(
            CleanupScan.session_id == session.id, CleanupScan.kind == KIND,
            CleanupScan.started_at > now - SCAN_HOUR, CleanupScan.started_at <= now)
        .order_by(CleanupScan.started_at))).scalars())
    if len(starts) >= cfg.max_per_hour:
        free_at = starts[len(starts) - cfg.max_per_hour] + SCAN_HOUR     # sayı sınırın altına inen an
        raise CleanupError("scan_too_soon", 429, retry_after=max(1, int((free_at - now).total_seconds())))

    scan = CleanupScan(session_id=session.id, kind=KIND, status="running", started_at=now,
                       collections_mode="all_protected")
    db.add(scan)
    await db.flush()
    return ScanStart(
        scan.id, cfg.max_pages, cfg.page_delay,
        warn_after_ms=(cfg.page_delay[1] + 60) * 1000,
        stale_after_ms=scan_stale_threshold_s(cfg.page_delay[1]) * 1000,
        collection_choice=bool(COLLECTION_CHOICE_AVAILABLE),
    )


@dataclass(frozen=True)
class PageResult:
    accepted: int
    duplicates: int
    total: int
    continue_: bool


async def add_page(db: AsyncSession, session: Session, scan_id: int, page_no: int, items: Any, now: datetime,
                   *, limits=None) -> PageResult:
    """AC-S13: ardışık `page_no`, sayfada ≤ 50 öğe, tek geçersiz öğe tüm sayfayı reddeder, tekrarlar `duplicates`,
    `max_pages` aşımı `page_cap`."""
    _require_enabled(session)
    cfg = scan_config(limits)
    scan = await _scan_for(db, session, scan_id, lock=True)
    if scan.status != "running":
        raise CleanupError("scan_closed", 409)
    if type(page_no) is not int or page_no != scan.pages + 1:
        raise CleanupError("page_out_of_order", 409)
    if page_no > cfg.max_pages:
        raise CleanupError("page_cap", 409)
    if not isinstance(items, (list, tuple)) or len(items) > MAX_PAGE_ITEMS:
        raise CleanupError("invalid", 422, fields=["items"])
    try:
        parsed = _PAGE.validate_python(list(items))
    except ValidationError as e:
        raise _invalid(e, "items") from None

    seen: set[str] = set()
    fresh: list[SavedIn] = []
    for it in parsed:
        if it.media_id not in seen:
            seen.add(it.media_id)
            fresh.append(it)
    already = set((await db.execute(select(SavedTarget.media_id).where(
        SavedTarget.scan_id == scan.id, SavedTarget.media_id.in_(list(seen))))).scalars()) if seen else set()
    new = [it for it in fresh if it.media_id not in already]
    dup = len(parsed) - len(new)
    for k, it in enumerate(new):
        db.add(SavedTarget(
            session_id=session.id, scan_id=scan.id, position=scan.items + k, media_id=it.media_id,
            shortcode=it.shortcode, owner_username=it.owner_username, media_type=it.media_type, is_ad=it.is_ad,
            thumbnail_url=it.thumbnail_url,
            collection_ids=it.collection_ids if it.collection_ids is not None else null(),   # SQL NULL (JSON 'null' değil)
            collections_unreadable=bool(it.collections_unreadable)))
    scan.pages += 1
    scan.items += len(new)
    scan.duplicates += dup
    scan.last_page_at = now
    await db.flush()
    return PageResult(len(new), dup, scan.items, page_no < cfg.max_pages)


@dataclass(frozen=True)
class CollectionsResult:
    mode: str
    new_count: int


async def add_collections(db: AsyncSession, session: Session, scan_id: int, payload: Any, now: datetime
                          ) -> CollectionsResult:
    """AC-S20 [W]. Sıra: özellik açık -> 404 -> kapalı tarama -> kod düzeyi F (K-5) -> hak (K-7) -> doğrulama (422).
    Hakkı yalnız başarıyla işlenen çağrı tüketir; 422 tüketmez.

    `last_seen_scan_id` burada YAZILMAZ (R7 M3): yalnız `finish_scan` (ok/partial) yazar. Hangi satırların bu taramada
    listelendiği `saved_collections.listed_scan_id` ile taşınır; `finish_scan` (ok/partial) bunu `last_seen_scan_id`'ye çevirir."""
    _require_enabled(session)
    scan = await _scan_for(db, session, scan_id, lock=True)
    if scan.status != "running":
        raise CleanupError("scan_closed", 409)
    if not COLLECTION_CHOICE_AVAILABLE:
        raise CleanupError("collections_unavailable", 409)
    if scan.pages > 0 or scan.collections_received_at is not None:
        raise CleanupError("collections_closed", 409)
    try:
        body = CollectionsIn.model_validate(payload)
    except ValidationError as e:
        raise _invalid(e, "collections") from None

    if not body.available:
        scan.collections_mode = "all_protected"
        scan.collections_received_at = now
        await db.flush()
        return CollectionsResult("all_protected", 0)

    seen_ids: dict[str, str] = {}
    for c in body.collections or []:
        seen_ids.setdefault(c.collection_id, c.name)         # yinelenen kimlikte ilki geçerli
    ids = list(seen_ids)
    existing = {r.collection_id: r for r in (await db.execute(select(SavedCollection).where(
        SavedCollection.session_id == session.id, SavedCollection.collection_id.in_(ids)))).scalars()} if ids else {}
    new_ids = [i for i in ids if i not in existing]

    total = (await db.execute(select(func.count()).select_from(SavedCollection).where(
        SavedCollection.session_id == session.id))).scalar_one()
    overflow = total + len(new_ids) - MAX_COLLECTIONS_PER_PROFILE
    if overflow > 0:
        # Budama: son envanter taramasında görülmeyenler, en eski last_seen_scan_id'den başlayarak (R6 L-9).
        inv = await current_inventory_scan(db, session.id)
        q = select(SavedCollection).where(SavedCollection.session_id == session.id)
        if ids:
            q = q.where(SavedCollection.collection_id.notin_(ids))
        if inv is not None:
            q = q.where(or_(SavedCollection.last_seen_scan_id.is_(None), SavedCollection.last_seen_scan_id != inv.id))
        victims = list((await db.execute(
            q.order_by(SavedCollection.last_seen_scan_id.asc().nulls_first(), SavedCollection.id.asc())
            .limit(overflow))).scalars())
        if len(victims) < overflow:
            raise CleanupError("invalid", 422, fields=["collections"])      # sığmıyor; hak tüketilmez
        for v in victims:
            await db.delete(v)
        await db.flush()

    for cid, row in existing.items():
        row.name = seen_ids[cid]                             # ad güncellenir; `protected` değişmez (K-22)
        row.listed_scan_id = scan.id
    for cid in new_ids:
        db.add(SavedCollection(session_id=session.id, collection_id=cid, name=seen_ids[cid], protected=True,
                               first_seen_scan_id=scan.id, listed_scan_id=scan.id, created_at=now, updated_at=now))
    scan.collections_mode = "per_collection"
    scan.collections_received_at = now
    await db.flush()
    return CollectionsResult("per_collection", len(new_ids))


@dataclass(frozen=True)
class FinishResult:
    status: str
    items: int


async def finish_scan(db: AsyncSession, session: Session, scan_id: int, outcome: str, note_code: str | None,
                      now: datetime) -> FinishResult:
    """AC-S8, C22, C13. `ok`/`partial`: envanterin yerini atomik alır (eski taramanın satırları silinir, tarama satırı
    kalır) ve W taramada görülen koleksiyonların `last_seen_scan_id`'si yazılır. `failed`/`blocked`: bu taramanın
    satırları silinir, önceki envanter kalır; `blocked` 24 sa duraklatır. Özellik kapalıyken de kabul edilir (§7.5).
    Kapalı taramaya yinelenen `finish` idempotenttir (durum değişmez)."""
    if outcome not in OUTCOMES:
        raise CleanupError("invalid", 422, fields=["outcome"])
    if note_code is not None and (not isinstance(note_code, str) or not _NOTE.fullmatch(note_code)):
        raise CleanupError("invalid", 422, fields=["note_code"])
    scan = await _scan_for(db, session, scan_id, lock=True)
    if scan.status != "running":
        return FinishResult(scan.status, scan.items)

    scan.status = outcome
    scan.finished_at = now
    scan.note_code = note_code
    if outcome in ("ok", "partial"):
        await db.execute(delete(SavedTarget).where(SavedTarget.session_id == session.id,
                                                   SavedTarget.scan_id != scan.id))
        if scan.collections_mode == "per_collection":
            await db.execute(update(SavedCollection).where(
                SavedCollection.session_id == session.id, SavedCollection.listed_scan_id == scan.id
            ).values(last_seen_scan_id=scan.id).execution_options(synchronize_session="fetch"))
    else:
        await db.execute(delete(SavedTarget).where(SavedTarget.scan_id == scan.id))
        scan.items = 0
        if outcome == "blocked":
            await _pause_24h(db, session, now)
    await db.flush()
    return FinishResult(scan.status, scan.items)


async def _pause_24h(db: AsyncSession, session: Session, now: datetime) -> None:
    """AC-C13: `cleanup_paused_until` ve `paused_until` -> now+24 sa (daha uzun mevcut duraklatma kısaltılmaz)."""
    await lock_session(db, session)
    until = now + BLOCK_PAUSE
    if session.cleanup_paused_until is None or session.cleanup_paused_until < until:
        session.cleanup_paused_until = until
        session.cleanup_paused_reason = "blocked"
    if session.paused_until is None or session.paused_until < until:
        session.paused_until = until
        session.paused_reason = BLOCK_PAUSE_REASON
    await db.flush()


# ── Koruma bağlamı (AC-S21) ─────────────────────────────────────────────────────

async def protection_context(db: AsyncSession, scan_id: int | None) -> tuple[str, frozenset[str]]:
    """`protection_context(scan_id) -> (mode, allow)`. Tarama satırı yoksa ya da kod düzeyi F ise `('all_protected', ∅)`.
    W: `allow = {korumasız ∧ last_seen_scan_id ≥ scan_id}` (bilinen kimlik, R6 M-3). Koruma ayarı her çağrıda güncel okunur."""
    if scan_id is None or not COLLECTION_CHOICE_AVAILABLE:
        return "all_protected", frozenset()
    scan = await db.get(CleanupScan, scan_id)
    if scan is None or scan.collections_mode != "per_collection":
        return "all_protected", frozenset()
    rows = (await db.execute(select(SavedCollection.collection_id).where(
        SavedCollection.session_id == scan.session_id, SavedCollection.protected.is_(False),
        SavedCollection.last_seen_scan_id.is_not(None), SavedCollection.last_seen_scan_id >= scan.id))).scalars()
    return "per_collection", frozenset(rows)


def protected_clause(allow: Iterable[str]):
    """AC-S21 SQL: `collections_unreadable OR (coalesce(jsonb_array_length(collection_ids),0) > 0 AND NOT
    (collection_ids <@ allow))`. `collection_ids = NULL` için `false` döner (NULL değil; R7 M1)."""
    allow_json = json.dumps(sorted(set(allow)))
    return or_(
        SavedTarget.collections_unreadable,
        and_(case((func.jsonb_typeof(SavedTarget.collection_ids) == "array",
                   func.jsonb_array_length(SavedTarget.collection_ids)), else_=0) > 0,
             not_(SavedTarget.collection_ids.contained_by(cast(bindparam("allow_ids", allow_json), JSONB)))),
    )


# ── Filtre (envanter ve önizleme ortak; AC-S14) ─────────────────────────────────

@dataclass(frozen=True)
class Filters:
    q: str | None = None
    media_type: str | None = None


def parse_filters(q: Any = None, media_type: Any = None, collection_id: Any = None) -> Filters:
    """§4.4 filtre tablosu. Boş/yalnız boşluk/yalnız `@` `q` ile boş `media_type`/`collection_id` "filtre yok".
    `collection_id` (v1.6): desen dışı -> 422 `invalid` (S-25) önce; desenli dolu -> 422 `not_available`."""
    nq: str | None = None
    if q is not None:
        if not isinstance(q, str):
            raise CleanupError("invalid", 422, fields=["q"])
        t = q.strip()
        if t.startswith("@"):
            t = t[1:]
        t = t.lower()
        if t:
            if not _OWNER.fullmatch(t):
                raise CleanupError("invalid", 422, fields=["q"])
            nq = t
    mt: str | None = None
    if media_type is not None and media_type != "":
        if not isinstance(media_type, str) or media_type not in MEDIA_TYPES:
            raise CleanupError("invalid", 422, fields=["media_type"])
        mt = media_type
    if collection_id is not None and collection_id != "":
        if not isinstance(collection_id, str) or not _ID.fullmatch(collection_id):
            raise CleanupError("invalid", 422, fields=["collection_id"])
        raise CleanupError("not_available", 422, fields=["collection_id"])
    return Filters(nq, mt)


def _like_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def filter_conditions(scan_id: int, f: Filters) -> list:
    """Envanter ve önizleme bu fonksiyonu paylaşır; ayrı bir WHERE yazılmaz."""
    conds = [SavedTarget.scan_id == scan_id]
    if f.q:
        conds.append(SavedTarget.owner_username.ilike(f"%{_like_escape(f.q)}%", escape="\\"))
    if f.media_type == "ad":
        conds.append(SavedTarget.is_ad.is_(True))
    elif f.media_type:
        conds.append(and_(SavedTarget.media_type == f.media_type, SavedTarget.is_ad.is_(False)))
    return conds


async def count_matching(db: AsyncSession, scan_id: int, f: Filters) -> int:
    return (await db.execute(select(func.count()).select_from(SavedTarget).where(
        *filter_conditions(scan_id, f)))).scalar_one()


async def matching_refs(db: AsyncSession, scan_id: int, f: Filters) -> list[str]:
    """Filtreye uyan tüm `ref`'ler, `position` sırasıyla."""
    return list((await db.execute(select(SavedTarget.media_id).where(*filter_conditions(scan_id, f))
                                  .order_by(SavedTarget.position))).scalars())


# ── Envanter ────────────────────────────────────────────────────────────────────

async def inventory(db: AsyncSession, session: Session, now: datetime, *, q: Any = None, media_type: Any = None,
                    collection_id: Any = None, limit: int = 50, offset: int = 0) -> dict:
    """§7.8 `GET …/saved/inventory`. Satır `state`i: tarama başlangıcından sonra oluşmuş öğenin durumu (`pending` ->
    `queued`), yoksa koruma kuralı (`protected`), yoksa `available` (AC-S15, S16)."""
    f = parse_filters(q, media_type, collection_id)
    if type(limit) is not int or not 1 <= limit <= MAX_PAGE_ITEMS or type(offset) is not int or offset < 0:
        raise CleanupError("invalid", 422, fields=["limit" if not (type(limit) is int and 1 <= limit <= 50)
                                                   else "offset"])
    scan = await current_inventory_scan(db, session.id)
    if scan is None:
        return {"scan": None, "total": 0, "protected_total": 0, "items": []}

    mode, allow = await protection_context(db, scan.id)
    clause = protected_clause(allow)
    conds = filter_conditions(scan.id, f)
    total = (await db.execute(select(func.count()).select_from(SavedTarget).where(*conds))).scalar_one()
    protected_total = (await db.execute(select(func.count()).select_from(SavedTarget).where(
        *conds, clause))).scalar_one()
    rows = (await db.execute(
        select(SavedTarget, clause.label("rule_protected")).where(*conds)
        .order_by(SavedTarget.position).limit(limit).offset(offset))).all()

    refs = [r.SavedTarget.media_id for r in rows]
    states: dict[str, str] = {}
    if refs:
        for ref, st in (await db.execute(
                select(CleanupItem.ref, CleanupItem.status).where(
                    CleanupItem.session_id == session.id, CleanupItem.action == "unsave", CleanupItem.ref.in_(refs),
                    CleanupItem.created_at > scan.started_at, CleanupItem.status.in_(ITEM_STATES))
                .order_by(CleanupItem.id))).all():
            states[ref] = st                                 # en yeni kayıt kazanır
    names: dict[str, str] = {}
    if mode == "per_collection":
        cids = {c for r in rows for c in (r.SavedTarget.collection_ids or [])}
        if cids:
            names = dict((await db.execute(select(SavedCollection.collection_id, SavedCollection.name).where(
                SavedCollection.session_id == session.id, SavedCollection.collection_id.in_(cids)))).all())

    items = []
    for r in rows:
        t = r.SavedTarget
        st = states.get(t.media_id)
        state = ("queued" if st == "pending" else st) if st else ("protected" if r.rule_protected else "available")
        items.append({
            "ref": t.media_id, "shortcode": t.shortcode, "owner_username": t.owner_username,
            "media_type": t.media_type, "is_ad": t.is_ad, "thumbnail_url": t.thumbnail_url,
            "collections": [{"collection_id": c, "name": names.get(c) if mode == "per_collection" else None,
                             "protected": c not in allow} for c in (t.collection_ids or [])],
            "position": t.position, "state": state,
        })
    anchor = scan.finished_at or scan.started_at
    return {
        "scan": {"id": scan.id, "status": scan.status, "started_at": scan.started_at,
                 "finished_at": scan.finished_at, "items": scan.items, "partial": scan.status == "partial",
                 "stale": now - anchor > INVENTORY_MAX_AGE, "collections_mode": scan.collections_mode},
        "total": total, "protected_total": protected_total, "items": items,
    }


# ── Bakım: takılı tarama / parti, saklama (AC-C32, C44) ─────────────────────────

def _page_delay_max(limits) -> int:
    return scan_config(limits).page_delay[1]


async def fail_stale_scans(db: AsyncSession, now: datetime, *, limits=None, session_id=None) -> int:
    """Takılma eşiğini aşan `running` taramalar -> `failed` (satırları silinir). Güncelleme koşulludur (I-6)."""
    lim = limits if limits is not None else get_limits()
    cutoff = now - timedelta(seconds=scan_stale_threshold_s(_page_delay_max(lim)))
    ref = func.coalesce(CleanupScan.last_page_at, CleanupScan.started_at)
    q = select(CleanupScan.id).where(CleanupScan.kind == KIND, CleanupScan.status == "running", ref < cutoff)
    if session_id is not None:
        q = q.where(CleanupScan.session_id == session_id)
    failed = 0
    for sid in list((await db.execute(q)).scalars()):
        res = await db.execute(update(CleanupScan).where(
            CleanupScan.id == sid, CleanupScan.status == "running", ref < cutoff
        ).values(status="failed", finished_at=now).execution_options(synchronize_session="fetch"))
        if res.rowcount:
            await db.execute(delete(SavedTarget).where(SavedTarget.scan_id == sid))
            failed += 1
    if failed:
        await db.flush()
    return failed


@dataclass(frozen=True)
class StaleCandidate:
    id: int
    risk_profile: str
    stale_after_s: int | None


async def stale_batch_candidates(db: AsyncSession, now: datetime) -> list[StaleCandidate]:
    """Ön süzme (N-5): `coalesce(last_seen_at, started_at) < now − 600 sn`. T_eff sonra, parti başına hesaplanır."""
    rows = (await db.execute(
        select(CleanupBatch.id, Session.risk_profile, CleanupBatch.stale_after_s)
        .join(Session, Session.id == CleanupBatch.session_id)
        .where(CleanupBatch.status == "running",
               func.coalesce(CleanupBatch.last_seen_at, CleanupBatch.started_at) < now - timedelta(seconds=STALE_FLOOR_S))
    )).all()
    return [StaleCandidate(r[0], r[1], r[2]) for r in rows]


async def stop_batch_if_stale(db: AsyncSession, batch_id: int, cutoff: datetime, now: datetime) -> bool:
    """Koşullu UPDATE (I-6): `WHERE status='running' AND coalesce(last_seen_at, started_at) < cutoff`. Aday seçildikten sonra
    gelen `start`/`next`/`precheck`/`stop` değişikliğini ezmez."""
    res = await db.execute(update(CleanupBatch).where(
        CleanupBatch.id == batch_id, CleanupBatch.status == "running",
        func.coalesce(CleanupBatch.last_seen_at, CleanupBatch.started_at) < cutoff
    ).values(status="stopped", last_stop_reason="stale").execution_options(synchronize_session="fetch"))
    return bool(res.rowcount)


async def stop_stale_batches(db: AsyncSession, now: datetime, *, limits=None) -> int:
    """AC-C44: `now − coalesce(last_seen_at, started_at) > T_eff`, `T_eff = max(T_güncel, batch.stale_after_s)`,
    `T = max(600, 2 × delay_max + 120)`; `delay_max` profilin etkin değeridir (sert tavana kırpılmış)."""
    lim = limits if limits is not None else get_limits()
    stopped = 0
    for c in await stale_batch_candidates(db, now):
        dmax = compute_effective(lim.values, c.risk_profile, 0.0).delay_max
        t_eff = max(stale_threshold_s(dmax), c.stale_after_s or 0)
        if await stop_batch_if_stale(db, c.id, now - timedelta(seconds=t_eff), now):
            stopped += 1
    if stopped:
        await db.flush()
    return stopped


async def run_retention(db: AsyncSession, now: datetime) -> dict[str, int]:
    """Günlük `cleanup_retention` (AC-C32): 7 gün kuralı (AC-C23), 1 günden eski `expired`/`cancelled` taslaklar,
    tür başına son 20 dışındaki tarama satırları, 48 saatten eski yazma izinleri. İdempotenttir."""
    out = {"batches_expired": 0, "drafts_deleted": 0, "scans_deleted": 0, "grants_deleted": 0}

    # 7 gün kuralı: coalesce(last_progress_at, started_at, confirmed_at) 7 günü aşan etkin parti -> expired.
    ref = func.coalesce(CleanupBatch.last_progress_at, CleanupBatch.started_at, CleanupBatch.confirmed_at)
    cutoff = now - BATCH_DEAD_AFTER
    for bid, sid in (await db.execute(select(CleanupBatch.id, CleanupBatch.session_id).where(
            CleanupBatch.status.in_(ACTIVE_BATCH), ref < cutoff))).all():
        res = await db.execute(update(CleanupBatch).where(
            CleanupBatch.id == bid, CleanupBatch.status.in_(ACTIVE_BATCH), ref < cutoff
        ).values(status="expired", finished_at=now).execution_options(synchronize_session="fetch"))
        if not res.rowcount:
            continue
        out["batches_expired"] += 1
        pend = (await db.execute(select(CleanupItem.id, CleanupItem.ref, CleanupItem.label).where(
            CleanupItem.batch_id == bid, CleanupItem.status == "pending"))).all()
        if pend:
            await db.execute(update(CleanupItem).where(CleanupItem.id.in_([p[0] for p in pend]),
                                                       CleanupItem.status == "pending")
                             .values(status="cancelled", done_at=now).execution_options(synchronize_session="fetch"))
            db.add_all([ActionLog(session_id=sid, ig_user_id=None, action_type="unsave", status="cancelled",
                                  target_ref=p[1], target_label=p[2], created_at=now) for p in pend])

    # Onaylanmamış (taslak) expired/cancelled partiler 1 gün sonra silinir; onaylanmış geçmiş kalır.
    res = await db.execute(delete(CleanupBatch).where(
        CleanupBatch.status.in_(("expired", "cancelled")), CleanupBatch.confirmed_at.is_(None),
        CleanupBatch.expires_at < now - DRAFT_RETENTION).execution_options(synchronize_session="fetch"))
    out["drafts_deleted"] = res.rowcount or 0

    # Tür başına son 20 tarama. Spec sapması, main session onaylı: güncel envanter taraması ayrıca korunur
    # (20'den fazla başarısız tarama birikirse envanter sessizce yok olmasın).
    ranked = select(CleanupScan.id, func.row_number().over(
        partition_by=(CleanupScan.session_id, CleanupScan.kind),
        order_by=(CleanupScan.started_at.desc(), CleanupScan.id.desc())).label("rn")).subquery()
    old_ids = set((await db.execute(select(ranked.c.id).where(ranked.c.rn > KEEP_SCANS))).scalars())
    if old_ids:
        inv_ids = set((await db.execute(
            select(CleanupScan.id).where(CleanupScan.status.in_(("ok", "partial")))
            .distinct(CleanupScan.session_id, CleanupScan.kind)
            .order_by(CleanupScan.session_id, CleanupScan.kind, CleanupScan.started_at.desc(), CleanupScan.id.desc())
        )).scalars())
        victims = old_ids - inv_ids
        if victims:
            res = await db.execute(delete(CleanupScan).where(CleanupScan.id.in_(victims))
                                   .execution_options(synchronize_session="fetch"))
            out["scans_deleted"] = res.rowcount or 0

    res = await db.execute(delete(CleanupWriteGrant).where(
        CleanupWriteGrant.granted_at < now - GRANT_RETENTION).execution_options(synchronize_session="fetch"))
    out["grants_deleted"] = res.rowcount or 0
    await db.flush()
    return out
