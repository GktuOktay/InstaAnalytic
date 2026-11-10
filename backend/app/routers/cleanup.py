"""Kaydedilenleri temizleme uçları (SPEC-001 §7.5, §7.8, §7.9; T-5). Tüm iş kuralı servis katmanındadır
(cleanup_scan, cleanup_batch, cleanup_exec, cleanup_view); burası yalnız taşıma katmanıdır:
JSON zorunluluğu (415), kimlik ayrıştırma (IDOR 404), işlem sınırı (commit/rollback), saat/ayar/redis enjeksiyonu.

İşlem kuralı: başarıda commit; `CleanupError`'da rollback. İstisnalar (hata yanıtına rağmen kalıcı olması gereken
durumlar): `start` (takılı partinin `stopped(stale)` kaydı) commit eder; 409 durumlarında servis zaten commit etmiştir
(`cleanup_exec._guard`, `_check_ext_update`, `result` hesap uyuşmazlığı) ve burada yapılan rollback onu bozmaz.
"""
import logging
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.session import Session
from app.routers.bridge import get_kv
from app.schemas.cleanup import (
    CollectionProtectIn, ConfirmIn, EmptyIn, NextIn, PrecheckIn, ResultIn, ScanCollectionsIn, ScanFinishIn,
    ScanPageIn, ScanStartIn, SettingsPut, StartIn,
)
from app.services import bridge
from app.services import cleanup_batch as cb
from app.services import cleanup_exec as ex
from app.services import cleanup_limits as cl
from app.services import cleanup_scan as sc
from app.services import cleanup_view as cv
from app.services.cleanup_gate import lock_session
from app.services.cleanup_scan import CleanupError

log = logging.getLogger("cleanup_api")

_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
_PATH_ID = re.compile(r"[0-9]{1,18}")


def get_now() -> datetime:
    return datetime.now(timezone.utc)


def get_cleanup_limits():
    return cl.get_limits()


async def require_json(request: Request) -> None:
    """AC-C38: durum değiştiren uçlar yalnız `application/json` kabul eder (parametre `charset` serbest)."""
    if request.method in _UNSAFE:
        ct = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if ct != "application/json":
            raise CleanupError("unsupported_media_type", 415)


router = APIRouter(tags=["cleanup"], dependencies=[Depends(require_json)])


async def get_profile(session_id: str, db: AsyncSession = Depends(get_db)) -> Session:
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise CleanupError("session_not_found", 404) from None
    s = await db.get(Session, sid)
    if s is None:
        raise CleanupError("session_not_found", 404)
    return s


def _pid(v: str) -> int:
    """Yol kimliği: biçim dışı ya da bigint'e sığmayan kimlik 404 (hiçbir profilde olamaz; girdi yansımaz)."""
    if not _PATH_ID.fullmatch(v):
        raise CleanupError("not_found", 404)
    return int(v)


@asynccontextmanager
async def txn(db: AsyncSession, *, commit_on_error: bool = False):
    try:
        yield
        await db.commit()
    except CleanupError:
        if commit_on_error:
            await db.commit()
        else:
            await db.rollback()
        raise
    except BaseException:
        await db.rollback()
        raise


async def _remember(kv, s: Session, ext_version: str | None) -> None:
    if ext_version:
        try:
            await bridge.remember_extension(kv, s.id, ext_version)
        except Exception:                                  # noqa: BLE001  (redis yoksa iş durmaz)
            log.warning("ext_version could not be remembered")


async def _recall(kv, s: Session) -> str | None:
    try:
        v = await bridge.recall_extension(kv, s.id)
    except Exception:                                      # noqa: BLE001
        return None
    return v if isinstance(v, str) and re.fullmatch(r"[0-9]{1,4}(\.[0-9]{1,4}){0,3}", v) else None


async def _viewer_guard(db: AsyncSession, s: Session, viewer_id: str, now: datetime, *,
                        ext_version: str | None = None, check_ext: bool = False) -> None:
    """AC-C4, C37 (tarama uçları): hesap/sürüm uyuşmuyorsa çalışan parti aynı işlemde durur ve 409 döner."""
    problem, reason = ex._viewer_problem(s, viewer_id), "account_mismatch"
    if problem is None and check_ext and (ext_version is None or cb._ver(ext_version) < cb._ver(ex.MIN_EXT_VERSION)):
        problem, reason = "extension_outdated", "extension_outdated"
    if problem is None:
        return
    await lock_session(db, s)
    await ex.halt_running_batch(db, s, reason, now)
    await db.commit()
    raise CleanupError(problem, 409)


def _need_enabled(s: Session) -> None:
    if not s.allow_unsave:
        raise CleanupError("feature_off", 403)


# ── Ayarlar ve sınırlar ─────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/cleanup/settings")
async def get_settings(s: Session = Depends(get_profile), now: datetime = Depends(get_now),
                       lim=Depends(get_cleanup_limits)):
    return cv.settings_view(s, now, lim)


