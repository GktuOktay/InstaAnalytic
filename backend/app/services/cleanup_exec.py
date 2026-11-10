"""Kaydedilenleri temizleme: yürütme uçlarının servis katmanı (SPEC-001 T-4c).

Kapsam (router T-5):
- `next_items` (AC-C2, C40, C44, C49, C53, C57, S21, S23): çalışan partinin sıradaki öğeleri + `allow_collections`.
- `precheck` (AC-C14, C15, C26, C47, C48, C49, S23): profil kilidi altında kapı, koruma yeniden denetimi, `too_soon`,
  izin damgası ve `cleanup_write_grants` satırı (R7 M5).
- `report_result` (AC-C13, C17, C19, C23, C46, C49, C50, C52, C53, S16, S17): öğe durum makinesi, hata sınıfları
  (§7.9.4 tek tablo = `classify_failure`), 24 sa engel duraklatması, 429, okuma bütçesi, denetim kaydı.
- `read_budget` / `read_cap` (AC-C53): okuma bütçesi tek tanımı (`already`, `not_found`, `protected`; kayan 60 dk).
- `set_saved_enabled` (AC-C35): özelliği açma/kapama ve `cleanup_setting` denetim satırı.
- `halt_running_batch`: T-5'in `scan/start` 409 yolları gibi uç noktalarda "çalışan partiyi durdur" için.

Kurallar (T-4a/T-4b ile aynı):
- Saat enjekte edilir (`now`); bu dosyada gerçek saat okunmaz.
- Servisler `flush` eder; çağıran işlemi kapatır. TEK İSTİSNA: sunucunun partiyi durdurup sonra 409 fırlattığı yollar
  (`account_mismatch`, `viewer_unknown`, `extension_outdated`, `extension_update_required`). Bu durmanın hata
  yanıtına rağmen kalıcı olması gerektiğinden (AC-C4, C37, C57) fırlatmadan önce `commit` edilir; çağıran bu hatalarda
  `rollback` etse de durum korunur.
- Hata gövdesine istemci girdisi yansıtılmaz (`fields` yalnız alan adlarıdır).
- `next`, `precheck`, `result` hiçbir DELETE çalıştırmaz (AC-C32).
- `run_seq` uyuşmazlığı partinin durumunu, `last_seen_at`'ini ve `last_stop_reason`'ını değiştirmez (AC-C49, R5 L-c).
- `viewer_id` ve `ext_version` denetimi de burada yapılır (hata öncesi sunucu tarafı durdurma partiyle birlikte
  atomik olsun diye); T-5 yalnız biçim doğrulamasını (pydantic) ekler.
"""
from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_log import ActionLog
from app.models.cleanup import CleanupBatch, CleanupItem
from app.models.notification import Notification
from app.models.session import Session
from app.services import cleanup_limits as cl
from app.services.cleanup_batch import (
    _ID, _VERSION, _batch_for, _ver,
    cancelled_result_decision, complete_if_drained, halt_batch, is_protected, item_transition_allowed,
    record_anomaly, stop_stale_for_session,
)
from app.services.cleanup_gate import (
    READ_STATUSES, ReadBudget, cleanup_gate, compute_effective, lock_session, ramp_age_hours, read_budget, read_cap,
    record_grant,
)  # noqa: F401  (okuma bütçesi artık cleanup_gate'te; buradan da erişilir)
from app.services.cleanup_scan import (
    BLOCK_PAUSE, KIND, CleanupError, _pause_24h, protection_context, stale_threshold_s,
)

log = logging.getLogger("cleanup_exec")

MIN_EXT_VERSION = "2.9.0"                                   # AC-C37
HOUR = timedelta(hours=1)
MAX_ATTEMPTS = 3                                            # AC-C19
MAX_NEXT_LIMIT = 10                                         # §7.8 next.limit
MAX_COLLECTION_IDS = 20                                     # §7.8 precheck.collection_ids
RESULT_OUTCOMES = ("done", "already", "not_found", "protected", "failed", "blocked")
MAX_FIELDS = 10
_FIELD = re.compile(r"[a-z_][a-z0-9_]{0,39}")

