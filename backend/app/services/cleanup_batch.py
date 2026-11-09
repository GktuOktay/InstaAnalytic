"""Kaydedilenleri temizleme: önizleme, onay, parti durum makinesi (SPEC-001 T-4b).

Kapsam (servis katmanı; router T-5, `next`/`precheck`/`result` T-4c):
- Koruma kuralı (AC-S21, Python kolu): `is_protected`. SQL kolu `cleanup_scan.protected_clause`; ikisi de
  `tests/fixtures/is_protected_cases.json` tablosuna karşı koşar (eklenti T-10a'da aynı dosyayı okur).
- Önizleme (AC-C5, C8, C9, C39, S5, S9..S11, S14, S16, U7): `preview`, `batch_items`. Filtre ve sıralama
  T-4a'nın `parse_filters`/`matching_refs`/`protection_context`/`protected_clause` fonksiyonlarıdır (ayrı WHERE yok, AC-S14).
- Onay (§7.6; AC-C6, C7, C8, C22): `confirm`.
- Parti durum makinesi (§6.8; AC-C23, C40, C44, C45, C49, C50, C57): `start_batch`, `stop_batch`, `cancel_batch`,
  `halt_batch` (sunucu tarafı durdurma, T-4c'nin kapı reddi/engel/429 yolları), `complete_if_drained`
  (son pending terminale geçince `done`), `stop_stale_for_session`, `expire_drafts` (draft -> expired, 30 dk).
- Öğe durum makinesinin saf yarısı: `ITEM_TRANSITIONS`/`item_transition_allowed`/`cancelled_result_decision`
  (T-4c `result` bunları kullanır). Öğeyi `result` ile ilerleten kod T-4c'dedir.

Kurallar (T-4a ile aynı):
- Saat enjekte edilir (`now`); bu dosyada gerçek saat okunmaz.
- Servisler `flush` eder, `commit` etmez. Hatalar `CleanupError` ile gelir (kod/HTTP durumu §7.9.2). Hata gövdesine
  istemci girdisi yansıtılmaz (`fields` yalnız bilinen alan adlarıdır).
- Sıcak yol (preview, confirm, start, stop, cancel) hiçbir DELETE çalıştırmaz.
- `preview` profil kilidi ALMAZ (AC-C47 listesinde yok): eşzamanlı iki önizleme taslak kısmi benzersiz indeksinde
  çakışır ve `UniqueViolation` 409 `batch_active`'e çevrilir (AC-C5, I-13, N-6).
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable

from sqlalchemy import exists, func, not_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_log import ActionLog
from app.models.cleanup import CleanupBatch, CleanupItem, SavedCollection, SavedTarget
from app.models.notification import Notification
from app.models.session import Session
from app.services import cleanup_limits as cl
from app.services.cleanup_gate import (
    budget_state, cleanup_gate, compute_effective, estimate, lock_session, ramp_age_hours,
)
from app.services.cleanup_limits import get_limits, hard_cap
from app.services.cleanup_scan import (
    ACTIVE_BATCH, INVENTORY_MAX_AGE, ITEM_STATES, KIND, CleanupError, Filters, current_inventory_scan,
    matching_refs, parse_filters, protected_clause, protection_context, stale_threshold_s, stop_batch_if_stale,
)

log = logging.getLogger("cleanup_batch")

DRAFT_TTL = timedelta(minutes=30)                      # §6.8: draft -> expired
LATE_RESULT_WINDOW = timedelta(seconds=120)            # AC-C23
MAX_EXCLUDE_REFS = 5000                                # AC-S11
MAX_PAGE = 50

_ID = re.compile(r"[0-9]{1,25}")
_VERSION = re.compile(r"[0-9]{1,4}(\.[0-9]{1,4}){0,3}")
_PREVIEW_KEYS = frozenset({"scan_id", "select", "refs", "filter", "exclude_refs"})
_FILTER_KEYS = frozenset({"q", "media_type", "collection_id"})

# §7.9.3 durdurma nedenleri
STOP_REASONS = frozenset({
    "user_stop", "limit", "quiet_hours", "off", "paused", "blocked", "rate_limited", "circuit_breaker",
    "account_mismatch", "extension_outdated", "login_required", "tokens_missing", "mutation_unrecognised",
    "already_streak", "tab_closed", "stale", "start_failed", "read_limit",
})
ITEM_STATUSES = ("pending", "done", "already", "not_found", "protected", "failed", "cancelled")


class InvalidTransition(ValueError):
    """§6.8 tablosu dışı geçiş (AC-C23). Programlama hatasıdır; API kodu değildir."""


# ── Koruma kuralı (AC-S21, Python kolu) ─────────────────────────────────────────

def is_protected(collection_ids: Iterable[str] | None, collections_unreadable: bool, allow: Iterable[str]) -> bool:
    """`korunur ⇔ collections_unreadable ∨ (collection_ids ≠ [] ∧ collection_ids ⊄ allow)`.
    `collection_ids = None` (taramada alan yoktu) envanterde korunmaz; karar taze okumadadır. Liste olmayan değer
    fail-closed korunur."""
    if collections_unreadable:
        return True
    if collection_ids is None:
        return False
    if not isinstance(collection_ids, (list, tuple, set, frozenset)):
        return True
    ids = set(collection_ids)
    return bool(ids) and not ids <= set(allow)


async def batch_protection_context(db: AsyncSession, batch: CleanupBatch) -> tuple[str, frozenset[str]]:
    """R6 M-2: parti bağlamı partinin `scan_id`'sidir (güncel envanter değil). Tarama satırı yoksa mod F."""
    return await protection_context(db, batch.scan_id)