@router.put("/sessions/{session_id}/cleanup/settings")
async def put_settings(body: SettingsPut, s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db),
                       now: datetime = Depends(get_now), lim=Depends(get_cleanup_limits)):
    for name in ("dm_enabled", "rules"):
        if name in body.model_fields_set:
            raise CleanupError("not_available", 422, fields=[name])
    async with txn(db):
        await ex.set_saved_enabled(db, s, body.saved_enabled, body.ack_irreversible, now)
        return cv.settings_view(s, now, lim)


@router.get("/cleanup/limits")
async def get_limits(lim=Depends(get_cleanup_limits)):
    return cv.limits_view(lim)


# ── Tarama ──────────────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/cleanup/saved/scan/start")
async def scan_start(body: ScanStartIn, s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db),
                     now: datetime = Depends(get_now), lim=Depends(get_cleanup_limits), kv=Depends(get_kv)):
    await _remember(kv, s, body.ext_version)
    _need_enabled(s)
    await _viewer_guard(db, s, body.viewer_id, now, ext_version=body.ext_version, check_ext=True)
    async with txn(db):
        r = await sc.start_scan(db, s, now, limits=lim)
        return {"scan_id": r.scan_id, "max_pages": r.max_pages, "page_delay": list(r.page_delay),
                "warn_after_ms": r.warn_after_ms, "stale_after_ms": r.stale_after_ms,
                "collection_choice": r.collection_choice}


@router.post("/sessions/{session_id}/cleanup/saved/scan/{scan_id}/collections")
async def scan_collections(scan_id: str, body: ScanCollectionsIn, s: Session = Depends(get_profile),
                           db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now)):
    sid = _pid(scan_id)
    _need_enabled(s)
    await _viewer_guard(db, s, body.viewer_id, now)
    payload = {k: getattr(body, k) for k in ("available", "collections", "note_code")
               if k in body.model_fields_set}
    async with txn(db):
        r = await sc.add_collections(db, s, sid, payload, now)
        return {"mode": r.mode, "new_count": r.new_count}


@router.post("/sessions/{session_id}/cleanup/saved/scan/{scan_id}/page")
async def scan_page(scan_id: str, body: ScanPageIn, s: Session = Depends(get_profile),
                    db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                    lim=Depends(get_cleanup_limits)):
    sid = _pid(scan_id)
    _need_enabled(s)
    await _viewer_guard(db, s, body.viewer_id, now)
    async with txn(db):
        r = await sc.add_page(db, s, sid, body.page_no, body.items, now, limits=lim)
        return {"accepted": r.accepted, "duplicates": r.duplicates, "total": r.total, "continue": r.continue_}


@router.post("/sessions/{session_id}/cleanup/saved/scan/{scan_id}/finish")
async def scan_finish(scan_id: str, body: ScanFinishIn, s: Session = Depends(get_profile),
                      db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now)):
    sid = _pid(scan_id)
    await _viewer_guard(db, s, body.viewer_id, now)         # `finish` özellik kapalıyken de kabul edilir (§7.5)
    async with txn(db):
        r = await sc.finish_scan(db, s, sid, body.outcome, body.note_code, now)
        return {"status": r.status, "items": r.items}


# ── Envanter, koleksiyonlar, önizleme ───────────────────────────────────────────

@router.get("/sessions/{session_id}/cleanup/saved/inventory")
async def get_inventory(q: str | None = None, media_type: str | None = None, collection_id: str | None = None,
                        limit: int = 50, offset: int = 0, s: Session = Depends(get_profile),
                        db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now)):
    return await sc.inventory(db, s, now, q=q, media_type=media_type, collection_id=collection_id, limit=limit,
                              offset=offset)


@router.get("/sessions/{session_id}/cleanup/saved/collections")
async def get_collections(s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db)):
    return await cv.list_collections(db, s)


@router.put("/sessions/{session_id}/cleanup/saved/collections/{collection_id}")
async def put_collection(collection_id: str, body: CollectionProtectIn, s: Session = Depends(get_profile),
                         db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now)):
    async with txn(db):
        return await cv.set_collection_protection(db, s, collection_id, body.protected, body.ack_shared_risk, now)


@router.post("/sessions/{session_id}/cleanup/saved/preview")
async def post_preview(body: dict[str, Any], s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db),
                       now: datetime = Depends(get_now), lim=Depends(get_cleanup_limits)):
    _need_enabled(s)
    async with txn(db):
        r = await cb.preview(db, s, body, now, limits=lim)
        return {"batch_id": r.batch_id, "item_count": r.item_count, "unknown_refs": r.unknown_refs,
                "excluded": r.excluded, "excluded_protected": r.excluded_protected,
                "in_unprotected_collections": r.in_unprotected_collections, "truncated": r.truncated,
                "remaining": r.remaining, "expires_at": r.expires_at, "estimate": r.estimate}


# ── Parti ───────────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/cleanup/batches/{batch_id}/items")
async def get_batch_items(batch_id: str, status: str | None = None, limit: int = 50, offset: int = 0,
                          s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db)):
    return await cb.batch_items(db, s, _pid(batch_id), status=status, limit=limit, offset=offset)


