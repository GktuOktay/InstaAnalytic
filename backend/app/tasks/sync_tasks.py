import json
import time
import random
import logging
from datetime import datetime, timezone
from app.tasks.celery_app import celery_app
from app.core.security import decrypt

logger = logging.getLogger(__name__)


def _get_sync_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url)
    return sessionmaker(bind=engine)()


def _load_cookies(session_obj) -> dict:
    data = json.loads(decrypt(session_obj.session_data))
    return data.get("cookies", {})


def _upsert_ig_user(db, user_info_dict: dict) -> int:
    """instagrapi UserInfo object veya Plan B düz dict kabul eder."""
    from app.models.ig_user import IgUser

    # instagrapi object
    if hasattr(user_info_dict, 'pk'):
        uid = int(user_info_dict.pk)
        existing = db.get(IgUser, uid)
        if existing:
            existing.username        = str(user_info_dict.username)
            existing.full_name       = user_info_dict.full_name
            existing.profile_pic_url = str(user_info_dict.profile_pic_url) if user_info_dict.profile_pic_url else None
            existing.is_private      = user_info_dict.is_private
            existing.is_verified     = user_info_dict.is_verified
            existing.follower_count  = user_info_dict.follower_count
            existing.following_count = user_info_dict.following_count
            existing.post_count      = user_info_dict.media_count
            existing.last_synced_at  = datetime.now(timezone.utc)
        else:
            db.add(IgUser(
                id=uid,
                username=str(user_info_dict.username),
                full_name=user_info_dict.full_name,
                profile_pic_url=str(user_info_dict.profile_pic_url) if user_info_dict.profile_pic_url else None,
                is_private=user_info_dict.is_private,
                is_verified=user_info_dict.is_verified,
                follower_count=user_info_dict.follower_count,
                following_count=user_info_dict.following_count,
                post_count=user_info_dict.media_count,
                last_synced_at=datetime.now(timezone.utc),
            ))
        return uid

    # Plan B — dict
    uid = int(user_info_dict.get("pk") or user_info_dict.get("id", 0))
    if not uid:
        return 0
    existing = db.get(IgUser, uid)
    if existing:
        existing.username        = user_info_dict.get("username", existing.username)
        existing.full_name       = user_info_dict.get("full_name")
        existing.profile_pic_url = user_info_dict.get("profile_pic_url")
        existing.is_private      = bool(user_info_dict.get("is_private", False))
        existing.is_verified     = bool(user_info_dict.get("is_verified", False))
        existing.follower_count  = user_info_dict.get("follower_count")
        existing.following_count = user_info_dict.get("following_count")
        existing.last_synced_at  = datetime.now(timezone.utc)
    else:
        db.add(IgUser(
            id=uid,
            username=user_info_dict.get("username", f"user_{uid}"),
            full_name=user_info_dict.get("full_name"),
            profile_pic_url=user_info_dict.get("profile_pic_url"),
            is_private=bool(user_info_dict.get("is_private", False)),
            is_verified=bool(user_info_dict.get("is_verified", False)),
            follower_count=user_info_dict.get("follower_count"),
            following_count=user_info_dict.get("following_count"),
            last_synced_at=datetime.now(timezone.utc),
        ))
    return uid


def _upsert_relationship(db, session_id, ig_user_id: int, we_follow=None, they_follow=None):
    from app.models.relationship import Relationship
    import uuid
    sid = uuid.UUID(str(session_id))
    rel = db.get(Relationship, (sid, ig_user_id))
    if rel:
        if we_follow is not None:   rel.we_follow   = we_follow
        if they_follow is not None: rel.they_follow  = they_follow
        rel.last_checked_at = datetime.now(timezone.utc)
    else:
        rel = Relationship(
            session_id=sid, ig_user_id=ig_user_id,
            we_follow=we_follow or False, they_follow=they_follow or False,
        )
        db.add(rel)


def _activate_plan_b(db, session_obj):
    session_obj.plan_b_active = True
    db.commit()
    logger.info("Plan B aktif edildi: %s", session_obj.ig_username)


