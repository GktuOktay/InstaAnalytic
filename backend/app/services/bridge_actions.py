"""
Eklentinin yaptığı takip / takipten çıkma kuyruğu.

Uygulama Instagram'a istek göndermez: istekler kuyruğa yazılır, eklenti kullanıcının kendi Instagram sekmesinde
bir insan gibi (profili açar, düğmeye tıklar) ve parti parti yapar. Hız, risk profilinin işlem limitlerinden gelir:
saatlik / günlük tavan, ısınma süresi, sessiz saatler ve işlemler arası bekleme (en az 60 sn).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_log import ActionLog
from app.models.bridge_action import BridgeAction
from app.models.ig_user import IgUser
from app.models.relationship import Relationship
from app.models.session import Session
from app.services.risk_profiles import effective_action_limits, get_profile, in_quiet_hours

ACTIONS = ("follow", "unfollow")
MAX_BATCH = 10            # eklentinin tek çalıştırmada alabileceği en fazla işlem
MAX_ENQUEUE = 200
MANUAL_DELAY = (15, 35)   # sn: kullanıcının kendi tıkladığı işlemler arasında (profil açıp bakmak + tıklamak kadar)
MAX_ATTEMPTS = 3          # başarısız bir işlem toplam bu kadar denenir (hesap bulunamadı / engel hariç)
BLOCK_PAUSE = timedelta(hours=24)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def limits(session: Session, now: datetime) -> tuple[int, int, int, int]:
    return effective_action_limits(get_profile(session.risk_profile), session.actions_enabled_at, now)


async def _done_since(db: AsyncSession, session: Session, since: datetime) -> int:
    return (await db.execute(select(func.count(BridgeAction.id)).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "done", BridgeAction.done_at >= since))).scalar() or 0


def gate(session: Session, now: datetime) -> str | None:
    """None: işlem yapılabilir. Aksi halde sebep: off | paused."""
    if not session.allow_actions:
        return "off"
    if session.paused_until and session.paused_until > now:
        return "paused"
    return None


async def enqueue(db: AsyncSession, session: Session, action: str, user_ids: list[int], manual: bool = False) -> dict:
    if action not in ACTIONS:
        raise ValueError("action")
    ids = list(dict.fromkeys(user_ids))[:MAX_ENQUEUE]
    users = {u.id: u for u in (await db.execute(select(IgUser).where(IgUser.id.in_(ids)))).scalars()}
    pending = {(r.ig_user_id, r.action) for r in (await db.execute(select(BridgeAction).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending"))).scalars()}
    rels = {r.ig_user_id: r for r in (await db.execute(select(Relationship).where(
        Relationship.session_id == session.id, Relationship.ig_user_id.in_(ids)))).scalars()}
    added = dup = skipped = 0
    for uid in ids:
        u = users.get(uid)
        rel = rels.get(uid)
        if not u:
            continue
        if (uid, action) in pending:
            dup += 1
            if manual:                                       # sıradaki bir kişiye tek tek tıklandı: öne al, insan hızına geç
                await db.execute(update(BridgeAction).where(BridgeAction.session_id == session.id, BridgeAction.ig_user_id == uid,
                                                             BridgeAction.action == action, BridgeAction.status == "pending").values(manual=True))
            continue
        if rel is not None and bool(rel.we_follow) == (action == "follow"):
            skipped += 1                                  # zaten istenen durumda
            continue
        db.add(BridgeAction(session_id=session.id, ig_user_id=uid, username=u.username, action=action, manual=manual))
        added += 1
    await db.commit()
    return {"added": added, "duplicate": dup, "skipped": skipped}


async def status(db: AsyncSession, session: Session, now: datetime | None = None) -> dict:
    now = now or _now()
    hourly, daily, dmin, dmax = limits(session, now)
    rows = (await db.execute(select(BridgeAction).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending"
    ).order_by(BridgeAction.manual.desc(), BridgeAction.attempts, BridgeAction.id).limit(1000))).scalars().all()
    total_pending = (await db.execute(select(func.count(BridgeAction.id)).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending"))).scalar() or 0
    return {
        "enabled": bool(session.allow_actions),
        "blocked": gate(session, now),
        "quiet_hours": in_quiet_hours(now),
        "pending_count": total_pending,
        "pending": [{"id": r.id, "ig_user_id": r.ig_user_id, "username": r.username, "action": r.action,
                     "attempts": r.attempts or 0, "note": r.note if (r.attempts or 0) else None} for r in rows],
        "max_attempts": MAX_ATTEMPTS,
        "done_hour": await _done_since(db, session, now - timedelta(hours=1)),
        "done_day": await _done_since(db, session, now - timedelta(days=1)),
        "hourly_limit": hourly, "daily_limit": daily, "delay": [dmin, dmax],
        "paused_reason": session.paused_reason if gate(session, now) == "paused" else None,
    }


async def next_batch(db: AsyncSession, session: Session, limit: int, now: datetime | None = None) -> dict:
    """Eklentiye verilecek sıradaki işlemler. Bütçe, sessiz saat ve duraklatma burada uygulanır."""
    now = now or _now()
    hourly, daily, dmin, dmax = limits(session, now)
    out = {"items": [], "delay": [dmin, dmax], "manual_delay": list(MANUAL_DELAY), "reason": None}
    why = gate(session, now)
    if why:
        out["reason"] = why
        return out
    if in_quiet_hours(now):
        out["reason"] = "quiet_hours"
        return out
    room = min(hourly - await _done_since(db, session, now - timedelta(hours=1)),
               daily - await _done_since(db, session, now - timedelta(days=1)))
    if room <= 0:
        out["reason"] = "limit"
        return out
    rows = (await db.execute(select(BridgeAction).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending"
    ).order_by(BridgeAction.manual.desc(), BridgeAction.attempts, BridgeAction.id).limit(max(1, min(limit, MAX_BATCH, room))))).scalars().all()
    out["items"] = [{"id": r.id, "username": r.username, "action": r.action, "attempts": r.attempts or 0,
                       "manual": bool(r.manual)} for r in rows]
    if not rows:
        out["reason"] = "empty"
    return out


OUTCOMES = {"done", "already", "not_found", "failed", "blocked"}


async def report(db: AsyncSession, session: Session, action_id: int, outcome: str, note: str | None = None,
                 now: datetime | None = None) -> dict:
    """Eklentinin bir işlemin sonucunu bildirmesi. done/already: ilişki güncellenir; blocked: 24 saat duraklatılır."""
    now = now or _now()
    row = (await db.execute(select(BridgeAction).where(
        BridgeAction.id == action_id, BridgeAction.session_id == session.id))).scalar_one_or_none()
    if row is None:
        return {"ok": False, "error": "not_found"}
    if row.status != "pending":
        return {"ok": True, "status": row.status}              # çift bildirim zararsız
    note = (note or "")[:300] or None
    if outcome == "blocked":
        session.paused_until = now + BLOCK_PAUSE
        session.paused_reason = "Instagram işlemi engelledi; eklenti durdu"
        await db.commit()
        from app.services import notifications
        await notifications.add(db, session_id=session.id, kind="actions_blocked", level="error",
                                params={"until": session.paused_until.isoformat()}, link="/users")
        return {"ok": True, "status": "pending", "paused_until": session.paused_until.isoformat()}
    if outcome in ("done", "already"):
        row.status = "done" if outcome == "done" else "skipped"
        rel = (await db.execute(select(Relationship).where(
            Relationship.session_id == session.id, Relationship.ig_user_id == row.ig_user_id))).scalar_one_or_none()
        want = row.action == "follow"
        if rel is not None:
            rel.we_follow = want
            rel.we_follow_since = now if want else None
    else:
        row.attempts = (row.attempts or 0) + 1
        # Geçici başarısızlık (düğme/sayfa) 3 kez denenir; hesap bulunamadıysa tekrar denemenin anlamı yok
        if outcome == "failed" and row.attempts < MAX_ATTEMPTS:
            row.note = note
            await db.commit()
            return {"ok": True, "status": "pending", "attempts": row.attempts, "retry": True}
        row.status = "failed"
    row.note = note
    row.done_at = now
    db.add(ActionLog(session_id=session.id, ig_user_id=row.ig_user_id, action_type=row.action,
                     status={"done": "success", "already": "skipped"}.get(outcome, "failed"), error_msg=note, executed_at=now))
    await db.commit()
    return {"ok": True, "status": row.status}


async def history(db: AsyncSession, session: Session, limit: int = 50, offset: int = 0, state: str | None = None) -> dict:
    """Kalıcı kuyruk geçmişi: biten, atlanan ve başarısız işlemler (hiçbir kayıt kendiliğinden silinmez)."""
    q = select(BridgeAction).where(BridgeAction.session_id == session.id, BridgeAction.status != "pending")
    if state in ("done", "skipped", "failed"):
        q = q.where(BridgeAction.status == state)
    rows = (await db.execute(q.order_by(func.coalesce(BridgeAction.done_at, BridgeAction.created_at).desc(), BridgeAction.id.desc())
                             .offset(max(0, offset)).limit(max(1, min(limit, 200))))).scalars().all()
    counts = dict((await db.execute(select(BridgeAction.status, func.count(BridgeAction.id)).where(
        BridgeAction.session_id == session.id).group_by(BridgeAction.status))).all())
    return {
        "counts": {k: int(counts.get(k, 0)) for k in ("pending", "done", "skipped", "failed")},
        "items": [{"id": r.id, "ig_user_id": r.ig_user_id, "username": r.username, "action": r.action, "status": r.status,
                   "attempts": r.attempts or 0, "note": r.note,
                   "created_at": r.created_at.isoformat() if r.created_at else None,
                   "done_at": r.done_at.isoformat() if r.done_at else None} for r in rows],
    }


async def cancel(db: AsyncSession, session: Session, user_ids: list[int]) -> int:
    """Seçili kişilerin bekleyen işlemlerini kuyruktan geri alır (yapılmış olanlara dokunulmaz)."""
    if not user_ids:
        return 0
    res = await db.execute(delete(BridgeAction).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending", BridgeAction.ig_user_id.in_(user_ids[:MAX_ENQUEUE])))
    await db.commit()
    return res.rowcount or 0


async def clear(db: AsyncSession, session: Session) -> int:
    res = await db.execute(delete(BridgeAction).where(
        BridgeAction.session_id == session.id, BridgeAction.status == "pending"))
    await db.commit()
    return res.rowcount or 0