@router.post("/sessions/{session_id}/cleanup/batches/{batch_id}/confirm")
async def post_confirm(batch_id: str, body: ConfirmIn, s: Session = Depends(get_profile),
                       db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                       lim=Depends(get_cleanup_limits)):
    bid = _pid(batch_id)
    async with txn(db):
        r = await cb.confirm(db, s, bid, body.confirm_count, now, limits=lim)
        return {"batch_id": r.batch_id, "status": r.status, "queued": r.queued}


@router.post("/sessions/{session_id}/cleanup/batches/{batch_id}/start")
async def post_start(batch_id: str, body: StartIn | None = None, s: Session = Depends(get_profile),
                     db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                     lim=Depends(get_cleanup_limits), kv=Depends(get_kv)):
    bid = _pid(batch_id)
    ext = body.ext_version if body else None
    await _remember(kv, s, ext)
    async with txn(db, commit_on_error=True):           # takılı parti `stopped(stale)` kaydı 409'a rağmen kalır
        r = await cb.start_batch(db, s, bid, ext, now, limits=lim)
        return {"batch_id": r.batch_id, "status": r.status, "run_seq": r.run_seq, "started_at": r.started_at}


@router.post("/sessions/{session_id}/cleanup/batches/{batch_id}/stop")
async def post_stop(batch_id: str, body: dict[str, Any], s: Session = Depends(get_profile),
                    db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now)):
    bid = _pid(batch_id)
    async with txn(db):
        r = await cb.stop_batch(db, s, bid, body, now)
        return {"batch_id": r.batch_id, "status": r.status, "last_stop_reason": r.last_stop_reason,
                "applied": r.applied}


@router.post("/sessions/{session_id}/cleanup/batches/{batch_id}/cancel")
async def post_cancel(batch_id: str, body: EmptyIn, s: Session = Depends(get_profile),
                      db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                      lim=Depends(get_cleanup_limits)):
    bid = _pid(batch_id)
    async with txn(db):
        r = await cb.cancel_batch(db, s, bid, now, limits=lim)
        return {"cancelled": r.cancelled, "status": r.status}


# ── Durum, geçmiş ───────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/cleanup/status")
async def get_status(s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db),
                     now: datetime = Depends(get_now), lim=Depends(get_cleanup_limits)):
    async with txn(db):                                  # GET'teki tek yazmalar: takılı parti, duraklatma kopyası (AC-C38)
        return await cv.status_view(db, s, now, limits=lim)


@router.get("/sessions/{session_id}/cleanup/history")
async def get_history(state: str | None = None, limit: int = 50, offset: int = 0, s: Session = Depends(get_profile),
                      db: AsyncSession = Depends(get_db)):
    return await cv.history_view(db, s, state=state, limit=limit, offset=offset)


# ── Yürütme ─────────────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/cleanup/saved/next")
async def post_next(body: NextIn, s: Session = Depends(get_profile), db: AsyncSession = Depends(get_db),
                    now: datetime = Depends(get_now), lim=Depends(get_cleanup_limits), kv=Depends(get_kv)):
    await _remember(kv, s, body.ext_version)
    async with txn(db):
        r = await ex.next_items(db, s, body.batch_id, body.run_seq, body.viewer_id, body.ext_version, body.limit, now,
                                limits=lim)
        return {"items": r.items, "run_seq": r.run_seq, "delay": list(r.delay), "stale_after_ms": r.stale_after_ms,
                "allow_collections": r.allow_collections, "reason": r.reason}


@router.post("/sessions/{session_id}/cleanup/items/{item_id}/precheck")
async def post_precheck(item_id: str, body: PrecheckIn, s: Session = Depends(get_profile),
                        db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                        lim=Depends(get_cleanup_limits), kv=Depends(get_kv)):
    iid = _pid(item_id)
    await _remember(kv, s, body.ext_version)
    async with txn(db):
        r = await ex.precheck(db, s, iid, body.viewer_id, body.ext_version, body.run_seq, body.collection_ids, now,
                              limits=lim)
        out: dict[str, Any] = {"allow": r.allow, "item_id": r.item_id}
        if not r.allow:
            out["reason"] = r.reason
            if r.retry_after is not None:
                out["retry_after"] = r.retry_after
        return out


@router.post("/sessions/{session_id}/cleanup/items/{item_id}/result")
async def post_result(item_id: str, body: ResultIn, s: Session = Depends(get_profile),
                      db: AsyncSession = Depends(get_db), now: datetime = Depends(get_now),
                      lim=Depends(get_cleanup_limits), kv=Depends(get_kv)):
    iid = _pid(item_id)
    ext = await _recall(kv, s)                           # AC-C57: `next`/`precheck`'te görülen sürüm
    async with txn(db):
        r = await ex.report_result(db, s, iid, body.viewer_id, body.run_seq, body.outcome, now,
                                   note_code=body.note_code, http_status=body.http_status, fields=body.fields,
                                   ext_version=ext, limits=lim)
        out: dict[str, Any] = {"ok": r.ok, "status": r.status, "retry": r.retry, "stopped": r.stopped}
        if r.paused_until is not None:
            out["paused_until"] = r.paused_until
        return out