# §7.9.3 `note_code` kümesi (serbest metin yok, AC-C28)
NOTE_CODES = frozenset({
    "already", "not_found", "in_collection", "collections_unavailable", "http_error", "not_json", "unrecognised_shape",
    "mutation_unrecognised", "login_required", "tokens_missing", "verify_failed", "verify_unavailable", "network",
    "blocked", "rate_limited", "precheck_unavailable", "precheck_missing", "late_result", "account_mismatch",
    "feature_off", "user_stop", "page_cap", "exception",
})
# §7.9.4 A: yeniden denenebilir sınıf
RETRY_NOTES = frozenset({"http_error", "network", "not_json", "unrecognised_shape", "verify_failed",
                         "verify_unavailable", "precheck_unavailable", "exception"})
# §7.9.4 A: iş durduran sınıf (note_code -> durdurma nedeni)
HALT_NOTES = {"login_required": "login_required", "tokens_missing": "tokens_missing",
              "account_mismatch": "account_mismatch", "rate_limited": "rate_limited",
              "mutation_unrecognised": "mutation_unrecognised", "blocked": "blocked"}
_DEFAULT_NOTE = {"already": "already", "not_found": "not_found", "protected": "in_collection"}
_LOG_STATUS = {"done": "success", "already": "skipped", "not_found": "skipped", "protected": "skipped",
               "failed": "failed"}


# ── Saf: hata sınıfı (§7.9.4 tek tablo; AC-C19, C46, S17) ───────────────────────

def classify_failure(note_code: str | None, http_status: int | None) -> tuple[str, str | None]:
    """`failed` sonucunu sınıflar: ('retry'|'halt'|'permanent'|'not_found', durdurma_nedeni|None).
    - İş durduran: `login_required`, `tokens_missing`, `account_mismatch`, `rate_limited`, `mutation_unrecognised`
      (+ `blocked`); `http_error` ile 401 -> login_required, 429 -> rate_limited (HTTP kodunun tek kaynağı bu tablodur).
    - `http_error` ile 404/410 -> not_found (gönderi yok); diğer 4xx -> kalıcı; 5xx/kodsuz -> yeniden denenebilir.
    - Yeniden denenebilir: `network`, `not_json`, `unrecognised_shape`, `verify_failed`, `verify_unavailable`,
      `precheck_unavailable`, `exception` (ve nedensiz `failed`).
    - Diğer her kod kalıcıdır (tekrar denenmez)."""
    if note_code in HALT_NOTES:
        return "halt", HALT_NOTES[note_code]
    if note_code == "http_error" and isinstance(http_status, int) and not isinstance(http_status, bool):
        if http_status == 401:
            return "halt", "login_required"
        if http_status == 429:
            return "halt", "rate_limited"
        if http_status in (404, 410):
            return "not_found", None
        if 400 <= http_status < 500:
            return "permanent", None
        return "retry", None
    if note_code is None or note_code in RETRY_NOTES:
        return "retry", None
    return "permanent", None


# ── Doğrulama yardımcıları (hata gövdesine girdi yansımaz) ──────────────────────

def _bad(*fields: str) -> CleanupError:
    return CleanupError("invalid", 422, fields=list(fields))


def _check_viewer_format(viewer_id: Any) -> None:
    if type(viewer_id) is not str or not _ID.fullmatch(viewer_id):
        raise _bad("viewer_id")


def _check_run_seq(run_seq: Any) -> None:
    if type(run_seq) is not int or run_seq < 0:
        raise _bad("run_seq")


def _check_ext_format(ext_version: Any) -> None:
    if ext_version is not None and (type(ext_version) is not str or not _VERSION.fullmatch(ext_version)):
        raise _bad("ext_version")