# ── Durum makineleri (§6.8; AC-C23) ─────────────────────────────────────────────

ITEM_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {("pending", d) for d in ("pending", "done", "already", "not_found", "protected", "failed", "cancelled")}
    | {("cancelled", "done")})

BATCH_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ("draft", "confirmed"), ("draft", "cancelled"), ("draft", "expired"),
    ("confirmed", "running"), ("confirmed", "cancelled"), ("confirmed", "expired"),
    ("running", "stopped"), ("running", "done"), ("running", "cancelled"), ("running", "expired"),
    ("stopped", "running"), ("stopped", "done"), ("stopped", "cancelled"), ("stopped", "expired"),
})


def item_transition_allowed(src: str, dst: str) -> bool:
    """Öğe tablosu: `pending` kendine (yeniden deneme) ve tüm terminallere; tek geri dönüş `cancelled -> done`."""
    return (src, dst) in ITEM_TRANSITIONS


def check_batch_transition(src: str, dst: str) -> None:
    if (src, dst) not in BATCH_TRANSITIONS:
        raise InvalidTransition(f"{src} -> {dst}")


def cancelled_result_decision(prechecked_at: datetime | None, now: datetime) -> str:
    """AC-C23: iptal edilmiş öğeye `done` gelirse `prechecked_at` son 120 sn (sınır dahil) içindeyse 'done',
    değilse (izin damgası hiç yoksa dahi) durum değişmez ve `cleanup_anomaly(late_result)` yazılır: 'late_result'."""
    if prechecked_at is not None and timedelta(0) <= now - prechecked_at <= LATE_RESULT_WINDOW:
        return "done"
    return "late_result"


def _move(batch: CleanupBatch, dst: str) -> None:
    check_batch_transition(batch.status, dst)
    batch.status = dst


# ── Yardımcılar ─────────────────────────────────────────────────────────────────

def _require_enabled(session: Session) -> None:
    if not session.allow_unsave:
        raise CleanupError("feature_off", 403)


def max_items(limits=None) -> int:
    """Parti tavanı: ayar dosyası değeri, sert tavana (500) kırpılmış (AC-C9)."""
    lim = limits if limits is not None else get_limits()
    lo, hi = hard_cap("batch.max_items")
    try:
        v = lim.values["batch.max_items"]
        if type(v) is bool or not isinstance(v, (int, float)) or v != v:
            raise ValueError
        v = int(v)
    except Exception:                                  # noqa: BLE001  (bozuk değer: varsayılan)
        v = int(cl.DEFAULTS["batch.max_items"])
    return int(min(max(v, lo), hi))


def make_label(owner_username: str | None, shortcode: str) -> str:
    """`@sahip · kısa kod` (§6.7); sahip yoksa yalnız kısa kod."""
    return f"@{owner_username} · {shortcode}" if owner_username else shortcode


def _ver(v: str) -> tuple[int, ...]:
    parts = [int(x) for x in v.split(".")]
    return tuple(parts + [0] * (4 - len(parts)))


