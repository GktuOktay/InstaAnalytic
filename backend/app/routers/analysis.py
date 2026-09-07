import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, Float
from sqlalchemy.dialects.postgresql import INTERVAL
import sqlalchemy as sa
from celery.result import AsyncResult
from app.db.base import get_db
from app.models.session import Session
from app.models.ig_user import IgUser
from app.models.post import Post
from app.models.relationship import Relationship
from app.models.sync_job import SyncJob
from app.schemas.analysis import (
    RelationshipUser, AnalysisSummary, SyncResponse, TaskStatus,
    GoldenHourSlot, GoldenHourResponse,
)
from app.tasks.sync_tasks import sync_followers, sync_following
from app.tasks.celery_app import celery_app

router = APIRouter(prefix="/sessions/{session_id}", tags=["analysis"])


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


async def _create_job(db: AsyncSession, session_id: uuid.UUID, job_type: str) -> SyncJob:
    job = SyncJob(session_id=session_id, job_type=job_type)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/sync/followers", response_model=SyncResponse)
async def start_sync_followers(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    job = await _create_job(db, session_id, "followers")
    task = sync_followers.delay(str(session_id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    return SyncResponse(task_id=task.id, job_id=job.id, status="queued")


@router.post("/sync/following", response_model=SyncResponse)
async def start_sync_following(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    job = await _create_job(db, session_id, "following")
    task = sync_following.delay(str(session_id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    return SyncResponse(task_id=task.id, job_id=job.id, status="queued")


@router.get("/analysis/summary", response_model=AnalysisSummary)
async def analysis_summary(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)

    base = select(Relationship).where(Relationship.session_id == session_id)

    total_followers = (await db.execute(
        select(func.count()).select_from(Relationship).where(
            and_(Relationship.session_id == session_id, Relationship.they_follow == True)
        )
    )).scalar_one()

    total_following = (await db.execute(
        select(func.count()).select_from(Relationship).where(
            and_(Relationship.session_id == session_id, Relationship.we_follow == True)
        )
    )).scalar_one()

    mutual = (await db.execute(
        select(func.count()).select_from(Relationship).where(
            and_(Relationship.session_id == session_id, Relationship.we_follow == True, Relationship.they_follow == True)
        )
    )).scalar_one()

    not_following_back = (await db.execute(
        select(func.count()).select_from(Relationship).where(
            and_(Relationship.session_id == session_id, Relationship.we_follow == True, Relationship.they_follow == False)
        )
    )).scalar_one()

    not_followed_back = (await db.execute(
        select(func.count()).select_from(Relationship).where(
            and_(Relationship.session_id == session_id, Relationship.we_follow == False, Relationship.they_follow == True)
        )
    )).scalar_one()

    return AnalysisSummary(
        total_followers=total_followers,
        total_following=total_following,
        mutual=mutual,
        not_following_back=not_following_back,
        not_followed_back=not_followed_back,
    )


def _rel_user_query(session_id, we_follow: bool | None, they_follow: bool | None):
    conditions = [Relationship.session_id == session_id]
    if we_follow is not None:
        conditions.append(Relationship.we_follow == we_follow)
    if they_follow is not None:
        conditions.append(Relationship.they_follow == they_follow)
    return (
        select(IgUser, Relationship)
        .join(Relationship, IgUser.id == Relationship.ig_user_id)
        .where(and_(*conditions))
    )


async def _paginated_rel(db, session_id, we_follow, they_follow, page, limit):
    q = _rel_user_query(session_id, we_follow, they_follow)
    q = q.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).all()
    result = []
    for ig_user, rel in rows:
        result.append(RelationshipUser(
            id=ig_user.id, username=ig_user.username, full_name=ig_user.full_name,
            profile_pic_url=ig_user.profile_pic_url, is_private=ig_user.is_private,
            is_verified=ig_user.is_verified, follower_count=ig_user.follower_count,
            following_count=ig_user.following_count,
            we_follow=rel.we_follow, they_follow=rel.they_follow,
            last_checked_at=rel.last_checked_at,
        ))
    return result


@router.get("/analysis/not-following-back", response_model=list[RelationshipUser])
async def not_following_back(session_id: uuid.UUID, page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    return await _paginated_rel(db, session_id, we_follow=True, they_follow=False, page=page, limit=limit)


@router.get("/analysis/not-followed-back", response_model=list[RelationshipUser])
async def not_followed_back(session_id: uuid.UUID, page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    return await _paginated_rel(db, session_id, we_follow=False, they_follow=True, page=page, limit=limit)


@router.get("/analysis/mutual", response_model=list[RelationshipUser])
async def mutual(session_id: uuid.UUID, page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    return await _paginated_rel(db, session_id, we_follow=True, they_follow=True, page=page, limit=limit)


@router.get("/analysis/followers", response_model=list[RelationshipUser])
async def followers(session_id: uuid.UUID, page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    return await _paginated_rel(db, session_id, we_follow=None, they_follow=True, page=page, limit=limit)


@router.get("/analysis/following", response_model=list[RelationshipUser])
async def following(session_id: uuid.UUID, page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    return await _paginated_rel(db, session_id, we_follow=True, they_follow=None, page=page, limit=limit)


@router.get("/analysis/golden-hour", response_model=GoldenHourResponse)
async def golden_hour(session_id: uuid.UUID, tz: str = "Europe/Istanbul", db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)

    # Group posts by local day-of-week and hour, aggregate avg engagement
    local_ts = sa.func.timezone(tz, Post.taken_at)
    day_col = sa.cast(sa.func.extract("DOW", local_ts), sa.Integer)
    hour_col = sa.cast(sa.func.extract("HOUR", local_ts), sa.Integer)
    engagement = sa.cast(Post.like_count + Post.comment_count, Float)

    q = (
        select(
            day_col.label("day_of_week"),
            hour_col.label("hour"),
            func.avg(engagement).label("avg_engagement"),
            func.count().label("post_count"),
        )
        .where(and_(Post.session_id == session_id, Post.taken_at.is_not(None)))
        .group_by(day_col, hour_col)
        .order_by(day_col, hour_col)
    )

    rows = (await db.execute(q)).all()
    slots = [
        GoldenHourSlot(
            day_of_week=int(r.day_of_week),
            hour=int(r.hour),
            avg_engagement=round(float(r.avg_engagement), 1),
            post_count=int(r.post_count),
        )
        for r in rows
    ]
    return GoldenHourResponse(slots=slots, timezone=tz)
