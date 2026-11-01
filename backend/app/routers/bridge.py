"""Tarayıcı köprüsü (Chrome eklentisi) uç noktaları. Kimse Instagram'a istek göndermez; bkz. services/bridge.py."""
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from typing import Literal

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


class ObserveRequest(BaseModel):
    session_id: uuid.UUID
    viewer_id: int | None = None
    url: str = Field(max_length=4000)                 # Instagram sayfasının yaptığı isteğin adresi
    page_url: str = Field(default="", max_length=4000)
    req_body: str = Field(default="", max_length=bridge.MAX_REQ_CHARS)
    status: int
    body: str = Field(default="", max_length=bridge.MAX_BODY_CHARS)
    ext_version: str | None = Field(default=None, max_length=20, pattern=r"^\d+(\.\d+){0,3}$")
    kinds: list[Literal["posts", "likers", "comments"]] | None = None   # eklentide açık araçlar


@router.get("/bridge/hello")
async def hello(viewer_id: int | None = None, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Session).order_by(Session.created_at))).scalars().all()
    sessions = [{"id": str(s.id), "username": s.ig_username, "source": s.source,
                 "matches": bool(viewer_id and s.ig_user_id == viewer_id)} for s in rows]
    matched = next((s["id"] for s in sessions if s["matches"]), None)
    return {"app": "instaanalytic", "version": 2, "matched": matched, "sessions": sessions}


@router.post("/bridge/observe")
async def observe(body: ObserveRequest, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    s = await _session(db, body.session_id)
    if s.ig_user_id > 0 and body.viewer_id and body.viewer_id != s.ig_user_id:
        raise HTTPException(409, f"Instagram'da başka bir hesap açık; bu profil @{s.ig_username}")
    if not body.url.startswith("https://www.instagram.com/"):
        raise HTTPException(400, "Yalnızca instagram.com yanıtları kabul edilir")
    if body.ext_version:
        await bridge.remember_extension(kv, s.id, body.ext_version)
    if await bridge.is_stopped(kv, s.id):
        return {"posts": 0, "likers": 0, "comments": 0, "warning": False, "ignored": True, "stopped": True}
    return await bridge.observe(db, kv, s, url=body.url, page_url=body.page_url, req_body=body.req_body,
                                status=body.status, text=body.body,
                                kinds=set(body.kinds) if body.kinds is not None else None)


@router.get("/sessions/{session_id}/bridge/status")
async def bridge_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    return await bridge.status(db, kv, await _session(db, session_id))


@router.get("/sessions/{session_id}/bridge/todo")
async def bridge_todo(session_id: uuid.UUID, limit: int = 8, kind: Literal["likers", "comments"] = "likers",
                      db: AsyncSession = Depends(get_db)):
    return await bridge.todo(db, await _session(db, session_id), limit, kind)


@router.get("/sessions/{session_id}/bridge/diagnostics")
async def bridge_diagnostics(session_id: uuid.UUID, db: AsyncSession = Depends(get_db), kv=Depends(get_kv)):
    await _session(db, session_id)
    return await bridge.diagnostics(kv, session_id)


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