async def _batch_for(db: AsyncSession, session: Session, batch_id: Any, *, lock: bool = False) -> CleanupBatch:
    """IDOR: `id AND session_id`; başkasının ya da olmayan parti 404."""
    if type(batch_id) is not int:
        raise CleanupError("not_found", 404)
    q = select(CleanupBatch).where(CleanupBatch.id == batch_id, CleanupBatch.session_id == session.id,
                                   CleanupBatch.kind == KIND)
    if lock:
        q = q.with_for_update()
    b = (await db.execute(q)).scalar_one_or_none()
    if b is None:
        raise CleanupError("not_found", 404)
    return b


async def _active_batch_id(db: AsyncSession, session: Session) -> int | None:
    return (await db.execute(select(CleanupBatch.id).where(
        CleanupBatch.session_id == session.id, CleanupBatch.kind == KIND, CleanupBatch.status.in_(ACTIVE_BATCH)
    ).limit(1))).scalar_one_or_none()


async def record_anomaly(db: AsyncSession, session_id, note_code: str, batch_id: int | None, now: datetime) -> None:
    """`cleanup_anomaly` bildirimi (§7.8). Ham girdi taşımaz; yalnız kod ve parti numarası. T-4c da kullanır."""
    db.add(Notification(session_id=session_id, kind="cleanup_anomaly", level="warning",
                        params={"note_code": note_code, "batch_id": batch_id}, link=None, created_at=now))
    await db.flush()


# ── Taslak süresi ve takılı parti ───────────────────────────────────────────────

async def expire_drafts(db: AsyncSession, now: datetime, *, session_id=None) -> int:
    """§6.8: `draft -> expired`, `expires_at <= now` (30 dk). Koşullu UPDATE; idempotent. Zamanlanmış görev ve
    preview/confirm yolu çağırır."""
    q = update(CleanupBatch).where(CleanupBatch.status == "draft", CleanupBatch.expires_at <= now)
    if session_id is not None:
        q = q.where(CleanupBatch.session_id == session_id)
    res = await db.execute(q.values(status="expired", finished_at=now).execution_options(synchronize_session="fetch"))
    n = res.rowcount or 0
    if n:
        await db.flush()
    return n


async def stop_stale_for_session(db: AsyncSession, session: Session, now: datetime, *, limits=None) -> bool:
    """AC-C44: `status`, `start`, `preview`, `cancel`, `next` ve `precheck` işlem başında çağırır. Profilin `running` partisi
    `now − coalesce(last_seen_at, started_at) > T_eff` ise `stopped(stale)` (koşullu UPDATE, I-6).
    `T_eff = max(T_güncel, batch.stale_after_s)`; `T = max(600, 2 × delay_max + 120)`."""
    row = (await db.execute(select(CleanupBatch.id, CleanupBatch.stale_after_s).where(
        CleanupBatch.session_id == session.id, CleanupBatch.kind == KIND, CleanupBatch.status == "running"
    ).limit(1))).first()
    if row is None:
        return False
    lim = limits if limits is not None else get_limits()
    dmax = compute_effective(lim.values, session.risk_profile, 0.0).delay_max
    t_eff = max(stale_threshold_s(dmax), row[1] or 0)
    stopped = await stop_batch_if_stale(db, row[0], now - timedelta(seconds=t_eff), now)
    if stopped:
        await db.flush()
    return stopped


# ── Önizleme (AC-C5, C8, C9, C39, S5, S9..S11, S14, S16, U7) ────────────────────

@dataclass(frozen=True)
class _PreviewReq:
    scan_id: int
    select: str
    refs: tuple[str, ...]
    filters: Filters
    exclude: frozenset[str]


def _id_list(v: Any, field: str, cap: int) -> list[str]:
    if not isinstance(v, (list, tuple)):
        raise CleanupError("invalid", 422, fields=[field])
    if len(v) > cap:
        raise CleanupError("invalid_selection", 422)
    for x in v:
        if type(x) is not str or not _ID.fullmatch(x):
            raise CleanupError("invalid", 422, fields=[field])
    return list(v)