def _check_collection_ids(ids: Any) -> list[str]:
    if (type(ids) is not list or len(ids) > MAX_COLLECTION_IDS
            or any(type(x) is not str or not _ID.fullmatch(x) for x in ids)):
        raise _bad("collection_ids")
    return ids


async def _item_for(db: AsyncSession, session: Session, item_id: Any, *, lock: bool = False) -> CleanupItem:
    """IDOR: `id AND session_id`; başkasının ya da olmayan öğe 404."""
    if type(item_id) is not int:
        raise CleanupError("not_found", 404)
    q = select(CleanupItem).where(CleanupItem.id == item_id, CleanupItem.session_id == session.id)
    if lock:
        q = q.with_for_update()
    item = (await db.execute(q)).scalar_one_or_none()
    if item is None:
        raise CleanupError("not_found", 404)
    return item


def _viewer_problem(session: Session, viewer_id: str) -> str | None:
    uid = session.ig_user_id
    if uid is None or uid <= 0:
        return "viewer_unknown"                            # AC-C4
    if str(uid) != viewer_id:
        return "account_mismatch"
    return None


async def _guard(db: AsyncSession, session: Session, batch: CleanupBatch, viewer_id: str, ext_version: str | None,
                 run_seq: int, now: datetime, *, check_ext: bool) -> None:
    """AC-C4, C37: hesap ya da eklenti sürümü uyuşmuyorsa 409; çalışan (ve `run_seq`'i güncel) parti aynı işlemde
    `stopped(account_mismatch | extension_outdated)` olur. Durma kalıcı olsun diye fırlatmadan önce commit edilir."""
    problem = _viewer_problem(session, viewer_id)
    reason = "account_mismatch"
    if problem is None and check_ext and (ext_version is None or _ver(ext_version) < _ver(MIN_EXT_VERSION)):
        problem, reason = "extension_outdated", "extension_outdated"
    if problem is None:
        return
    if batch.status == "running" and run_seq == batch.run_seq:
        await halt_batch(db, batch, reason, now)
    await db.commit()
    raise CleanupError(problem, 409)


async def _check_ext_update(db: AsyncSession, batch: CleanupBatch, ext_version: str | None, now: datetime) -> None:
    """AC-C57 (ikinci katman): `ext_version <= stopped_ext_version` ise 409 `extension_update_required`; çalışan parti
    yeniden `stopped(mutation_unrecognised)` olur. Eski `stopped_ext_version` düşürülmez."""
    if not batch.stopped_ext_version or batch.status not in ("confirmed", "running", "stopped"):
        return
    if ext_version is not None and _ver(ext_version) > _ver(batch.stopped_ext_version):
        return
    if batch.status == "running":
        await halt_batch(db, batch, "mutation_unrecognised", now)
    await db.commit()
    raise CleanupError("extension_update_required", 409)


def _timing(session: Session, lim, now: datetime) -> tuple[tuple[int, int], int]:
    """(gecikme [min, max], T sn). Ayar okunamazsa varsayılanlar (yanıt biçimi bozulmasın; izin kapıdadır, AC-L9)."""
    try:
        eff = compute_effective(lim.values, session.risk_profile, ramp_age_hours(session, now))
    except Exception:                                      # noqa: BLE001
        eff = compute_effective(cl.DEFAULTS, session.risk_profile, ramp_age_hours(session, now))
    return (eff.delay_min, eff.delay_max), stale_threshold_s(eff.delay_max)


async def halt_running_batch(db: AsyncSession, session: Session, reason: str, now: datetime, *,
                             ext_version: str | None = None) -> bool:
    """Profilin `running` partisini `stopped(reason)` yapar (varsa). Çalışan yoksa False; ilk neden korunur."""
    batch = (await db.execute(select(CleanupBatch).where(
        CleanupBatch.session_id == session.id, CleanupBatch.kind == KIND, CleanupBatch.status == "running"
    ).with_for_update().limit(1))).scalar_one_or_none()
    if batch is None:
        return False
    return await halt_batch(db, batch, reason, now, ext_version=ext_version)


