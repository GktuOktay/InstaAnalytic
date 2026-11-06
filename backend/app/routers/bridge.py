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
from datetime import datetime

from app.models.session import Session
from app.models.sync_job import SyncJob
from app.services import bridge, bridge_actions
from app.services import notifications

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
                      scope: Literal["new", "missing"] = "new", db: AsyncSession = Depends(get_db)):
    return await bridge.todo(db, await _session(db, session_id), limit, kind, scope)


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


class JobResultItem(BaseModel):
    shortcode: str | None = Field(default=None, max_length=40)
    saved: int = 0
    seen: int = 0
    ok: bool = False
    note: str | None = Field(default=None, max_length=300)


class JobReport(BaseModel):
    """Eklentinin bitirdiği bir işin sonucu (Kuyruk Monitörü'nde görünür)."""
    session_id: uuid.UUID
    kind: Literal["posts", "likers", "comments", "actions"]
    outcome: Literal["ok", "partial", "failed", "stopped"]
    total: int = Field(ge=0, le=1000)
    done: int = Field(ge=0, le=1000)
    ok: int = Field(ge=0, le=1000)
    saved: int = Field(ge=0)
    message: str = Field(max_length=4000)
    results: list[JobResultItem] = Field(default_factory=list, max_length=50)
    started_at: datetime
    finished_at: datetime


_OUTCOME_STATUS = {"ok": "completed", "partial": "partial", "failed": "failed", "stopped": "stopped"}


@router.post("/bridge/jobs", status_code=201)
async def report_job(body: JobReport, db: AsyncSession = Depends(get_db)):
    await _session(db, body.session_id)
    job = SyncJob(
        session_id=body.session_id, job_type=f"bridge_{body.kind}", status=_OUTCOME_STATUS[body.outcome],
        total_items=body.total, processed_items=body.done, error_msg=body.message,
        started_at=body.started_at, finished_at=body.finished_at,
    )
    db.add(job)
    await db.commit()
    await notifications.add(db, session_id=body.session_id, kind=f"job_{body.outcome}", level=notifications.JOB_LEVEL[body.outcome],
                            params={"job": body.kind, "done": body.done, "total": body.total, "ok": body.ok, "saved": body.saved},
                            link="/monitor")
    await notifications.trim(db)
    return {"id": str(job.id)}


# ── Takip / takipten çıkma kuyruğu (eklenti yapar) ─────────────────────────────────

class EnqueueActions(BaseModel):
    action: Literal["follow", "unfollow"]
    user_ids: list[int] = Field(min_length=1, max_length=200)
    manual: bool = False        # kullanıcı tek bir kişiye tıkladı: insan hızında, öne alınarak yapılır


class CancelActions(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=200)


class ActionResult(BaseModel):
    outcome: Literal["done", "already", "not_found", "failed", "blocked"]
    note: str | None = Field(default=None, max_length=300)


@router.get("/sessions/{session_id}/bridge/actions")
async def actions_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await bridge_actions.status(db, await _session(db, session_id))


@router.post("/sessions/{session_id}/bridge/actions")
async def actions_enqueue(session_id: uuid.UUID, body: EnqueueActions, db: AsyncSession = Depends(get_db)):
    # Kuyruğa ekleme her zaman kabul edilir ve kalıcıdır. İşlemlerin açık olması, saatlik/günlük sınır, sessiz saat ve
    # duraklatma yalnızca eklenti işlem isteyince (/actions/next) uygulanır: bekleyen işlem hiçbir zaman kaybolmaz.
    return await bridge_actions.enqueue(db, await _session(db, session_id), body.action, body.user_ids, manual=body.manual and len(body.user_ids) <= 3)


@router.get("/sessions/{session_id}/bridge/actions/next")
async def actions_next(session_id: uuid.UUID, limit: int = 10, db: AsyncSession = Depends(get_db)):
    return await bridge_actions.next_batch(db, await _session(db, session_id), limit)


@router.post("/sessions/{session_id}/bridge/actions/{action_id}/result")
async def actions_result(session_id: uuid.UUID, action_id: int, body: ActionResult, db: AsyncSession = Depends(get_db)):
    return await bridge_actions.report(db, await _session(db, session_id), action_id, body.outcome, body.note)


@router.get("/sessions/{session_id}/bridge/actions/history")
async def actions_history(session_id: uuid.UUID, limit: int = 50, offset: int = 0, state: Literal["done", "skipped", "failed"] | None = None,
                          db: AsyncSession = Depends(get_db)):
    return await bridge_actions.history(db, await _session(db, session_id), limit, offset, state)


@router.post("/sessions/{session_id}/bridge/actions/cancel")
async def actions_cancel(session_id: uuid.UUID, body: CancelActions, db: AsyncSession = Depends(get_db)):
    """Kuyruğa eklenen kişileri geri al: yalnızca bekleyenler silinir."""
    return {"removed": await bridge_actions.cancel(db, await _session(db, session_id), body.user_ids)}


@router.delete("/sessions/{session_id}/bridge/actions")
async def actions_clear(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return {"removed": await bridge_actions.clear(db, await _session(db, session_id))}