def _parse_preview(payload: Any, mx: int) -> _PreviewReq:
    """AC-S11. Sıra: şekil -> scan_id -> mod -> karışık mod -> liste tavanı -> eleman biçimi."""
    if not isinstance(payload, dict) or set(payload) - _PREVIEW_KEYS:
        raise CleanupError("invalid", 422, fields=["body"])
    sid = payload.get("scan_id")
    if type(sid) is not int or sid < 1:
        raise CleanupError("invalid", 422, fields=["scan_id"])
    mode = payload.get("select")
    if mode not in ("refs", "filter"):
        raise CleanupError("invalid", 422, fields=["select"])
    if mode == "refs":
        if "filter" in payload or "exclude_refs" in payload:
            raise CleanupError("invalid_selection", 422)
        if "refs" not in payload:
            raise CleanupError("invalid", 422, fields=["refs"])
        return _PreviewReq(sid, mode, tuple(_id_list(payload["refs"], "refs", mx)), Filters(), frozenset())
    if "refs" in payload:
        raise CleanupError("invalid_selection", 422)
    flt = payload.get("filter", {})
    if not isinstance(flt, dict) or set(flt) - _FILTER_KEYS:
        raise CleanupError("invalid", 422, fields=["filter"])
    f = parse_filters(flt.get("q"), flt.get("media_type"), flt.get("collection_id"))      # 422 invalid / not_available
    ex = _id_list(payload.get("exclude_refs", []), "exclude_refs", MAX_EXCLUDE_REFS)
    return _PreviewReq(sid, mode, (), f, frozenset(ex))


@dataclass(frozen=True)
class PreviewResult:
    batch_id: int | None
    item_count: int
    unknown_refs: int
    excluded: int
    excluded_protected: int
    in_unprotected_collections: int
    truncated: bool
    remaining: int
    expires_at: datetime | None
    estimate: dict


async def _latest_item_states(db: AsyncSession, session: Session, since: datetime) -> dict[str, str]:
    """Tarama başlangıcından sonra oluşmuş öğelerin ref -> durum (en yeni kayıt kazanır; envanterle aynı kural)."""
    out: dict[str, str] = {}
    for r, st in (await db.execute(
            select(CleanupItem.ref, CleanupItem.status).where(
                CleanupItem.session_id == session.id, CleanupItem.action == "unsave",
                CleanupItem.created_at > since, CleanupItem.status.in_(ITEM_STATES))
            .order_by(CleanupItem.id))).all():
        out[r] = st
    return out


async def preview(db: AsyncSession, session: Session, payload: Any, now: datetime, *, limits=None) -> PreviewResult:
    """§7.8 `POST …/saved/preview`. Kuru çalıştırmadır: yalnız `draft` parti + `plan_refs` yazar, `cleanup_items` yazmaz.

    Sıra: özellik açık -> şekil (422) -> süresi dolan taslaklar -> takılı parti -> etkin parti (409 `batch_active`) ->
    envanter (`no_scan` / `scan_mismatch` / `scan_stale`) -> aday küme -> §6.7 ve koruma dışlamaları -> tavan ->
    (öğe > 0 ise) önceki taslaklar `cancelled` + yeni taslak, aynı işlemde (K-1)."""
    _require_enabled(session)
    lim = limits if limits is not None else get_limits()
    mx = max_items(lim)
    req = _parse_preview(payload, mx)

    await expire_drafts(db, now, session_id=session.id)
    await stop_stale_for_session(db, session, now, limits=lim)
    if await _active_batch_id(db, session) is not None:
        raise CleanupError("batch_active", 409)

    inv = await current_inventory_scan(db, session.id)
    if inv is None:
        raise CleanupError("no_scan", 409)
    if inv.id != req.scan_id:
        raise CleanupError("scan_mismatch", 409)
    if now - (inv.finished_at or inv.started_at) > INVENTORY_MAX_AGE:
        raise CleanupError("scan_stale", 409)

    mode, allow = await protection_context(db, inv.id)
    ordered = await matching_refs(db, inv.id, req.filters)                       # AC-S14: envanterle aynı fonksiyon
    unknown = 0
    if req.select == "refs":
        wanted = set(req.refs)
        candidates = [r for r in ordered if r in wanted]
        unknown = len(wanted) - len(candidates)
    else:
        candidates = [r for r in ordered if r not in req.exclude]

    rule_protected = set((await db.execute(select(SavedTarget.media_id).where(
        SavedTarget.scan_id == inv.id, protected_clause(allow)))).scalars())
    states = await _latest_item_states(db, session, inv.started_at)

    eligible: list[str] = []
    excluded = excluded_protected = 0
    for r in candidates:
        st = states.get(r)
        if st is not None:                                  # §6.7: işlenmiş ya da kuyrukta
            excluded += 1
            excluded_protected += st == "protected"
        elif r in rule_protected:                           # §6.10 / AC-S21
            excluded += 1
            excluded_protected += 1
        else:
            eligible.append(r)

    plan = eligible[:mx]
    remaining = len(eligible) - len(plan)
    in_unprotected = 0
    if plan:
        in_unprotected = sum(1 for cids in (await db.execute(select(SavedTarget.collection_ids).where(
            SavedTarget.scan_id == inv.id, SavedTarget.media_id.in_(plan)))).scalars() if cids)
    est = estimate(len(plan), lim.values, session.risk_profile, ramp_age_hours(session, now))

    if not plan:
        return PreviewResult(None, 0, unknown, excluded, excluded_protected, 0, False, 0, None, est)

    await db.execute(update(CleanupBatch).where(
        CleanupBatch.session_id == session.id, CleanupBatch.kind == KIND, CleanupBatch.status == "draft"
    ).values(status="cancelled", finished_at=now).execution_options(synchronize_session="fetch"))
    selection = ({"select": "refs", "requested": len(req.refs)} if req.select == "refs" else
                 {"select": "filter", "filter": {"q": req.filters.q, "media_type": req.filters.media_type},
                  "exclude_refs": len(req.exclude)})
    batch = CleanupBatch(
        session_id=session.id, kind=KIND, scan_id=inv.id, status="draft", selection=selection, plan_refs=plan,
        item_count=len(plan), max_items_at_preview=mx, run_seq=0, created_at=now, expires_at=now + DRAFT_TTL)
    try:
        async with db.begin_nested():                       # eşzamanlı ikinci taslak: UniqueViolation -> 409 (I-13)
            db.add(batch)
            await db.flush()
    except IntegrityError:
        raise CleanupError("batch_active", 409) from None
    return PreviewResult(batch.id, len(plan), unknown, excluded, excluded_protected, in_unprotected,
                         remaining > 0, remaining, batch.expires_at, est)