# ══ next (AC-C2, C40, C44, C49, C53, C57, S21, S23) ═════════════════════════════

@dataclass(frozen=True)
class NextResult:
    items: list[dict]
    run_seq: int
    delay: tuple[int, int]
    stale_after_ms: int
    allow_collections: list[str]
    reason: str | None           # None | off | paused | quiet_hours | limit | empty | stopped


async def next_items(db: AsyncSession, session: Session, batch_id: Any, run_seq: Any, viewer_id: Any,
                     ext_version: Any, limit: Any, now: datetime, *, limits=None) -> NextResult:
    """`POST …/saved/next`. Sıra: biçim (422) -> profil kilidi -> parti (404) -> hesap/sürüm (409) -> `stale` ->
    `run_seq` çiti (`stopped`, hiçbir şey değişmez) -> `extension_update_required` -> özellik kapalı (`off`) -> parti durumu
    (`done` -> `empty`; running değil -> `stopped`) -> kapı (`paused`/`quiet_hours`/`limit`, parti sunucuda durur) ->
    okuma bütçesi (`limit` + `stopped(read_limit)`) -> bekleyen öğeler (`empty` ise parti `done`)."""
    _check_run_seq(run_seq)
    _check_viewer_format(viewer_id)
    _check_ext_format(ext_version)
    if type(limit) is not int or not 1 <= limit <= MAX_NEXT_LIMIT:
        raise _bad("limit")
    lim = limits if limits is not None else cl.get_limits()
    await lock_session(db, session)
    batch = await _batch_for(db, session, batch_id, lock=True)
    await _guard(db, session, batch, viewer_id, ext_version, run_seq, now, check_ext=True)
    if await stop_stale_for_session(db, session, now, limits=lim):
        await db.refresh(batch)
    delay, t_s = _timing(session, lim, now)

    def reply(reason: str | None, items=(), allow=()) -> NextResult:
        return NextResult(list(items), batch.run_seq, delay, t_s * 1000, sorted(allow), reason)

    running = batch.status == "running"
    if running and run_seq != batch.run_seq:
        return reply("stopped")                            # K-3, L-c: parti ve damgalar değişmez
    await _check_ext_update(db, batch, ext_version, now)
    if not session.allow_unsave:
        if running:
            await halt_batch(db, batch, "off", now)        # AC-C14
        return reply("off")
    if batch.status == "done":
        return reply("empty")
    if not running:
        return reply("stopped")                            # AC-C40: yalnız running parti yürür

    batch.last_seen_at = now                               # AC-C44 (R4 C-1)
    batch.stale_after_s = t_s                              # R4 L-1, I-7, N-4
    reason = await cleanup_gate(db, session, KIND, now, limits=lim, lock=False)
    if reason is not None:
        await halt_batch(db, batch, reason, now)           # R3 High 1: sunucu partiyi kendisi durdurur
        return reply(reason)
    if (await read_budget(db, session, now, limits=lim)).room < 1:
        await halt_batch(db, batch, "read_limit", now)     # AC-C53
        return reply("limit")

    rows = (await db.execute(select(CleanupItem.id, CleanupItem.ref, CleanupItem.label).where(
        CleanupItem.batch_id == batch.id, CleanupItem.status == "pending").order_by(CleanupItem.id).limit(limit))).all()
    if not rows:
        await complete_if_drained(db, batch.id, now)
        return reply("empty")
    _mode, allow = await protection_context(db, batch.scan_id)     # R6 M-2: partinin scan_id'si; F'de boş
    await db.flush()
    return reply(None, [{"id": r[0], "ref": r[1], "label": r[2]} for r in rows], allow)


# ══ precheck (AC-C14, C15, C26, C47, C48, C49, S23) ═════════════════════════════

@dataclass(frozen=True)
class PrecheckResult:
    allow: bool
    item_id: int
    reason: str | None = None    # off | paused | quiet_hours | limit | not_pending | stopped | too_soon | protected
    retry_after: int | None = None


