"""
ZIP export'unda kullanıcı ID'si yok, sadece kullanıcı adı var.
ID'si bilinmeyen kullanıcılara kullanıcı adından türetilen NEGATİF bir yer tutucu ID verilir
(gerçek Instagram ID'leri her zaman pozitif). Gerçek ID, yalnızca aksiyon anında çözülür.
"""
import hashlib
import uuid


def placeholder_id(username: str) -> int:
    digest = hashlib.sha1(username.strip().lower().encode()).digest()
    return -(int.from_bytes(digest[:7], "big") + 1)       # 56 bit: BigInteger'a sığar, 0 olamaz


def is_placeholder(user_id: int) -> bool:
    return int(user_id) < 0


def resolve_placeholder(db, old_id: int, real_id: int) -> None:
    """Yer tutucu ID'yi gerçek ID ile değiştir (sync SQLAlchemy session). Commit çağıranda."""
    from sqlalchemy import update, delete, select
    from app.models.ig_user import IgUser
    from app.models.relationship import Relationship
    from app.models.interaction import Interaction
    from app.models.action_log import ActionLog

    old = db.get(IgUser, old_id)
    if old is None or old_id == real_id:
        return
    if db.get(IgUser, real_id) is None:
        db.add(IgUser(id=real_id, username=old.username, full_name=old.full_name,
                      profile_pic_url=old.profile_pic_url, is_private=old.is_private,
                      is_verified=old.is_verified))
        db.flush()

    for rel in db.execute(select(Relationship).where(Relationship.ig_user_id == old_id)).scalars().all():
        target = db.get(Relationship, (rel.session_id, real_id))
        if target:
            target.we_follow = target.we_follow or rel.we_follow
            target.they_follow = target.they_follow or rel.they_follow
            db.delete(rel)
        else:
            db.add(Relationship(session_id=rel.session_id, ig_user_id=real_id,
                                we_follow=rel.we_follow, they_follow=rel.they_follow,
                                we_follow_since=rel.we_follow_since, they_follow_since=rel.they_follow_since))
            db.delete(rel)
    db.flush()
    db.execute(update(ActionLog).where(ActionLog.ig_user_id == old_id).values(ig_user_id=real_id))
    # interactions: unique(ig_user_id, post_id, type) çakışırsa eskiyi sil
    for it in db.execute(select(Interaction).where(Interaction.ig_user_id == old_id)).scalars().all():
        clash = db.execute(select(Interaction.id).where(
            Interaction.ig_user_id == real_id, Interaction.post_id == it.post_id,
            Interaction.interaction_type == it.interaction_type)).first()
        if clash:
            db.delete(it)
        else:
            it.ig_user_id = real_id
    db.flush()
    db.delete(old)