# ── Parti öğe listesi (§7.8; K-22) ──────────────────────────────────────────────

async def batch_items(db: AsyncSession, session: Session, batch_id: Any, *, status: str | None = None,
                      limit: Any = 50, offset: Any = 0) -> dict:
    """`GET …/batches/{id}/items`. `draft`ta `plan_refs`'ten (durum `pending`), sonra `cleanup_items`'tan.
    W modunda satır başına koleksiyon adları (aynı adlı koleksiyonlarda kimliğin son 4 hanesi, R6 L-7); F'de `[]`.
    Bağlam partinin `scan_id`'sidir (R6 M-2)."""
    if type(limit) is not int or not 1 <= limit <= MAX_PAGE:
        raise CleanupError("invalid", 422, fields=["limit"])
    if type(offset) is not int or offset < 0:
        raise CleanupError("invalid", 422, fields=["offset"])
    if status is not None and status not in ITEM_STATUSES:
        raise CleanupError("invalid", 422, fields=["status"])
    batch = await _batch_for(db, session, batch_id)

    rows: list[tuple[str, str | None, str]] = []              # (ref, label, status)
    if batch.status == "draft":
        plan = list(batch.plan_refs or [])
        total = len(plan) if status in (None, "pending") else 0
        if total:
            rows = [(r, None, "pending") for r in plan[offset:offset + limit]]
    else:
        conds = [CleanupItem.batch_id == batch.id]
        if status is not None:
            conds.append(CleanupItem.status == status)
        total = (await db.execute(select(func.count()).select_from(CleanupItem).where(*conds))).scalar_one()
        rows = [(r[0], r[1], r[2]) for r in (await db.execute(
            select(CleanupItem.ref, CleanupItem.label, CleanupItem.status).where(*conds)
            .order_by(CleanupItem.id).limit(limit).offset(offset))).all()]

    refs = [r[0] for r in rows]
    targets: dict[str, SavedTarget] = {}
    if refs and batch.scan_id is not None:
        targets = {t.media_id: t for t in (await db.execute(select(SavedTarget).where(
            SavedTarget.scan_id == batch.scan_id, SavedTarget.media_id.in_(refs)))).scalars()}
    mode, _allow = await batch_protection_context(db, batch)
    names: dict[str, str] = {}
    dup: Counter = Counter()
    if mode == "per_collection" and targets:
        allc = (await db.execute(select(SavedCollection.collection_id, SavedCollection.name).where(
            SavedCollection.session_id == session.id))).all()
        names = {c: n for c, n in allc}
        dup = Counter(n for _c, n in allc)

    items = []
    for r, label, st in rows:
        t = targets.get(r)
        colls = []
        if t is not None and mode == "per_collection":
            for cid in t.collection_ids or []:
                nm = names.get(cid)
                if nm is not None:
                    colls.append({"name": nm, "id_suffix": cid[-4:] if dup[nm] > 1 else None})
        items.append({
            "ref": r,
            "label": label if label is not None else (make_label(t.owner_username, t.shortcode) if t else r),
            "status": st,
            "shortcode": t.shortcode if t else None,
            "thumbnail_url": t.thumbnail_url if t else None,
            "collections": colls,
        })
    return {"total": total, "items": items}


