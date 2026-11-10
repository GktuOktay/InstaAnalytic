"""Kaydedilenleri temizleme: okuma görünümleri ve koruma ayarı (SPEC-001 T-5; §7.8, AC-C42, C44, L5, S22).

Servisler `flush` eder, çağıran commit eder. Saat enjekte edilir. Hata gövdesine istemci girdisi yansımaz.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_log import ActionLog
from app.models.cleanup import CleanupBatch, CleanupItem, CleanupScan, SavedCollection, SavedTarget
from app.models.session import Session
from app.services import cleanup_limits as cl
from app.services.cleanup_batch import ITEM_STATUSES, MAX_PAGE, stop_stale_for_session
from app.services.cleanup_gate import (
    HOUR, DAY, _count, _int, budget_state, cleanup_gate, compute_effective, load_events, lock_session, pause_until,
    ramp_age_hours,
)
from app.services.cleanup_scan import (
    ACTIVE_BATCH, COLLECTION_CHOICE_AVAILABLE, INVENTORY_MAX_AGE, KIND, CleanupError, current_inventory_scan,
)
from app.services.risk_profiles import in_quiet_hours

_ID = re.compile(r"[0-9]{1,25}")
WORST_CASE = {"hourly": 95, "daily": 460}            # §6.4: hesap 80/400 + takip sert tavanı 15/60
MAX_HISTORY = 100


def _eff(lim, session: Session, now: datetime):
    try:
        return compute_effective(lim.values, session.risk_profile, ramp_age_hours(session, now))
    except Exception:                                      # noqa: BLE001  (bozuk ayar: güvenli varsayılan)
        return compute_effective(cl.DEFAULTS, session.risk_profile, ramp_age_hours(session, now))


def _iso(ts: float | None) -> str | None:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None


# ── Ayarlar ─────────────────────────────────────────────────────────────────────

def settings_view(session: Session, now: datetime, limits=None) -> dict:
    lim = limits if limits is not None else cl.get_limits()
    e = _eff(lim, session, now)
    p = f"profiles.{session.risk_profile if session.risk_profile in cl.PROFILES else 'safe'}.unsave."
    try:
        hourly, daily = _int(lim.values, p + "hourly"), _int(lim.values, p + "daily")
    except Exception:                                      # noqa: BLE001
        hourly, daily = e.hourly_eff, e.daily_eff
    return {
        "saved": {"enabled": bool(session.allow_unsave), "enabled_at": session.unsave_enabled_at,
                  "collection_choice_available": bool(COLLECTION_CHOICE_AVAILABLE)},
        "dm": None,
        "budget": {"hourly": hourly, "daily": daily, "delay": [e.delay_min, e.delay_max], "ramp_factor": e.fraction,
                   "hourly_cap": e.hourly_cap, "daily_cap": e.daily_cap},
        "account": {"hourly": e.account_hourly, "daily": e.account_daily, "worst_case": dict(WORST_CASE)},
    }


def limits_view(lim) -> dict:
    nested = lim.nested()
    eff = {k: nested.get(k, {}) for k in ("account", "batch", "ramp", "scan", "profiles", "reads")}
    return {
        "source": lim.source, "code": lim.code, "path": lim.path, "loaded_at": _iso(lim.loaded_at),
        "changed_at": _iso(lim.changed_at), "sha256": lim.sha256, "version": 1 if lim.source == "file" else None,
        "warnings": [{k: v for k, v in (("key", w.key), ("code", w.code), ("value", w.value), ("used", w.used))
                      if k in ("key", "code") or v is not None} for w in lim.warnings],
        "unknown_count": lim.unknown_count,
        "hard_caps": {k: list(v) for k, v in cl.HARD_CAPS.items()},
        "effective": eff, "follow_limits_managed_here": False,
    }


# ── Durum ───────────────────────────────────────────────────────────────────────

def _pause_reason(session: Session, now: datetime) -> str | None:
    c = session.cleanup_paused_until
    if c is not None and c > now:
        return session.cleanup_paused_reason or "blocked"
    if session.paused_until is not None and session.paused_until > now:
        return "bridge" if (session.paused_reason or "").startswith("Köprü:") else "follow_blocked"
    return None


def _scan_view(scan: CleanupScan | None, now: datetime) -> dict | None:
    if scan is None:
        return None
    anchor = scan.finished_at or scan.started_at
    return {"id": scan.id, "status": scan.status, "started_at": scan.started_at, "finished_at": scan.finished_at,
            "items": scan.items, "partial": scan.status == "partial",
            "stale": scan.status in ("ok", "partial") and now - anchor > INVENTORY_MAX_AGE,
            "collections_mode": scan.collections_mode, "note_code": scan.note_code}


async def status_view(db: AsyncSession, session: Session, now: datetime, *, limits=None) -> dict:
    """AC-C42, C44: takılı partiyi durdurur (idempotent); `run_state` ve `next_allowed_at` hazır kuralından."""
    lim = limits if limits is not None else cl.get_limits()
    await stop_stale_for_session(db, session, now, limits=lim)
    batch = (await db.execute(select(CleanupBatch).where(
        CleanupBatch.session_id == session.id, CleanupBatch.kind == KIND, CleanupBatch.status.in_(ACTIVE_BATCH)
    ).limit(1))).scalar_one_or_none()
    counts: dict[str, int] = {}
    if batch is not None:
        counts = dict((await db.execute(select(CleanupItem.status, func.count()).where(
            CleanupItem.batch_id == batch.id).group_by(CleanupItem.status))).all())
    remaining = counts.get("pending", 0) if batch is not None else 500
    e = _eff(lim, session, now)
    ev = await load_events(db, session.id, now)
    g1, g24 = _count(ev.grants, now, HOUR), _count(ev.grants, now, DAY)
    f1, f24 = _count(ev.follows, now, HOUR), _count(ev.follows, now, DAY)

    reason = await cleanup_gate(db, session, KIND, now, limits=lim, lock=False)
    next_at = None
    if reason is None:
        try:
            st = await budget_state(db, session, now, remaining, limits=lim)
            if st.ready:
                reason = None
                state = "ready"
            else:
                state, next_at = "limit", st.next_allowed_at
        except Exception:                                  # noqa: BLE001  (AC-L9: hata = izin yok)
            state = "limit"
    else:
        state = reason
        if reason in ("paused", "quiet_hours", "limit"):
            try:
                next_at = (await budget_state(db, session, now, remaining, limits=lim)).next_allowed_at
            except Exception:                              # noqa: BLE001
                next_at = None
    pu = pause_until(session)
    pu = pu if pu is not None and pu > now else None
    last = (await db.execute(select(CleanupScan).where(CleanupScan.session_id == session.id, CleanupScan.kind == KIND)
                             .order_by(CleanupScan.started_at.desc(), CleanupScan.id.desc()).limit(1))
            ).scalar_one_or_none()
    active = None
    if batch is not None:
        active = {"id": batch.id, "status": batch.status, "last_stop_reason": batch.last_stop_reason,
                  "run_seq": batch.run_seq, "total": sum(counts.values()),
                  **{k: counts.get(k, 0) for k in ITEM_STATUSES if k != "done"}, "done": counts.get("done", 0),
                  "requires_ext_above": batch.stopped_ext_version}
    return {"saved": {
        "enabled": bool(session.allow_unsave), "run_state": state, "next_allowed_at": next_at,
        "quiet_hours": in_quiet_hours(now), "done_hour": g1, "done_day": g24, "hourly_limit": e.hourly_eff,
        "daily_limit": e.daily_eff, "hourly_cap": e.hourly_cap, "daily_cap": e.daily_cap,
        "account_done_hour": g1 + f1, "account_done_day": g24 + f24, "account_hourly": e.account_hourly,
        "account_daily": e.account_daily, "delay": [e.delay_min, e.delay_max], "active_batch": active,
        "paused_until": pu, "paused_reason": _pause_reason(session, now) if pu else None,
        "last_scan": _scan_view(last, now), "limits_source": lim.source}, "dm": None}


# ── Geçmiş ──────────────────────────────────────────────────────────────────────

async def history_view(db: AsyncSession, session: Session, *, state: Any = None, limit: Any = 50,
                       offset: Any = 0) -> dict:
    if state is not None and (type(state) is not str or state not in ITEM_STATUSES):
        raise CleanupError("invalid", 422, fields=["state"])
    if type(limit) is not int or not 1 <= limit <= MAX_HISTORY:
        raise CleanupError("invalid", 422, fields=["limit"])
    if type(offset) is not int or offset < 0:
        raise CleanupError("invalid", 422, fields=["offset"])
    counts = {k: 0 for k in ITEM_STATUSES}
    counts.update(dict((await db.execute(select(CleanupItem.status, func.count()).where(
        CleanupItem.session_id == session.id).group_by(CleanupItem.status))).all()))
    q = select(CleanupItem).where(CleanupItem.session_id == session.id)
    if state is not None:
        q = q.where(CleanupItem.status == state)
    rows = (await db.execute(q.order_by(CleanupItem.id.desc()).limit(limit).offset(offset))).scalars()
    return {"counts": counts, "items": [
        {"id": r.id, "action": r.action, "label": r.label, "status": r.status, "attempts": r.attempts,
         "note_code": r.note_code, "created_at": r.created_at, "done_at": r.done_at} for r in rows]}


# ── Korunan koleksiyonlar (AC-S22) ──────────────────────────────────────────────

async def list_collections(db: AsyncSession, session: Session) -> dict:
    scan = await current_inventory_scan(db, session.id)
    rows = list((await db.execute(select(SavedCollection).where(SavedCollection.session_id == session.id))).scalars())
    posts: Counter = Counter()
    if scan is not None:
        for ids in (await db.execute(select(SavedTarget.collection_ids).where(
                SavedTarget.scan_id == scan.id, SavedTarget.collection_ids.is_not(None)))).scalars():
            if isinstance(ids, list):
                posts.update(set(ids))
    names = Counter(r.name for r in rows)
    rows.sort(key=lambda r: (r.name.casefold(), r.collection_id))
    return {"mode": scan.collections_mode if scan else None, "scan_id": scan.id if scan else None, "items": [
        {"collection_id": r.collection_id, "name": r.name,
         "id_suffix": r.collection_id[-4:] if names[r.name] > 1 else None, "protected": r.protected,
         "in_last_scan": scan is not None and r.last_seen_scan_id == scan.id,
         "is_new": scan is not None and r.first_seen_scan_id == scan.id,
         "post_count": posts.get(r.collection_id, 0)} for r in rows]}


async def set_collection_protection(db: AsyncSession, session: Session, collection_id: Any, protected: Any,
                                    ack_shared_risk: Any, now: datetime) -> dict:
    """PUT `saved/collections/{id}`: 422 `invalid` (yol/tip) -> kilit -> 404 -> 409 `collections_unavailable` (F ya da
    envanter yok; yalnız korumayı kaldırırken) -> 422 `ack_required`. Aynı değer günlük satırı yazmaz."""
    if type(collection_id) is not str or not _ID.fullmatch(collection_id):
        raise CleanupError("invalid", 422, fields=["collection_id"])
    if type(protected) is not bool:
        raise CleanupError("invalid", 422, fields=["protected"])
    if ack_shared_risk is not None and type(ack_shared_risk) is not bool:
        raise CleanupError("invalid", 422, fields=["ack_shared_risk"])
    await lock_session(db, session)
    row = (await db.execute(select(SavedCollection).where(
        SavedCollection.session_id == session.id, SavedCollection.collection_id == collection_id
    ).with_for_update())).scalar_one_or_none()
    if row is None:
        raise CleanupError("not_found", 404)
    if not protected:
        scan = await current_inventory_scan(db, session.id)
        if not COLLECTION_CHOICE_AVAILABLE or scan is None or scan.collections_mode != "per_collection":
            raise CleanupError("collections_unavailable", 409)
        if ack_shared_risk is not True:
            raise CleanupError("ack_required", 422)
    if row.protected != protected:
        row.protected = protected
        row.updated_at = now
        db.add(ActionLog(session_id=session.id, ig_user_id=None, action_type="collection_protection",
                         status="success", target_ref=collection_id,
                         target_label="protected" if protected else "unprotected", created_at=now, executed_at=now))
    await db.flush()
    return {"collection_id": collection_id, "protected": row.protected}
