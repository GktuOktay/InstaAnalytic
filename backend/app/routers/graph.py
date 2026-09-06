"""
Faz 7 — İlişki Ağı Verisi (react-force-graph-2d için)
"""
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.base import get_db
from app.models.ig_user import IgUser
from app.models.relationship import Relationship
from app.models.interaction import Interaction
from app.models.session import Session

router = APIRouter(prefix="/sessions/{session_id}/graph", tags=["graph"])


@router.get("")
async def get_graph(
    session_id: uuid.UUID,
    min_engagement: int = Query(0, ge=0),
    limit: int = Query(500, ge=10, le=2000),
    db: AsyncSession = Depends(get_db),
):
    """
    Düğümler: session sahibi + ilişkili tüm kullanıcılar
    Kenarlar: we_follow (→ turuncu), they_follow (← mavi), mutual (↔ yeşil)
    min_engagement: 0'dan küçük etkileşim skoru olan kullanıcıları filtrele
    limit: maksimum düğüm sayısı (en yüksek skordan başlar)
    """
    sid = session_id

    # Session sahibini bul
    session = await db.get(Session, sid)
    if not session:
        return {"nodes": [], "links": []}
    owner_id = session.ig_user_id

    # Etkileşim skorları
    like_sub = (
        select(Interaction.ig_user_id, func.count().label("lc"))
        .where(Interaction.session_id == sid, Interaction.interaction_type == "like")
        .group_by(Interaction.ig_user_id)
        .subquery()
    )
    comment_sub = (
        select(Interaction.ig_user_id, func.count().label("cc"))
        .where(Interaction.session_id == sid, Interaction.interaction_type == "comment")
        .group_by(Interaction.ig_user_id)
        .subquery()
    )
    lc = func.coalesce(like_sub.c.lc, 0)
    cc = func.coalesce(comment_sub.c.cc, 0)
    score = lc + cc * 3

    # İlişkili kullanıcılar
    q = (
        select(
            IgUser,
            Relationship.we_follow,
            Relationship.they_follow,
            lc.label("like_count"),
            cc.label("comment_count"),
            score.label("engagement_score"),
        )
        .join(Relationship, and_(
            Relationship.ig_user_id == IgUser.id,
            Relationship.session_id == sid,
        ))
        .outerjoin(like_sub,    like_sub.c.ig_user_id    == IgUser.id)
        .outerjoin(comment_sub, comment_sub.c.ig_user_id == IgUser.id)
        .where(score >= min_engagement)
        .order_by(score.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()

    # Owner node
    owner_user = await db.get(IgUser, owner_id)

    nodes: list[dict] = []
    links: list[dict] = []
    node_ids: set[int] = set()

    # Sahibi ekle
    if owner_user:
        nodes.append({
            "id":               owner_id,
            "username":         owner_user.username,
            "full_name":        owner_user.full_name,
            "follower_count":   owner_user.follower_count or 0,
            "is_verified":      owner_user.is_verified,
            "is_private":       owner_user.is_private,
            "like_count":       0,
            "comment_count":    0,
            "engagement_score": 0,
            "node_type":        "owner",   # renk kodu için
        })
        node_ids.add(owner_id)

    for row in rows:
        u = row.IgUser
        if u.id == owner_id:
            continue
        if u.id not in node_ids:
            nodes.append({
                "id":               u.id,
                "username":         u.username,
                "full_name":        u.full_name,
                "follower_count":   u.follower_count or 0,
                "is_verified":      u.is_verified,
                "is_private":       u.is_private,
                "like_count":       row.like_count,
                "comment_count":    row.comment_count,
                "engagement_score": row.engagement_score,
                "node_type":        "mutual" if row.we_follow and row.they_follow
                                    else "follower" if row.they_follow
                                    else "following",
            })
            node_ids.add(u.id)

        # Kenar(lar)
        if row.we_follow and row.they_follow:
            links.append({"source": owner_id, "target": u.id, "type": "mutual"})
        elif row.we_follow:
            links.append({"source": owner_id, "target": u.id, "type": "following"})
        elif row.they_follow:
            links.append({"source": u.id, "target": owner_id, "type": "follower"})

    return {
        "owner_id":  owner_id,
        "nodes":     nodes,
        "links":     links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
        },
    }