# ── Onay (§7.6) ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ConfirmResult:
    batch_id: int
    status: str
    queued: int


async def confirm(db: AsyncSession, session: Session, batch_id: Any, confirm_count: Any, now: datetime, *,
                  limits=None) -> ConfirmResult:
    """Tek işlemde, profil satırı `FOR UPDATE` ile kilitli (§7.6). Sıra: özellik açık -> `confirm_count` türü (422 `invalid`) ->
    sahiplik 404 -> `draft` değilse 409 `not_draft` (beat'in expired yaptığı taslak 410) -> süre 410 -> güncel envanter
    taraması / tavan 409 `plan_changed` -> etkin parti 409 `batch_active` -> sayı 422 `count_mismatch` -> öğeler."""
    _require_enabled(session)
    if type(confirm_count) is not int:
        raise CleanupError("invalid", 422, fields=["confirm_count"])
    lim = limits if limits is not None else get_limits()
    await lock_session(db, session)
    _require_enabled(session)
    batch = await _batch_for(db, session, batch_id, lock=True)

    if batch.status != "draft":
        if batch.status == "expired" and batch.confirmed_at is None:
            raise CleanupError("expired", 410)
        raise CleanupError("not_draft", 409)
    if now >= batch.expires_at:
        raise CleanupError("expired", 410)
    inv = await current_inventory_scan(db, session.id)
    plan = list(batch.plan_refs or [])
    if (batch.scan_id is None or inv is None or inv.id != batch.scan_id or batch.item_count > max_items(lim)
            or len(plan) != batch.item_count):
        raise CleanupError("plan_changed", 409)
    if await _active_batch_id(db, session) is not None:
        raise CleanupError("batch_active", 409)
    if confirm_count != batch.item_count:
        raise CleanupError("count_mismatch", 422)

    targets = {t.media_id: t for t in (await db.execute(select(SavedTarget).where(
        SavedTarget.scan_id == batch.scan_id, SavedTarget.media_id.in_(plan)))).scalars()}
    _move(batch, "confirmed")
    batch.confirmed_at = now
    try:
        async with db.begin_nested():
            db.add_all([CleanupItem(
                session_id=session.id, batch_id=batch.id, action="unsave", ref=r,
                label=make_label(targets[r].owner_username, targets[r].shortcode) if r in targets else r,
                status="pending", created_at=now) for r in plan])
            await db.flush()
    except IntegrityError:
        raise CleanupError("batch_active", 409) from None          # aynı ref başka bir pending öğede (kısmi benzersiz indeks)
    return ConfirmResult(batch.id, batch.status, len(plan))


# ── Başlat / Durdur / İptal (AC-C40, C44, C45, C49, C50, C57) ──────────────────

@dataclass(frozen=True)
class StartResult:
    batch_id: int
    status: str
    run_seq: int
    started_at: datetime


