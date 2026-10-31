"""Tarayıcı köprüsü (Chrome eklentisi) uç noktaları. Sunucu Instagram'a istek atmaz; bkz. services/bridge.py."""
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.session import Session
from app.services import bridge

router = APIRouter(tags=["bridge"])

_kv = None


def get_kv():
    global _kv
    if _kv is None:
        _kv = aioredis.from_url(settings.redis_url)
    return _kv


async def _session(db: AsyncSession, session_id: uuid.UUID) -> Session:
    s = await db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Profil bulunamadı")
    return s


class NextRequest(BaseModel):
    session_id: uuid.UUID
    viewer_id: int | None = None


class ReportRequest(NextRequest):
    path: str = Field(max_length=600)
    status: int
    body: str = Field(default="", max_length=bridge.MAX_BODY_CHARS)


@router.get("/bridge/hello")
async def hello(viewer_id: int | None = None, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Session).order_by(Session.created_at))).scalars().all()
    sessions = [{"id": str(s.id), "username": s.ig_username, "source": s.source,
                 "matches": bool(viewer_id and s.ig_user_id == viewer_id)} for s in rows]
    matched = next((s["id"] for s in sessions if s["matches"]), None)
    return {"app": "instaanalytic", "version": 1, "matched": matched, "sessions": sessions}


@router.post("/bridge/next")
async def next_job(body: NextRequest, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    s = await _session(db, body.session_id)
    return await bridge.plan_next(db, kv, s, body.viewer_id)


@router.post("/bridge/report")
async def report(body: ReportRequest, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    s = await _session(db, body.session_id)
    if s.ig_user_id > 0 and body.viewer_id and body.viewer_id != s.ig_user_id:
        raise HTTPException(409, "Instagram'da başka bir hesap açık")
    if not bridge.ALLOWED_PATH.match(body.path):
        raise HTTPException(400, "İzin verilmeyen yol")
    try:
        return await bridge.handle_report(db, kv, s, body.path, body.status, body.body)
    except bridge.ReportError as e:
        raise HTTPException(409, str(e))


@router.get("/sessions/{session_id}/bridge/status")
async def bridge_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    return await bridge.status(db, kv, await _session(db, session_id))


@router.post("/sessions/{session_id}/bridge/stop")
async def bridge_stop(session_id: uuid.UUID, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    await _session(db, session_id)
    await bridge.set_stopped(kv, session_id, True)
    return {"stopped": True}


@router.post("/sessions/{session_id}/bridge/resume")
async def bridge_resume(session_id: uuid.UUID, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    await _session(db, session_id)
    await bridge.set_stopped(kv, session_id, False)
    return {"stopped": False}