async def precheck(db: AsyncSession, session: Session, item_id: Any, viewer_id: Any, ext_version: Any, run_seq: Any,
                   collection_ids: Any, now: datetime, *, limits=None) -> PrecheckResult:
    """`POST …/items/{id}/precheck`. Profil satırı kilidi altında (AC-C26, C47). Sıra: biçim (422) -> kilit -> öğe/parti
    (404) -> hesap/sürüm (409) -> `stale` -> `not_pending` -> `run_seq` çiti (`stopped`, hiçbir şey değişmez) ->
    `extension_update_required` -> `off` -> parti running değil (`stopped`) -> kapı (`paused`/`quiet_hours`/`limit`;
    parti sunucuda durur) -> koruma yeniden denetimi (`protected`, AC-S23) -> `too_soon` (AC-C48) -> izin:
    `prechecked_at`, `last_allow_at`, `cleanup_write_grants` satırı (R7 M5)."""
    _check_viewer_format(viewer_id)
    _check_run_seq(run_seq)
    _check_ext_format(ext_version)
    ids = _check_collection_ids(collection_ids)
    lim = limits if limits is not None else cl.get_limits()
    await lock_session(db, session)
    item = await _item_for(db, session, item_id, lock=True)
    batch = await _batch_for(db, session, item.batch_id, lock=True)
    await _guard(db, session, batch, viewer_id, ext_version, run_seq, now, check_ext=True)
    if await stop_stale_for_session(db, session, now, limits=lim):
        await db.refresh(batch)

    def deny(reason: str, retry_after: int | None = None) -> PrecheckResult:
        return PrecheckResult(False, item.id, reason, retry_after)

    running = batch.status == "running"
    if item.status != "pending":
        return deny("not_pending")                         # AC-C15
    if running and run_seq != batch.run_seq:
        return deny("stopped")                             # K-3, L-c
    await _check_ext_update(db, batch, ext_version, now)
    if not session.allow_unsave:
        if running:
            await halt_batch(db, batch, "off", now)
        return deny("off")
    if not running:
        return deny("stopped")                             # AC-C40, C47

    batch.last_seen_at = now
    reason = await cleanup_gate(db, session, KIND, now, limits=lim, lock=False)
    if reason is not None:
        await halt_batch(db, batch, reason, now)
        return deny(reason)
    _mode, allow = await protection_context(db, batch.scan_id)
    if is_protected(ids, False, allow):                    # AC-S23: F'de allow=∅
        return deny("protected")
    eff = compute_effective(lim.values, session.risk_profile, ramp_age_hours(session, now))
    if batch.last_allow_at is not None:
        elapsed = (now - batch.last_allow_at).total_seconds()
        if elapsed < eff.delay_min:
            return deny("too_soon", max(1, math.ceil(eff.delay_min - elapsed)))
    item.prechecked_at = now
    batch.last_allow_at = now
    await record_grant(db, session, item.id, now)          # her allow bir satır (AC-C26); flush eder
    return PrecheckResult(True, item.id)


# ══ result (AC-C13, C17, C19, C23, C46, C49, C50, C52, C53, S16, S17) ═══════════

@dataclass(frozen=True)
class ResultReport:
    ok: bool
    status: str                  # öğenin bildirim sonrası durumu
    retry: bool = False
    stopped: bool = False
    paused_until: datetime | None = None


def _check_result(outcome: Any, note_code: Any, http_status: Any, fields: Any) -> None:
    if type(outcome) is not str or outcome not in RESULT_OUTCOMES:
        raise _bad("outcome")
    if note_code is not None and (type(note_code) is not str or note_code not in NOTE_CODES):
        raise _bad("note_code")                            # AC-C28: serbest metin yok
    if outcome == "protected" and note_code != "in_collection":
        raise _bad("note_code")
    if http_status is not None and (type(http_status) is not int or not 100 <= http_status <= 599):
        raise _bad("http_status")
    if fields is not None and (type(fields) is not list or len(fields) > MAX_FIELDS
                               or any(type(f) is not str or not _FIELD.fullmatch(f) for f in fields)):
        raise _bad("fields")


