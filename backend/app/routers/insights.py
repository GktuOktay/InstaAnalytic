"""Takipçi etkileşim skorları: kim gerçekten ilgili, kim soğuyor."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.relationship import Relationship
from app.models.session import Session
from app.routers.privacy import _csv_response

router = APIRouter(prefix="/sessions/{session_id}/insights", tags=["insights"])

_COMMENT_WEIGHT = 3   # yorum, beğeniden daha güçlü ilgi sinyali


class FanRow(BaseModel):
    ig_user_id: int
    username: str
    full_name: str | None
    follows_me: bool
    likes: int
    comments: int
    posts_engaged: int
    engagement_rate: float      # etkileşime girdiği gönderi / incelenen gönderi (%)
    score: int                  # 0-100
    tier: str                   # super | active | occasional | silent
    trend: str                  # warming | cooling | steady | new


class FansResponse(BaseModel):
    total_posts: int
    scanned_posts: int
    enough_data: bool
    fans: list[FanRow]


def _tier(rate: float) -> str:
    return "super" if rate >= 50 else "active" if rate >= 20 else "occasional" if rate > 0 else "silent"


async def compute_fans(db: AsyncSession, session_id: uuid.UUID) -> FansResponse:
    posts = (await db.execute(
        select(Post.id, Post.taken_at).where(Post.session_id == session_id).order_by(Post.taken_at.desc().nullslast())
    )).all()
    total = len(posts)
    if total == 0:
        return FansResponse(total_posts=0, scanned_posts=0, enough_data=False, fans=[])

    # Etkileşimler yalnızca taranan gönderiler için var; skoru sadece onlar üzerinden hesapla
    scanned_ids = {pid for (pid,) in (await db.execute(
        select(Interaction.post_id).where(Interaction.session_id == session_id).distinct()
    )).all()}
    ordered = [pid for pid, _ in posts if pid in scanned_ids]       # yeniden eskiye
    scanned = len(ordered)
    if scanned == 0:
        return FansResponse(total_posts=total, scanned_posts=0, enough_data=False, fans=[])
    half = max(1, scanned // 2)
    recent_ids, older_ids = set(ordered[:half]), set(ordered[half:])

    rows = (await db.execute(
        select(Interaction.ig_user_id, Interaction.post_id, Interaction.interaction_type)
        .where(Interaction.session_id == session_id)
    )).all()
    agg: dict[int, dict] = {}
    for uid, pid, kind in rows:
        a = agg.setdefault(uid, {"likes": 0, "comments": 0, "posts": set(), "recent": set(), "older": set()})
        a["likes" if kind == "like" else "comments"] += 1
        a["posts"].add(pid)
        (a["recent"] if pid in recent_ids else a["older"]).add(pid)

    followers = {r.ig_user_id for r in (await db.execute(
        select(Relationship.ig_user_id).where(and_(Relationship.session_id == session_id, Relationship.they_follow.is_(True)))
    )).all()}
    users = {u.id: u for u in (await db.execute(select(IgUser).where(IgUser.id.in_(list(agg) or [0])))).scalars()}

    raw = {uid: a["likes"] + _COMMENT_WEIGHT * a["comments"] for uid, a in agg.items()}
    top = max(raw.values(), default=1) or 1
    out: list[FanRow] = []
    for uid, a in agg.items():
        u = users.get(uid)
        if not u:
            continue
        rate = round(100 * len(a["posts"]) / scanned, 1)
        r_rate = len(a["recent"]) / max(1, len(recent_ids))
        o_rate = len(a["older"]) / max(1, len(older_ids)) if older_ids else r_rate
        trend = ("new" if not a["older"] and older_ids else
                 "warming" if r_rate - o_rate >= 0.15 else
                 "cooling" if o_rate - r_rate >= 0.15 else "steady")
        out.append(FanRow(
            ig_user_id=uid, username=u.username, full_name=u.full_name, follows_me=uid in followers,
            likes=a["likes"], comments=a["comments"], posts_engaged=len(a["posts"]), engagement_rate=rate,
            score=round(100 * raw[uid] / top), tier=_tier(rate), trend=trend,
        ))
    out.sort(key=lambda f: (-f.score, f.username))
    return FansResponse(total_posts=total, scanned_posts=scanned, enough_data=scanned >= 5, fans=out)


async def _check(session_id: uuid.UUID, db: AsyncSession) -> None:
    if not await db.get(Session, session_id):
        raise HTTPException(404, "Session bulunamadı")


@router.get("/fans", response_model=FansResponse)
async def fans(session_id: uuid.UUID, limit: int = 200, db: AsyncSession = Depends(get_db)):
    await _check(session_id, db)
    res = await compute_fans(db, session_id)
    res.fans = res.fans[: max(1, min(limit, 2000))]
    return res


@router.get("/fans.csv")
async def fans_csv(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _check(session_id, db)
    res = await compute_fans(db, session_id)
    return _csv_response(
        "etkilesim-skorlari.csv",
        ["kullanıcı adı", "beni takip ediyor", "beğeni", "yorum", "etkileşim oranı %", "skor", "seviye", "eğilim"],
        [[f.username, "evet" if f.follows_me else "hayır", f.likes, f.comments, f.engagement_rate, f.score, f.tier, f.trend]
         for f in res.fans],
    )
