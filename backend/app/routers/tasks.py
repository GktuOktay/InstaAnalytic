from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from celery.result import AsyncResult
from app.tasks.celery_app import celery_app
from app.schemas.analysis import TaskStatus
from app.db.base import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/active")
async def list_active_tasks():
    """Worker'daki aktif ve reserved (bekleyen) task'ları döndür."""
    inspect = celery_app.control.inspect(timeout=2)
    active   = inspect.active()   or {}
    reserved = inspect.reserved() or {}

    tasks = []
    for worker, task_list in {**active, **reserved}.items():
        for t in (task_list or []):
            tasks.append({
                "task_id":  t.get("id"),
                "name":     t.get("name", "").replace("app.tasks.", ""),
                "args":     t.get("args", []),
                "kwargs":   t.get("kwargs", {}),
                "worker":   worker,
                "state":    "ACTIVE" if t in active.get(worker, []) else "RESERVED",
                "started":  t.get("time_start"),
            })
    return tasks


@router.get("/jobs")
async def list_sync_jobs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Son sync job'larını döndür."""
    from app.models.sync_job import SyncJob
    result = await db.execute(
        select(SyncJob).order_by(desc(SyncJob.started_at)).limit(limit)
    )
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id),
            "session_id": str(j.session_id),
            "task_id": j.celery_task_id,
            "job_type": j.job_type,
            "status": j.status,
            "total_items": j.total_items,
            "processed_items": j.processed_items,
            "error_msg": j.error_msg,
            "created_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        }
        for j in jobs
    ]


@router.get("/{task_id}", response_model=TaskStatus)
async def get_task(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    meta = result.info if isinstance(result.info, dict) else {}
    return TaskStatus(
        task_id=task_id,
        status=result.state,
        progress=meta if result.state == "PROGRESS" else None,
        result=meta if result.state == "SUCCESS" else None,
        error=str(result.info) if result.state == "FAILURE" else None,
    )