async def start_batch(db: AsyncSession, session: Session, batch_id: Any, ext_version: Any, now: datetime, *,
                      limits=None) -> StartResult:
    """AC-C40, C50, C57. Profil kilidi altında.
    - `running` (takılı değil): 200, değişiklik yok. Takılı `running`: önce `stopped(stale)`, sonra normal kural (R5 L-d).
    - `draft`/`done`/`cancelled`/`expired`: 409 `not_startable`.
    - `stopped_ext_version` doluyken `ext_version` yok ya da ≤ ise 409 `extension_update_required` (AC-C57).
    - Kapı/hazır kuralı sağlanmıyorsa 409 `not_now` + `reason` + `next_allowed_at`.
    - Başarı: `started_at = last_seen_at = now`, `stale_after_s = null`, `run_seq+1`, `last_stop_reason = null`."""
    _require_enabled(session)
    if ext_version is not None and (type(ext_version) is not str or not _VERSION.fullmatch(ext_version)):
        raise CleanupError("invalid", 422, fields=["ext_version"])
    lim = limits if limits is not None else get_limits()
    await lock_session(db, session)
    _require_enabled(session)
    batch = await _batch_for(db, session, batch_id, lock=True)

    if batch.status == "running":
        if await stop_stale_for_session(db, session, now, limits=lim):
            await db.refresh(batch)
        else:
            return StartResult(batch.id, batch.status, batch.run_seq, batch.started_at)
    if batch.status not in ("confirmed", "stopped"):
        raise CleanupError("not_startable", 409)
    if batch.stopped_ext_version and (ext_version is None or _ver(ext_version) <= _ver(batch.stopped_ext_version)):
        raise CleanupError("extension_update_required", 409)

    remaining = (await db.execute(select(func.count()).select_from(CleanupItem).where(
        CleanupItem.batch_id == batch.id, CleanupItem.status == "pending"))).scalar_one()
    if remaining == 0:
        await complete_if_drained(db, batch.id, now)
        raise CleanupError("not_startable", 409)
    reason: str | None
    try:
        reason = await cleanup_gate(db, session, KIND, now, limits=lim, lock=False)
        state = await budget_state(db, session, now, remaining, limits=lim)
        ready, next_at = state.ready, state.next_allowed_at
    except Exception:                                      # noqa: BLE001  (AC-L9: kapı hatası = izin yok)
        log.warning("start_batch gate failed closed")
        reason, ready, next_at = "limit", False, None
    if reason is not None or not ready:
        extra: dict[str, Any] = {"reason": reason or "limit"}
        if next_at is not None:
            extra["next_allowed_at"] = next_at.isoformat()
        raise CleanupError("not_now", 409, **extra)

    _move(batch, "running")
    batch.started_at = now
    batch.last_seen_at = now
    batch.stale_after_s = None
    batch.run_seq = batch.run_seq + 1
    batch.last_stop_reason = None
    await db.flush()
    return StartResult(batch.id, batch.status, batch.run_seq, batch.started_at)


async def halt_batch(db: AsyncSession, batch: CleanupBatch, reason: str, now: datetime, *,
                     ext_version: str | None = None) -> bool:
    """Sunucu tarafı durdurma (kapı reddi, engel, 429, iş durduran sonuç; T-4c) ve `stop`'un uygulama adımı.
    Yalnız `running` -> `stopped(reason)`; başka durumda değişiklik yok (`stopped` iken ilk neden korunur).
    `mutation_unrecognised` durmasında o anki `ext_version` `stopped_ext_version`'a yazılır (AC-C57)."""
    if reason not in STOP_REASONS:
        raise ValueError("unknown stop reason")
    if batch.status != "running":
        return False
    _move(batch, "stopped")
    batch.last_stop_reason = reason
    if reason == "mutation_unrecognised" and ext_version:
        batch.stopped_ext_version = ext_version[:20]
    await db.flush()
    return True


@dataclass(frozen=True)
class StopResult:
    batch_id: int
    status: str
    last_stop_reason: str | None
    applied: bool


def _parse_stop(body: Any) -> tuple[str, int | None, str | None]:
    """H-1 = S-26, I-10: `reason` §7.9.3 enum'u; `extra='forbid'`; `run_seq`'siz gövdede yalnız `user_stop`;
    eklenti nedenleri (`user_stop` dışı, `start_failed` hariç) `run_seq` ve `viewer_id` ister."""
    if not isinstance(body, dict) or set(body) - {"reason", "run_seq", "viewer_id"}:
        raise CleanupError("invalid", 422, fields=["body"])
    reason = body.get("reason")
    if type(reason) is not str or reason not in STOP_REASONS:
        raise CleanupError("invalid", 422, fields=["reason"])
    run_seq = body.get("run_seq")
    if run_seq is not None and (type(run_seq) is not int or run_seq < 0):
        raise CleanupError("invalid", 422, fields=["run_seq"])
    viewer = body.get("viewer_id")
    if viewer is not None and (type(viewer) is not str or not _ID.fullmatch(viewer)):
        raise CleanupError("invalid", 422, fields=["viewer_id"])
    if run_seq is None and reason != "user_stop":
        raise CleanupError("invalid", 422, fields=["run_seq"])
    if reason not in ("user_stop", "start_failed") and viewer is None:
        raise CleanupError("invalid", 422, fields=["viewer_id"])
    return reason, run_seq, viewer