# ── sync_followers ─────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="sync_followers")
def sync_followers(self, session_id: str, job_id: str):
    from app.models.session import Session
    from app.models.sync_job import SyncJob
    from app.services.instagram import PLAN_B_EXCEPTIONS
    import uuid

    db = _get_sync_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        job = db.get(SyncJob, uuid.UUID(job_id))
        cookies = _load_cookies(session)

        # ── Plan B (Playwright) ────────────────────────────────────────────────
        if not session.plan_b_active:
            _activate_plan_b(db, session)

        from app.services.playwright_instagram import get_followers as pw_followers
        self.update_state(state="PROGRESS", meta={"current": 0, "total": 0, "step": "followers", "plan": "B"})

        user_id_str = str(session.ig_user_id)
        total = 0
        for batch in pw_followers(cookies, user_id_str):
            for user_dict in batch:
                ig_uid = _upsert_ig_user(db, user_dict)
                if ig_uid:
                    _upsert_relationship(db, session_id, ig_uid, they_follow=True)
                    total += 1
            db.commit()
            self.update_state(state="PROGRESS", meta={"current": total, "total": total, "step": "followers", "plan": "B"})

        if job: job.status = "completed"; job.processed_items = total; job.finished_at = datetime.now(timezone.utc); db.commit()
        return {"status": "completed", "total": total, "plan": "B"}

    except Exception as e:
        logger.exception("sync_followers failed")
        db.rollback()
        if 'job' in locals() and job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()


# ── sync_following ─────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="sync_following")
def sync_following(self, session_id: str, job_id: str):
    from app.models.session import Session
    from app.models.sync_job import SyncJob
    from app.services.instagram import PLAN_B_EXCEPTIONS
    import uuid

    db = _get_sync_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        job = db.get(SyncJob, uuid.UUID(job_id))
        cookies = _load_cookies(session)

        # ── Plan B (Playwright) ────────────────────────────────────────────────
        if not session.plan_b_active:
            _activate_plan_b(db, session)

        from app.services.playwright_instagram import get_following as pw_following
        self.update_state(state="PROGRESS", meta={"current": 0, "total": 0, "step": "following", "plan": "B"})

        user_id_str = str(session.ig_user_id)
        total = 0
        for batch in pw_following(cookies, user_id_str):
            for user_dict in batch:
                ig_uid = _upsert_ig_user(db, user_dict)
                if ig_uid:
                    _upsert_relationship(db, session_id, ig_uid, we_follow=True)
                    total += 1
            db.commit()
            self.update_state(state="PROGRESS", meta={"current": total, "total": total, "step": "following", "plan": "B"})

        if job: job.status = "completed"; job.processed_items = total; job.finished_at = datetime.now(timezone.utc); db.commit()
        return {"status": "completed", "total": total, "plan": "B"}

    except Exception as e:
        logger.exception("sync_following failed")
        db.rollback()
        if 'job' in locals() and job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()


# ── sync_posts (Plan A only — Playwright video/resim scraping karmaşık) ────────

