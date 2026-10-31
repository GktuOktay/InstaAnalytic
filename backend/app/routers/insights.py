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


# ── Gözden çıkarma: kim hiç etkileşime girmiyor ─────────────────────────────────

CLEANUP_MIN_POSTS = 10
LOYAL_RATE = 30.0           # incelenen gönderilerin en az %30'unda etkileşim
CLEANUP_GROUPS = ("ghost", "one_way_silent", "mutual_silent", "silent_follower", "one_way_engaged", "occasional", "loyal")


class CleanupRow(BaseModel):
    ig_user_id: int
    username: str
    full_name: str | None
    i_follow: bool
    follows_me: bool
    likes: int
    comments: int
    posts_engaged: int
    engagement_rate: float
    last_engaged_at: str | None
    group: str


class CleanupResponse(BaseModel):
    total_posts: int
    scanned_posts: int
    min_posts: int
    enough_data: bool
    followers_known: int
    following_known: int
    counts: dict[str, int]
    total_rows: int
    rows: list[CleanupRow]


def _cleanup_group(i_follow: bool, follows_me: bool, engaged: int, rate: float, ghost: bool) -> str:
    if ghost:
        return "ghost"
    if engaged == 0:
        if i_follow and not follows_me:
            return "one_way_silent"
        return "mutual_silent" if i_follow else "silent_follower"
    if rate >= LOYAL_RATE:
        return "loyal"
    return "one_way_engaged" if i_follow and not follows_me else "occasional"


async def compute_cleanup(db: AsyncSession, session_id: uuid.UUID) -> tuple[CleanupResponse, list[CleanupRow]]:
    posts = (await db.execute(
        select(Post.id, Post.taken_at, Post.likers_synced_at).where(Post.session_id == session_id)
    )).all()
    taken = {pid: t for pid, t, _ in posts}
    scanned_ids = {pid for pid, _, synced in posts if synced is not None}
    scanned_ids |= {pid for (pid,) in (await db.execute(
        select(Interaction.post_id).where(Interaction.session_id == session_id).distinct()
    )).all()}
    scanned = len(scanned_ids)

    agg: dict[int, dict] = {}
    for uid, pid, kind in (await db.execute(
        select(Interaction.ig_user_id, Interaction.post_id, Interaction.interaction_type)
        .where(Interaction.session_id == session_id)
    )).all():
        a = agg.setdefault(uid, {"likes": 0, "comments": 0, "posts": set()})
        a["likes" if kind == "like" else "comments"] += 1
        a["posts"].add(pid)

    rels = (await db.execute(
        select(Relationship.ig_user_id, Relationship.we_follow, Relationship.they_follow,
               IgUser.username, IgUser.full_name, IgUser.reach_status)
        .join(IgUser, IgUser.id == Relationship.ig_user_id)
        .where(Relationship.session_id == session_id, (Relationship.we_follow.is_(True)) | (Relationship.they_follow.is_(True)))
    )).all()

    rows: list[CleanupRow] = []
    for uid, we, they, username, full_name, reach in rels:
        a = agg.get(uid, {"likes": 0, "comments": 0, "posts": set()})
        engaged = len(a["posts"])
        rate = round(100 * engaged / scanned, 1) if scanned else 0.0
        last = max((taken[p] for p in a["posts"] if taken.get(p)), default=None)
        rows.append(CleanupRow(
            ig_user_id=uid, username=username, full_name=full_name, i_follow=bool(we), follows_me=bool(they),
            likes=a["likes"], comments=a["comments"], posts_engaged=engaged, engagement_rate=rate,
            last_engaged_at=last.isoformat() if last else None,
            group=_cleanup_group(bool(we), bool(they), engaged, rate, reach == "unreachable"),
        ))
    counts = {g: 0 for g in CLEANUP_GROUPS}
    for r in rows:
        counts[r.group] += 1
    rows.sort(key=lambda r: (r.posts_engaged, r.likes + _COMMENT_WEIGHT * r.comments, r.username.lower()))
    res = CleanupResponse(
        total_posts=len(posts), scanned_posts=scanned, min_posts=CLEANUP_MIN_POSTS,
        enough_data=scanned >= CLEANUP_MIN_POSTS,
        followers_known=sum(1 for r in rows if r.follows_me), following_known=sum(1 for r in rows if r.i_follow),
        counts=counts, total_rows=0, rows=[],
    )
    return res, rows


def _filter_cleanup(rows: list[CleanupRow], group: str | None, q: str | None) -> list[CleanupRow]:
    needle = (q or "").strip().lower().lstrip("@")
    return [r for r in rows if (not group or r.group == group) and (not needle or needle in r.username.lower())]


@router.get("/cleanup", response_model=CleanupResponse)
async def cleanup(session_id: uuid.UUID, group: str | None = None, q: str | None = None,
                  page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await _check(session_id, db)
    if group and group not in CLEANUP_GROUPS:
        raise HTTPException(400, "Bilinmeyen grup")
    res, rows = await compute_cleanup(db, session_id)
    picked = _filter_cleanup(rows, group, q)
    limit = max(1, min(limit, 200))
    start = (max(1, page) - 1) * limit
    res.total_rows = len(picked)
    res.rows = picked[start:start + limit]
    return res


@router.get("/cleanup.csv")
async def cleanup_csv(session_id: uuid.UUID, group: str | None = None, db: AsyncSession = Depends(get_db)):
    await _check(session_id, db)
    _, rows = await compute_cleanup(db, session_id)
    return _csv_response(
        "gozden-cikar.csv",
        ["kullanıcı adı", "grup", "ben takip ediyorum", "beni takip ediyor", "beğeni", "yorum",
         "etkileşimli gönderi", "oran %", "son etkileşim"],
        [[r.username, r.group, "evet" if r.i_follow else "hayır", "evet" if r.follows_me else "hayır",
          r.likes, r.comments, r.posts_engaged, r.engagement_rate, (r.last_engaged_at or "")[:10]]
         for r in _filter_cleanup(rows, group, None)],
    )