def _audit(session: Session, item: CleanupItem, now: datetime) -> ActionLog:
    """AC-C17: `action_type=unsave`, `target_ref`, `target_label`; `error_msg` yalnız `note_code`."""
    return ActionLog(session_id=session.id, ig_user_id=None, action_type="unsave", status=_LOG_STATUS[item.status],
                     error_msg=item.note_code, target_ref=item.ref, target_label=item.label, created_at=now,
                     executed_at=now if item.status == "done" else None)


async def _pause_for_block(db: AsyncSession, session: Session, now: datetime) -> datetime:
    """AC-C13: 24 sa duraklatma (`cleanup_paused_until` ve `paused_until`) + `actions_blocked` bildirimi (yalnız sayı)."""
    await _pause_24h(db, session, now)
    db.add(Notification(session_id=session.id, kind="actions_blocked", level="error",
                        params={"until": int((now + BLOCK_PAUSE).timestamp())}, link=None, created_at=now))
    await db.flush()
    return session.cleanup_paused_until


async def report_result(db: AsyncSession, session: Session, item_id: Any, viewer_id: Any, run_seq: Any, outcome: Any,
                        now: datetime, *, note_code: Any = None, http_status: Any = None, fields: Any = None,
                        ext_version: str | None = None, limits=None) -> ResultReport:
    """`POST …/items/{id}/result`. Yürütülmüş işlemin sonucu hiçbir koşulda kaybolmaz: `run_seq` uyuşmazlığı ve durmuş
    parti sonucu kaydetmeyi engellemez (anomali + `stopped=true`, M-a). Hesap uyuşmazlığında öğe `pending` kalır.
    `ext_version`: sözleşme gövdesinde yoktur; T-5, `next`/`precheck`'te gördüğü sürümü (Redis) verirse
    `mutation_unrecognised` durması `stopped_ext_version`'ı yazar (AC-C57). Verilmezse yazılmaz."""
    _check_viewer_format(viewer_id)
    _check_run_seq(run_seq)
    _check_result(outcome, note_code, http_status, fields)
    _check_ext_format(ext_version)
    if outcome == "failed" and note_code == "blocked":
        outcome = "blocked"                                # engel her yolda aynı davranış
    await lock_session(db, session)
    item = await _item_for(db, session, item_id, lock=True)
    batch = await _batch_for(db, session, item.batch_id, lock=True)

    problem = _viewer_problem(session, viewer_id)
    if problem is not None:                                # AC-C4: öğe pending kalır, anomali, çalışan parti durur
        await record_anomaly(db, session.id, "account_mismatch", batch.id, now)
        if batch.status == "running" and run_seq == batch.run_seq:
            await halt_batch(db, batch, "account_mismatch", now)
        await db.commit()
        raise CleanupError(problem, 409)

    seq_ok = run_seq == batch.run_seq
    if not seq_ok:
        await record_anomaly(db, session.id, "run_seq_mismatch", batch.id, now)      # M-a
    running = batch.status == "running" and seq_ok
    stopped = not running                                  # M-a: running değilse ya da run_seq eskiyse stopped=true
    if running:
        batch.last_seen_at = now

    st = item.status
    if st == "cancelled":                                  # AC-C23
        paused = None
        if outcome == "done":
            if cancelled_result_decision(item.prechecked_at, now) == "done":
                item.status, item.done_at, item.note_code = "done", now, note_code
                db.add(_audit(session, item, now))         # bütçe izin satırlarında zaten sayılıdır (R7 M5)
            else:
                await record_anomaly(db, session.id, "late_result", batch.id, now)
        elif outcome == "blocked":
            paused = await _pause_for_block(db, session, now)      # uçuştaki yazma engellendi: hesap düzeyinde güvenlik
        await db.flush()
        return ResultReport(True, item.status, False, True, paused)
    if st != "pending":                                    # terminal: ikinci bildirim durumu değiştirmez
        return ResultReport(True, st, False, stopped, None)

    if http_status is not None:
        item.http_status = http_status
    if fields is not None:
        item.fields = list(fields)

    if outcome == "blocked":                               # AC-C13
        item.prechecked_at, item.note_code = None, "blocked"
        paused = await _pause_for_block(db, session, now)
        if running:
            await halt_batch(db, batch, "blocked", now)
        await db.flush()
        return ResultReport(True, "pending", False, True, paused)

    final = outcome
    if outcome == "failed":
        cls, halt_reason = classify_failure(note_code, http_status)
        if cls == "halt":                                  # AC-C19, C46, S17: deneme sayılmaz, öğe pending, parti durur
            item.prechecked_at, item.note_code = None, note_code
            if running:
                await halt_batch(db, batch, halt_reason, now,
                                 ext_version=ext_version if halt_reason == "mutation_unrecognised" else None)
            await db.flush()
            return ResultReport(True, "pending", False, True, None)
        if cls == "retry":
            item.attempts += 1
            item.note_code = note_code or "exception"
            if item.attempts < MAX_ATTEMPTS:
                item.prechecked_at = None
                await db.flush()
                return ResultReport(True, "pending", True, stopped, None)
            final = "failed"
        elif cls == "not_found":
            final, note_code = "not_found", "not_found"
        else:
            final = "failed"

    if not item_transition_allowed("pending", final):      # AC-C23 (programlama hatası koruması)
        raise ValueError(f"item transition pending -> {final}")
    if final == "done" and item.prechecked_at is None:
        await record_anomaly(db, session.id, "precheck_missing", batch.id, now)
    item.status = final
    item.done_at = now
    item.note_code = note_code or _DEFAULT_NOTE.get(final) or item.note_code
    db.add(_audit(session, item, now))
    batch.last_progress_at = now
    drained = await complete_if_drained(db, batch.id, now)        # AC-C50
    if running and not drained and final in READ_STATUSES:
        if (await read_budget(db, session, now, limits=limits)).room < 1:        # AC-C53
            await halt_batch(db, batch, "read_limit", now)
            stopped = True
    await db.flush()
    return ResultReport(True, final, False, stopped, None)