@celery_app.task(bind=True, name="sync_posts")
def sync_posts(self, session_id: str, job_id: str):
    from app.models.session import Session
    from app.models.post import Post
    from app.models.sync_job import SyncJob
    import uuid

    db = _get_sync_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        job = db.get(SyncJob, uuid.UUID(job_id))

        if not session.plan_b_active:
            _activate_plan_b(db, session)

        cookies = _load_cookies(session)
        ig_user_id = str(session.ig_user_id)

        from app.services.playwright_instagram import get_posts
        self.update_state(state="PROGRESS", meta={"current": 0, "total": 0, "step": "posts", "plan": "B"})

        ig_username = session.ig_username or ""
        total = 0
        i = 0
        for batch in get_posts(cookies, ig_user_id, ig_username):
            for media in batch:
                # Post ID — API v1: "3672...\_525...", graphql: pure numeric string
                raw_id = str(media.get("id") or media.get("pk") or "")
                if not raw_id:
                    continue
                try:
                    post_id = int(raw_id.split("_")[0])
                except (ValueError, IndexError):
                    continue
                if not post_id:
                    continue

                # Thumbnail — v1 format
                thumb = None
                if media.get("image_versions2"):
                    candidates = media["image_versions2"].get("candidates", [])
                    if candidates:
                        thumb = candidates[0].get("url")
                if not thumb and media.get("video_versions"):
                    thumb = media["video_versions"][0].get("url")
                if not thumb and media.get("carousel_media"):
                    first = media["carousel_media"][0]
                    cands = first.get("image_versions2", {}).get("candidates", [])
                    if cands:
                        thumb = cands[0].get("url")
                # GraphQL relay format thumbnail
                if not thumb:
                    thumb = media.get("thumbnail_src") or media.get("display_url")
                if not thumb and media.get("thumbnail_resources"):
                    thumb = media["thumbnail_resources"][-1].get("src")

                # Media type
                media_type_int = media.get("media_type")
                if media_type_int is not None:
                    if media_type_int == 1:
                        media_type_str = "PHOTO"
                    elif media_type_int == 2:
                        media_type_str = "VIDEO"
                    elif media_type_int == 8:
                        media_type_str = "ALBUM"
                    else:
                        media_type_str = str(media_type_int)
                else:
                    # GraphQL relay: __typename
                    typename = media.get("__typename", "")
                    if "Video" in typename:
                        media_type_str = "VIDEO"
                    elif "Sidecar" in typename or "Album" in typename:
                        media_type_str = "ALBUM"
                    else:
                        media_type_str = "PHOTO"

                # Caption
                caption_text = None
                cap = media.get("caption")
                if cap and isinstance(cap, dict):
                    caption_text = cap.get("text")
                elif isinstance(cap, str):
                    caption_text = cap
                if not caption_text:
                    # GraphQL relay: edge_media_to_caption
                    try:
                        edges = media.get("edge_media_to_caption", {}).get("edges", [])
                        if edges:
                            caption_text = edges[0]["node"]["text"]
                    except Exception:
                        pass

                # Shortcode
                shortcode = media.get("code") or media.get("shortcode")

                # Taken at
                taken_at_ts = media.get("taken_at") or media.get("taken_at_timestamp")
                taken_at = datetime.fromtimestamp(float(taken_at_ts), tz=timezone.utc) if taken_at_ts else None

                # Counts — v1 or graphql relay
                like_count = media.get("like_count", 0)
                if not like_count:
                    try:
                        like_count = media.get("edge_liked_by", {}).get("count", 0) or media.get("edge_media_preview_like", {}).get("count", 0)
                    except Exception:
                        like_count = 0
                comment_count = media.get("comment_count", 0)
                if not comment_count:
                    try:
                        comment_count = media.get("edge_media_to_comment", {}).get("count", 0)
                    except Exception:
                        comment_count = 0

                if not shortcode:
                    logger.warning("sync_posts: post %d has no shortcode, skipping", post_id)
                    continue

                existing = db.get(Post, post_id)
                if existing:
                    existing.like_count = like_count
                    existing.comment_count = comment_count
                    existing.view_count = media.get("view_count")
                    existing.last_synced_at = datetime.now(timezone.utc)
                else:
                    db.add(Post(
                        id=post_id,
                        session_id=uuid.UUID(session_id),
                        shortcode=shortcode,
                        media_type=media_type_str,
                        thumbnail_url=thumb,
                        caption=caption_text,
                        like_count=like_count,
                        comment_count=comment_count,
                        view_count=media.get("view_count"),
                        taken_at=taken_at,
                        last_synced_at=datetime.now(timezone.utc),
                    ))
                i += 1
                total = i

            db.commit()
            if job:
                job.processed_items = total
                db.commit()
            self.update_state(state="PROGRESS", meta={"current": total, "total": total, "step": "posts", "plan": "B"})

        db.commit()
        if job: job.status = "completed"; job.processed_items = total; job.finished_at = datetime.now(timezone.utc); db.commit()

        # Her gönderi için beğeni/yorum sync task'ı tetikle
        from app.models.post import Post as PostModel
        from sqlalchemy import select as sa_select
        all_posts = db.execute(
            sa_select(PostModel.id).where(PostModel.session_id == uuid.UUID(session_id))
        ).scalars().all()
        for pid in all_posts:
            fake_job_id = str(uuid.uuid4())
            sync_post_interactions.delay(session_id, pid, fake_job_id)
        logger.info("sync_posts: queued interaction sync for %d posts", len(all_posts))

        return {"status": "completed", "total": total, "plan": "B"}

    except Exception as e:
        logger.exception("sync_posts failed")
        db.rollback()
        if 'job' in locals() and job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()


# ── sync_post_interactions ─────────────────────────────────────────────────────

