"""Hayalet hesaplar (silinmiş / dondurulmuş): oturumsuz kontrol, canlı durum, elle işaretleme."""
import asyncio
import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.ig_user import IgUser
from app.models.relationship import Relationship
from app.models.session import Session
from app.schemas.analysis import RelationshipUser
from app.services import ghost_state as gs
from app.services.ghost_check import Pacer

router = APIRouter(prefix="/sessions/{session_id}", tags=["ghosts"])


def _redis():
    return redis.from_url(settings.redis_url)


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    s = await db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Session bulunamadı")
    return s


class CheckRequest(BaseModel):
    acknowledge: bool = False       # kullanıcı bu özelliğin Instagram'a (oturumsuz) istek attığını onayladı
    recheck: bool = False           # 14 günden eski sonuçlara yeniden bak


def _non_followers(session_id):
    return and_(Relationship.session_id == session_id, Relationship.we_follow.is_(True), Relationship.they_follow.is_(False))


async def _counts(db: AsyncSession, session_id) -> dict:
    rows = (await db.execute(
        select(IgUser.reach_status, func.count())
        .join(Relationship, Relationship.ig_user_id == IgUser.id)
        .where(_non_followers(session_id)).group_by(IgUser.reach_status)
    )).all()
    by = {k: v for k, v in rows}
    return {"candidates": sum(by.values()), "unchecked": by.get(None, 0), "ok": by.get("ok", 0),
            "unreachable": by.get("unreachable", 0), "unknown": by.get("unknown", 0)}


@router.get("/ghosts/status")
async def ghost_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)

    def read():
        r = _redis()
        return gs.read(r, session_id), Pacer(r).snapshot()
    job, pace = await asyncio.to_thread(read)
    return {"job": job, "pace": pace, "counts": await _counts(db, session_id)}


@router.post("/ghosts/check", status_code=202)
async def start_ghost_check(session_id: uuid.UUID, body: CheckRequest, db: AsyncSession = Depends(get_db)):
    """Geri takip etmeyen hesapları oturumsuz bir tarayıcıyla kontrol eder. Hiçbir Instagram oturumu kullanılmaz."""
    await _get_session(session_id, db)
    if not body.acknowledge:
        raise HTTPException(400, "Bu özellik Instagram'a oturumsuz istek atar (hesabın kullanılmaz, yalnızca bilgisayarının IP'si görünür). Onay gerekli.")
    from app.tasks.ghost_tasks import candidate_filter, check_ghosts
    n = (await db.execute(
        select(func.count()).select_from(IgUser).join(Relationship, Relationship.ig_user_id == IgUser.id)
        .where(candidate_filter(session_id, body.recheck))
    )).scalar_one()
    if n == 0:
        raise HTTPException(409, "Kontrol edilecek hesap kalmadı")

    def kick():
        r = _redis()
        cur = gs.read(r, session_id)
        if cur["state"] in gs.ACTIVE_STATES:
            return "running"
        gs.start(r, session_id, n)
        check_ghosts.delay(str(session_id), body.recheck)
        return "queued"
    state = await asyncio.to_thread(kick)
    if state == "running":
        raise HTTPException(409, "Kontrol zaten sürüyor")
    return {"status": state, "total": n}


@router.post("/ghosts/stop")
async def stop_ghost_check(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)

    def stop():
        r = _redis()
        gs.request_stop(r, session_id)
        cur = gs.read(r, session_id)
        if cur["state"] == "cooldown":          # bekleme sırasındaysa dilim çalışmıyor, durumu hemen güncelle
            gs.write(r, session_id, state="stopped", message="Durduruldu", resume_at="")
    await asyncio.to_thread(stop)
    return {"status": "stopping"}


@router.get("/ghosts", response_model=list[RelationshipUser])
async def list_ghosts(session_id: uuid.UUID, page: int = 1, limit: int = 100, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    q = (select(IgUser, Relationship).join(Relationship, Relationship.ig_user_id == IgUser.id)
         .where(_non_followers(session_id), IgUser.reach_status == "unreachable")
         .order_by(IgUser.username).offset((max(page, 1) - 1) * limit).limit(min(limit, 200)))
    out = []
    for u, rel in (await db.execute(q)).all():
        out.append(RelationshipUser(
            id=u.id, username=u.username, full_name=u.full_name, profile_pic_url=u.profile_pic_url,
            is_private=u.is_private, is_verified=u.is_verified, follower_count=u.follower_count,
            following_count=u.following_count, we_follow=rel.we_follow, they_follow=rel.they_follow,
            last_checked_at=rel.last_checked_at, reach_status=u.reach_status))
    return out


class MarkRequest(BaseModel):
    ghost: bool | None = None        # True: hayalet | False: hesap duruyor | None: işareti kaldır


@router.put("/ghosts/{ig_user_id}")
async def mark_ghost(session_id: uuid.UUID, ig_user_id: int, body: MarkRequest, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    rel = await db.get(Relationship, (session_id, ig_user_id))
    user = await db.get(IgUser, ig_user_id)
    if not rel or not user:
        raise HTTPException(404, "Bu profilde böyle bir hesap yok")
    if body.ghost is None:
        user.reach_status = user.reach_checked_at = user.reach_source = None
    else:
        user.reach_status = "unreachable" if body.ghost else "ok"
        user.reach_checked_at, user.reach_source = datetime.now(timezone.utc), "manual"
    await db.commit()
    return {"id": ig_user_id, "reach_status": user.reach_status}
