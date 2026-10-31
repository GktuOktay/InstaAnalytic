from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "instaanalytic",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.sync_tasks", "app.tasks.action_tasks", "app.tasks.ghost_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.beat_schedule = {
    "resume-action-queues": {"task": "resume_action_queues", "schedule": 15 * 60},
    "expire-stale-sessions": {"task": "expire_stale_sessions", "schedule": 24 * 3600},
}
