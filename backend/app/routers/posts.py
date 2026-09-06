import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from app.db.base import get_db
from app.models.session import Session
from app.models.post import Post
from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.sync_job import SyncJob
from app.schemas.posts import PostResponse, PostLiker, PostComment, PostStats
from app.schemas.analysis import SyncResponse
from app.tasks.sync_tasks import sync_posts, sync_post_interactions, sync_all_interactions

router = APIRouter(prefix="/sessions/{session_id}", tags=["posts"])


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


@router.post("/sync/posts", response_model=SyncResponse)
async def start_sync_posts(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    job = SyncJob(session_id=session_id, job_type="posts")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    task = sync_posts.delay(str(session_id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    return SyncResponse(task_id=task.id, job_id=job.id, status="queued")


@router.post("/sync/interactions-bulk", response_model=SyncResponse)
async def start_sync_interactions_bulk(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Tüm gönderiler için like/yorum senkronizasyonu başlatır."""
    await _get_session(session_id, db)
    job = SyncJob(session_id=session_id, job_type="interactions_bulk")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    task = sync_all_interactions.delay(str(session_id), str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    return SyncResponse(task_id=task.id, job_id=job.id, status="queued")


@router.post("/sync/post-interactions/{shortcode}", response_model=SyncResponse)
async def start_sync_interactions(session_id: uuid.UUID, shortcode: str, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    post = (await db.execute(select(Post).where(Post.shortcode == shortcode, Post.session_id == session_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Gönderi bulunamadı")
    job = SyncJob(session_id=session_id, job_type="interactions")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    task = sync_post_interactions.delay(str(session_id), post.id, str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    return SyncResponse(task_id=task.id, job_id=job.id, status="queued")


@router.get("/posts", response_model=list[PostResponse])
async def list_posts(session_id: uuid.UUID, page: int = 1, limit: int = 100, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    result = await db.execute(
        select(Post)
        .where(Post.session_id == session_id)
        .order_by(desc(Post.taken_at))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/posts/stats", response_model=PostStats)
async def post_stats(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    row = (await db.execute(
        select(
            func.count(Post.id),
            func.sum(Post.like_count),
            func.sum(Post.comment_count),
            func.avg(Post.like_count),
            func.avg(Post.comment_count),
        ).where(Post.session_id == session_id)
    )).one()

    top = (await db.execute(
        select(Post.shortcode).where(Post.session_id == session_id)
        .order_by(desc(Post.like_count)).limit(1)
    )).scalar_one_or_none()

    return PostStats(
        total_posts=row[0] or 0,
        total_likes=row[1] or 0,
        total_comments=row[2] or 0,
        avg_likes=round(float(row[3] or 0), 1),
        avg_comments=round(float(row[4] or 0), 1),
        top_post_shortcode=top,
    )


@router.get("/posts/{shortcode}", response_model=PostResponse)
async def get_post(session_id: uuid.UUID, shortcode: str, db: AsyncSession = Depends(get_db)):
    post = (await db.execute(select(Post).where(Post.shortcode == shortcode, Post.session_id == session_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Gönderi bulunamadı")
    return post


@router.get("/posts/{shortcode}/likers", response_model=list[PostLiker])
async def post_likers(session_id: uuid.UUID, shortcode: str, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    post = (await db.execute(select(Post.id).where(Post.shortcode == shortcode, Post.session_id == session_id))).scalar_one_or_none()
    if not post:
        return []
    result = await db.execute(
        select(IgUser)
        .join(Interaction, and_(
            Interaction.ig_user_id == IgUser.id,
            Interaction.post_id == post,
            Interaction.interaction_type == "like",
        ))
    )
    return result.scalars().all()


@router.get("/posts/{shortcode}/comments", response_model=list[PostComment])
async def post_comments(session_id: uuid.UUID, shortcode: str, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    post = (await db.execute(select(Post.id).where(Post.shortcode == shortcode, Post.session_id == session_id))).scalar_one_or_none()
    if not post:
        return []
    result = await db.execute(
        select(Interaction, IgUser.username)
        .outerjoin(IgUser, Interaction.ig_user_id == IgUser.id)
        .where(and_(Interaction.post_id == post, Interaction.interaction_type == "comment"))
        .order_by(desc(Interaction.interacted_at))
    )
    rows = result.all()
    return [
        PostComment(
            ig_user_id=intr.ig_user_id,
            username=username,
            content=intr.content,
            interacted_at=intr.interacted_at,
        )
        for intr, username in rows
    ]
