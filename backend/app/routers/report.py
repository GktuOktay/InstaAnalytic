import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, and_, case
from app.db.base import get_db
from app.models.session import Session
from app.models.post import Post
from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.relationship import Relationship
from pydantic import BaseModel

router = APIRouter(prefix="/sessions/{session_id}/report", tags=["report"])


class KpiStats(BaseModel):
    total_posts: int
    total_likes: int
    total_comments: int
    avg_likes: float
    avg_comments: float
    max_likes: int
    unique_interactors: int
    synced_interactions: int


class MonthlyPoint(BaseModel):
    month: str       # "2024-08"
    total_likes: int
    avg_likes: float
    post_count: int


class FollowerBreakdown(BaseModel):
    follower_likes: int
    outsider_likes: int
    follower_users: int
    outsider_users: int


class TopFan(BaseModel):
    username: str
    full_name: str | None
    like_count: int
    comment_count: int
    total: int


class TopPost(BaseModel):
    shortcode: str
    taken_at: str | None
    like_count: int
    comment_count: int
    synced_likes: int
    synced_comments: int


class TopCommenter(BaseModel):
    username: str
    full_name: str | None
    comment_count: int
    sample_comments: list[str]


class InteractionReport(BaseModel):
    kpi: KpiStats
    monthly: list[MonthlyPoint]
    follower_breakdown: FollowerBreakdown
    top_fans: list[TopFan]
    top_posts: list[TopPost]
    top_commenters: list[TopCommenter]


@router.get("", response_model=InteractionReport)
async def get_interaction_report(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")

    # ── KPI ──────────────────────────────────────────────────────────────────
    kpi_row = (await db.execute(
        select(
            func.count(Post.id),
            func.coalesce(func.sum(Post.like_count), 0),
            func.coalesce(func.sum(Post.comment_count), 0),
            func.coalesce(func.avg(Post.like_count), 0),
            func.coalesce(func.avg(Post.comment_count), 0),
            func.coalesce(func.max(Post.like_count), 0),
        ).where(Post.session_id == session_id)
    )).one()

    unique_users = (await db.execute(
        select(func.count(func.distinct(Interaction.ig_user_id)))
        .where(Interaction.session_id == session_id)
    )).scalar_one() or 0

    synced_total = (await db.execute(
        select(func.count(Interaction.id))
        .where(Interaction.session_id == session_id)
    )).scalar_one() or 0

    kpi = KpiStats(
        total_posts=kpi_row[0] or 0,
        total_likes=int(kpi_row[1]),
        total_comments=int(kpi_row[2]),
        avg_likes=round(float(kpi_row[3]), 1),
        avg_comments=round(float(kpi_row[4]), 1),
        max_likes=int(kpi_row[5]),
        unique_interactors=unique_users,
        synced_interactions=synced_total,
    )

    # ── Monthly ──────────────────────────────────────────────────────────────
    monthly_rows = (await db.execute(
        select(
            func.to_char(Post.taken_at, 'YYYY-MM').label('month'),
            func.sum(Post.like_count).label('total_likes'),
            func.avg(Post.like_count).label('avg_likes'),
            func.count(Post.id).label('post_count'),
        )
        .where(Post.session_id == session_id, Post.taken_at.isnot(None))
        .group_by('month')
        .order_by('month')
    )).all()

    monthly = [
        MonthlyPoint(
            month=r.month,
            total_likes=int(r.total_likes or 0),
            avg_likes=round(float(r.avg_likes or 0), 1),
            post_count=int(r.post_count),
        )
        for r in monthly_rows
    ]

    # ── Follower breakdown ────────────────────────────────────────────────────
    fl_rows = (await db.execute(text("""
        SELECT
          CASE WHEN r.they_follow = true THEN 'follower' ELSE 'outsider' END as grp,
          COUNT(DISTINCT i.ig_user_id) as users,
          COUNT(i.id) as likes
        FROM interactions i
        LEFT JOIN relationships r
          ON r.ig_user_id = i.ig_user_id AND r.session_id = :sid
        WHERE i.session_id = :sid AND i.interaction_type = 'like'
        GROUP BY grp
    """), {"sid": str(session_id)})).all()

    fb = {"follower": (0, 0), "outsider": (0, 0)}
    for r in fl_rows:
        fb[r.grp] = (int(r.likes), int(r.users))

    follower_breakdown = FollowerBreakdown(
        follower_likes=fb["follower"][0],
        outsider_likes=fb["outsider"][0],
        follower_users=fb["follower"][1],
        outsider_users=fb["outsider"][1],
    )

    # ── Top fans ─────────────────────────────────────────────────────────────
    fan_rows = (await db.execute(
        select(
            IgUser.username,
            IgUser.full_name,
            func.count(Interaction.id).filter(Interaction.interaction_type == 'like').label('lc'),
            func.count(Interaction.id).filter(Interaction.interaction_type == 'comment').label('cc'),
            func.count(Interaction.id).label('total'),
        )
        .join(IgUser, Interaction.ig_user_id == IgUser.id)
        .where(Interaction.session_id == session_id)
        .group_by(IgUser.id)
        .order_by(func.count(Interaction.id).desc())
        .limit(15)
    )).all()

    top_fans = [
        TopFan(username=r.username, full_name=r.full_name,
               like_count=int(r.lc), comment_count=int(r.cc), total=int(r.total))
        for r in fan_rows
    ]

    # ── Top posts ─────────────────────────────────────────────────────────────
    post_rows = (await db.execute(
        select(
            Post.shortcode,
            Post.taken_at,
            Post.like_count,
            Post.comment_count,
            func.count(Interaction.id).filter(Interaction.interaction_type == 'like').label('sl'),
            func.count(Interaction.id).filter(Interaction.interaction_type == 'comment').label('sc'),
        )
        .outerjoin(Interaction, and_(Interaction.post_id == Post.id, Interaction.session_id == session_id))
        .where(Post.session_id == session_id)
        .group_by(Post.id)
        .order_by(Post.like_count.desc())
        .limit(10)
    )).all()

    top_posts = [
        TopPost(
            shortcode=r.shortcode,
            taken_at=r.taken_at.strftime('%d %b %Y') if r.taken_at else None,
            like_count=r.like_count or 0,
            comment_count=r.comment_count or 0,
            synced_likes=int(r.sl),
            synced_comments=int(r.sc),
        )
        for r in post_rows
    ]

    # ── Top commenters ────────────────────────────────────────────────────────
    comm_rows = (await db.execute(
        select(
            IgUser.username,
            IgUser.full_name,
            func.count(Interaction.id).label('cc'),
            func.array_agg(func.substring(Interaction.content, 1, 50)).label('samples'),
        )
        .join(IgUser, Interaction.ig_user_id == IgUser.id)
        .where(Interaction.session_id == session_id, Interaction.interaction_type == 'comment',
               Interaction.content.isnot(None))
        .group_by(IgUser.id)
        .order_by(func.count(Interaction.id).desc())
        .limit(10)
    )).all()

    top_commenters = [
        TopCommenter(
            username=r.username,
            full_name=r.full_name,
            comment_count=int(r.cc),
            sample_comments=[s for s in (r.samples or []) if s][:3],
        )
        for r in comm_rows
    ]

    return InteractionReport(
        kpi=kpi,
        monthly=monthly,
        follower_breakdown=follower_breakdown,
        top_fans=top_fans,
        top_posts=top_posts,
        top_commenters=top_commenters,
    )
