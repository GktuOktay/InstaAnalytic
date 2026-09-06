import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.base import get_db
from app.models.session import Session
from app.models.action_log import ActionLog
from app.models.ig_user import IgUser
from app.schemas.actions import (
    ActionResponse, BulkUnfollowRequest, BulkUnfollowResponse, ActionLogEntry
)
from app.tasks.action_tasks import (
    bulk_unfollow, queue_action, get_queue_status, process_action_queue
)

router = APIRouter(prefix="/sessions/{session_id}/actions", tags=["actions"])


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


@router.post("/follow/{ig_user_id}", response_model=ActionResponse)
async def follow_user(session_id: uuid.UUID, ig_user_id: int, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    result = queue_action(str(session_id), "follow", ig_user_id)
    return ActionResponse(
        success=True,
        action_type="follow",
        ig_user_id=ig_user_id,
        queued=True,
        queue_position=result.get("position"),
    )


@router.post("/unfollow/{ig_user_id}", response_model=ActionResponse)
async def unfollow_user(session_id: uuid.UUID, ig_user_id: int, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    result = queue_action(str(session_id), "unfollow", ig_user_id)
    return ActionResponse(
        success=True,
        action_type="unfollow",
        ig_user_id=ig_user_id,
        queued=True,
        queue_position=result.get("position"),
    )


@router.get("/queue")
async def action_queue_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Kuyruk durumunu döndür: bekleyen işlemler, saatlik/günlük sayaçlar."""
    await _get_session(session_id, db)
    return get_queue_status(str(session_id))


@router.delete("/queue")
async def clear_action_queue(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Kuyruktaki bekleyen işlemleri temizle."""
    await _get_session(session_id, db)
    from app.tasks.action_tasks import _get_redis, _QUEUE_KEY
    r = _get_redis()
    r.delete(_QUEUE_KEY.format(session_id=str(session_id)))
    return {"cleared": True}


@router.post("/remove-follower/{ig_user_id}", response_model=ActionResponse)
async def remove_follower(session_id: uuid.UUID, ig_user_id: int, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    result = queue_action(str(session_id), "remove_follower", ig_user_id)
    return ActionResponse(
        success=True,
        action_type="remove_follower",
        ig_user_id=ig_user_id,
        queued=True,
        queue_position=result.get("position"),
    )


@router.post("/bulk-unfollow", response_model=BulkUnfollowResponse)
async def bulk_unfollow_action(
    session_id: uuid.UUID,
    body: BulkUnfollowRequest,
    db: AsyncSession = Depends(get_db),
):
    await _get_session(session_id, db)
    task = bulk_unfollow.delay(
        str(session_id),
        body.user_ids,
        body.delay_min_seconds,
        body.delay_max_seconds,
        body.hourly_limit,
    )
    # Tahmini süre: delay ortalaması × işlem sayısı
    avg_delay = (body.delay_min_seconds + body.delay_max_seconds) / 2
    estimated = int((len(body.user_ids) * avg_delay) / 60)
    return BulkUnfollowResponse(
        task_id=task.id,
        queued_count=len(body.user_ids),
        estimated_duration_minutes=estimated,
    )


@router.get("/log", response_model=list[ActionLogEntry])
async def action_log(
    session_id: uuid.UUID,
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    await _get_session(session_id, db)
    result = await db.execute(
        select(ActionLog, IgUser.username)
        .outerjoin(IgUser, ActionLog.ig_user_id == IgUser.id)
        .where(ActionLog.session_id == session_id)
        .order_by(desc(ActionLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = result.all()
    entries = []
    for log, username in rows:
        entries.append(ActionLogEntry(
            id=log.id,
            ig_user_id=log.ig_user_id,
            ig_username=username,
            action_type=log.action_type,
            status=log.status,
            error_msg=log.error_msg,
            created_at=log.created_at,
            executed_at=log.executed_at,
        ))
    return entries