async def stop_batch(db: AsyncSession, session: Session, batch_id: Any, body: Any, now: datetime) -> StopResult:
    """AC-C47, C49, C50. Profil kilidi altında. `applied`: bu çağrı partinin durumunu değiştirdi mi.
    - `running` + `run_seq` yok (arayüz `user_stop`) ya da güncel: `stopped(reason)`.
    - `running` + eski `run_seq`: değişiklik yok; `viewer_id` varsa (eklentiden) `cleanup_anomaly`. Durum, `last_seen_at`
      ve `last_stop_reason` dokunulmaz (R5 L-c).
    - `stopped`/`confirmed`/`draft`/`done`/`cancelled`/`expired`: 200, değişiklik yok (ilk neden korunur)."""
    reason, run_seq, viewer = _parse_stop(body)
    await lock_session(db, session)
    batch = await _batch_for(db, session, batch_id, lock=True)
    if batch.status != "running":
        return StopResult(batch.id, batch.status, batch.last_stop_reason, False)
    if run_seq is not None and run_seq != batch.run_seq:
        if viewer is not None:
            await record_anomaly(db, session.id, "run_seq_mismatch", batch.id, now)
        return StopResult(batch.id, batch.status, batch.last_stop_reason, False)
    await halt_batch(db, batch, reason, now)
    return StopResult(batch.id, batch.status, batch.last_stop_reason, True)


@dataclass(frozen=True)
class CancelResult:
    cancelled: bool
    status: str


async def cancel_batch(db: AsyncSession, session: Session, batch_id: Any, now: datetime, *,
                       limits=None) -> CancelResult:
    """AC-C45, C47. Profil kilidi altında, tek işlem: `running` ise durdurur (`user_stop`), `pending` öğeleri `cancelled`
    yapar (her biri `action_log`'a yazılır; `prechecked_at` korunur, AC-C23), partiyi `cancelled` yapar.
    `draft`/`confirmed`/`stopped` da iptal edilir. `done`/`cancelled`/`expired`: değişiklik yok. Özellik kapalıyken de çalışır."""
    lim = limits if limits is not None else get_limits()
    await lock_session(db, session)
    batch = await _batch_for(db, session, batch_id, lock=True)
    if await stop_stale_for_session(db, session, now, limits=lim):
        await db.refresh(batch)
    if batch.status in ("done", "cancelled", "expired"):
        return CancelResult(False, batch.status)
    if batch.status == "running":
        await halt_batch(db, batch, "user_stop", now)
    pend = (await db.execute(select(CleanupItem.id, CleanupItem.ref, CleanupItem.label).where(
        CleanupItem.batch_id == batch.id, CleanupItem.status == "pending").order_by(CleanupItem.id))).all()
    if pend:
        await db.execute(update(CleanupItem).where(
            CleanupItem.id.in_([p[0] for p in pend]), CleanupItem.status == "pending"
        ).values(status="cancelled", done_at=now).execution_options(synchronize_session="fetch"))
        db.add_all([ActionLog(session_id=session.id, ig_user_id=None, action_type="unsave", status="cancelled",
                              target_ref=p[1], target_label=p[2], created_at=now) for p in pend])
    _move(batch, "cancelled")
    batch.finished_at = now
    await db.flush()
    return CancelResult(True, batch.status)


async def complete_if_drained(db: AsyncSession, batch_id: int, now: datetime) -> bool:
    """§6.8: `running`/`stopped` partide son `pending` öğe terminale geçince `done`. Koşullu UPDATE (idempotent);
    T-4c `result` sonrası çağırır."""
    pending = exists().where(CleanupItem.batch_id == CleanupBatch.id, CleanupItem.status == "pending")
    res = await db.execute(update(CleanupBatch).where(
        CleanupBatch.id == batch_id, CleanupBatch.status.in_(("running", "stopped")), not_(pending)
    ).values(status="done", finished_at=now).execution_options(synchronize_session="fetch"))
    done = bool(res.rowcount)
    if done:
        await db.flush()
    return done