# ══ Açma/kapama (AC-C35) ════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ToggleResult:
    enabled: bool
    enabled_at: datetime | None
    changed: bool


async def set_saved_enabled(db: AsyncSession, session: Session, enabled: Any, ack_irreversible: Any,
                            now: datetime) -> ToggleResult:
    """`PUT …/cleanup/settings` (kaydedilenler anahtarı). Açmak `ack_irreversible=true` ister (422 `ack_required`);
    kapatmak istemez. Profil kilidi altında. Durum değiştiyse `action_log(cleanup_setting)` yazılır (aynı durumun
    yinelenmesi satır yazmaz). Her açılış ısınma saatini `now`'a çeker (güvenli yön); kapatmak zamanı korur.
    Çalışan parti burada durdurulmaz: sıradaki `next`/`precheck` `off` döner ve partiyi durdurur (AC-C14)."""
    if type(enabled) is not bool:
        raise _bad("saved_enabled")
    if ack_irreversible is not None and type(ack_irreversible) is not bool:
        raise _bad("ack_irreversible")
    if enabled and ack_irreversible is not True:
        raise CleanupError("ack_required", 422)
    await lock_session(db, session)
    if enabled == bool(session.allow_unsave):
        return ToggleResult(enabled, session.unsave_enabled_at, False)
    session.allow_unsave = enabled
    if enabled:
        session.unsave_enabled_at = now
    db.add(ActionLog(session_id=session.id, ig_user_id=None, action_type="cleanup_setting", status="success",
                     target_ref=KIND, target_label="enabled" if enabled else "disabled", created_at=now,
                     executed_at=now))
    await db.flush()
    return ToggleResult(enabled, session.unsave_enabled_at, True)
