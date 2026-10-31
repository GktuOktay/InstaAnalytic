from fastapi import APIRouter
from sqlalchemy import text
from app.db.base import AsyncSessionLocal
import redis.asyncio as aioredis
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    checks = {"status": "ok", "postgres": "unknown", "redis": "unknown"}

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception:
        checks["postgres"] = "error"
        checks["status"] = "degraded"

    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        checks["status"] = "degraded"

    return checks