@celery_app.task(bind=True, name="sync_post_interactions")
def sync_post_interactions(self, session_id: str, post_id: int, job_id: str):
    from app.models.session import Session
    from app.models.interaction import Interaction
    from app.models.sync_job import SyncJob
    import uuid

    db = _get_sync_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        if not session.plan_b_active:
            _activate_plan_b(db, session)

        cookies = _load_cookies(session)

        like_count = 0
        comment_count = 0

        # Likers
        try:
            from app.services.playwright_instagram import get_post_likers
            for batch in get_post_likers(cookies, post_id):
                for user_info in batch:
                    uid = int(user_info.get("pk") or user_info.get("id") or 0)
                    if not uid:
                        continue
                    _upsert_ig_user(db, user_info)
                    existing = db.query(Interaction).filter_by(
                        ig_user_id=uid, post_id=post_id, interaction_type="like"
                    ).first()
                    if not existing:
                        db.add(Interaction(
                            session_id=uuid.UUID(session_id), ig_user_id=uid,
                            post_id=post_id, interaction_type="like",
                        ))
                    like_count += 1
            db.commit()
            logger.info("sync_post_interactions: %d likers for post %s", like_count, post_id)
        except Exception as e:
            logger.warning("Likers fetch error for post %s: %s", post_id, e)

        time.sleep(random.uniform(1.5, 3.0))

        # Comments
        try:
            from app.services.playwright_instagram import get_post_comments
            for batch in get_post_comments(cookies, post_id):
                for comment in batch:
                    user = comment.get("user", {})
                    uid = int(user.get("pk") or user.get("id") or 0)
                    if not uid:
                        continue
                    _upsert_ig_user(db, user)
                    text = comment.get("text", "")
                    ts = comment.get("created_at") or comment.get("created_at_utc")
                    interacted_at = datetime.fromtimestamp(float(ts), tz=timezone.utc) if ts else None
                    existing = db.query(Interaction).filter_by(
                        ig_user_id=uid, post_id=post_id, interaction_type="comment",
                        content=text,
                    ).first()
                    if not existing:
                        db.add(Interaction(
                            session_id=uuid.UUID(session_id), ig_user_id=uid,
                            post_id=post_id, interaction_type="comment",
                            content=text, interacted_at=interacted_at,
                        ))
                    comment_count += 1
            db.commit()
            logger.info("sync_post_interactions: %d comments for post %s", comment_count, post_id)
        except Exception as e:
            logger.warning("Comments fetch error for post %s: %s", post_id, e)

        return {"status": "completed", "post_id": post_id, "likes": like_count, "comments": comment_count}

    except Exception as e:
        logger.exception("sync_post_interactions failed")
        db.rollback()
        raise
    finally:
        db.close()


# ── sync_all_interactions ──────────────────────────────────────────────────────

@celery_app.task(bind=True, name="sync_all_interactions")
def sync_all_interactions(self, session_id: str, job_id: str):
    """Tüm gönderiler için like/yorum senkronizasyonu başlatır."""
    from app.models.session import Session
    from app.models.post import Post as PostModel
    from app.models.sync_job import SyncJob
    from sqlalchemy import select as sa_select
    import uuid

    db = _get_sync_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        job = db.get(SyncJob, uuid.UUID(job_id))

        if not session.plan_b_active:
            _activate_plan_b(db, session)

        all_post_ids = db.execute(
            sa_select(PostModel.id).where(PostModel.session_id == uuid.UUID(session_id))
        ).scalars().all()

        total = len(all_post_ids)
        self.update_state(state="PROGRESS", meta={"current": 0, "total": total, "step": "queuing"})

        for i, pid in enumerate(all_post_ids):
            fake_job_id = str(uuid.uuid4())
            sync_post_interactions.delay(session_id, pid, fake_job_id)
            self.update_state(state="PROGRESS", meta={"current": i + 1, "total": total, "step": "queuing"})

        if job:
            job.status = "completed"
            job.processed_items = total
            job.finished_at = datetime.now(timezone.utc)
            db.commit()

        logger.info("sync_all_interactions: queued %d interaction tasks", total)
        return {"status": "completed", "queued": total}

    except Exception as e:
        logger.exception("sync_all_interactions failed")
        db.rollback()
        if 'job' in locals() and job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()
