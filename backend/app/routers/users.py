"""
Faz 6 — Kullanıcı Havuzu & Etkileşim Raporları
"""
import csv
import io
import uuid
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, Float

from app.db.base import get_db
from app.models.ig_user import IgUser
from app.models.post import Post
from app.models.relationship import Relationship
from app.models.interaction import Interaction

router = APIRouter(prefix="/sessions/{session_id}/users", tags=["users"])


@router.get("")
async def list_users(
    session_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=5000),
    search: str = Query(""),
    sort: str = Query("engagement"),
    db: AsyncSession = Depends(get_db),
):
    """
    Havuzdaki tüm kullanıcılar.
    engagement_score = beğeni_sayısı / toplam_gönderi * 100  (yüzde)
    """
    sid = session_id

    # Toplam gönderi sayısı (bu session için)
    total_posts_scalar = (await db.execute(
        select(func.count()).where(Post.session_id == sid)
    )).scalar_one() or 1  # sıfıra bölmeyi önle

    # Beğeni ve yorum sayıları
    like_sub = (
        select(
            Interaction.ig_user_id,
            func.count().label("like_count"),
        )
        .where(Interaction.session_id == sid, Interaction.interaction_type == "like")
        .group_by(Interaction.ig_user_id)
        .subquery()
    )
    comment_sub = (
        select(
            Interaction.ig_user_id,
            func.count().label("comment_count"),
        )
        .where(Interaction.session_id == sid, Interaction.interaction_type == "comment")
        .group_by(Interaction.ig_user_id)
        .subquery()
    )

    lc = func.coalesce(like_sub.c.like_count, 0)
    cc = func.coalesce(comment_sub.c.comment_count, 0)
    # Yüzde: kaç gönderinin yüzde kaçını beğenmiş
    score = cast(lc, Float) / total_posts_scalar * 100

    q = (
        select(
            IgUser,
            Relationship.we_follow,
            Relationship.they_follow,
            lc.label("like_count"),
            cc.label("comment_count"),
            score.label("engagement_score"),
        )
        .outerjoin(Relationship, and_(
            Relationship.ig_user_id == IgUser.id,
            Relationship.session_id == sid,
        ))
        .outerjoin(like_sub,    like_sub.c.ig_user_id    == IgUser.id)
        .outerjoin(comment_sub, comment_sub.c.ig_user_id == IgUser.id)
        .where(
            # Havuzda olma koşulu: relationship VEYA en az bir interaction
            (Relationship.session_id == sid) |
            (like_sub.c.ig_user_id != None) |
            (comment_sub.c.ig_user_id != None)
        )
    )

    if search:
        like_pat = f"%{search.lower()}%"
        q = q.where(
            func.lower(IgUser.username).like(like_pat) |
            func.lower(func.coalesce(IgUser.full_name, "")).like(like_pat)
        )

    # Sıralama
    sort_map = {
        "engagement":     score.desc(),
        "engagement_asc": score.asc(),
        "username":       IgUser.username.asc(),
        "username_desc":  IgUser.username.desc(),
    }
    q = q.order_by(sort_map.get(sort, score.desc()))

    # Toplam sayfa
    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar_one()

    q = q.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).all()

    items = []
    for row in rows:
        u = row.IgUser
        items.append({
            "id":               u.id,
            "username":         u.username,
            "full_name":        u.full_name,
            "profile_pic_url":  u.profile_pic_url,
            "is_private":       u.is_private,
            "is_verified":      u.is_verified,
            "follower_count":   u.follower_count,
            "following_count":  u.following_count,
            "we_follow":        row.we_follow,
            "they_follow":      row.they_follow,
            "like_count":       row.like_count,
            "comment_count":    row.comment_count,
            "engagement_score": row.engagement_score,
            "first_seen_at":    u.first_seen_at.isoformat() if u.first_seen_at else None,
        })

    return {"total": total, "page": page, "limit": limit, "items": items}


@router.get("/export/csv")
async def export_users_csv(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Tüm havuzu CSV olarak dışa aktar."""
    # Tüm veriyi çek (limit yok)
    data = await list_users(session_id, page=1, limit=10000, search="", sort="engagement", db=db)
    items = data["items"]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "username", "full_name", "follower_count", "following_count",
        "we_follow", "they_follow", "like_count", "comment_count", "engagement_score", "first_seen_at",
    ])
    writer.writeheader()
    for item in items:
        writer.writerow({k: item.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=instaanalytic_users.csv"},
    )
