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


# ── Bütçeli takipçi / takip taraması ───────────────────────────────────────────

def _make_governor(session_id: str):
    import redis
    from app.core.config import settings
    from app.services.scan_governor import ScanGovernor
    from app.services.risk_profiles import load_profile_sync
    return ScanGovernor(redis.from_url(settings.redis_url), session_id, load_profile_sync(session_id).scan)


def _heal_placeholders(db, user_dicts: list[dict]):
    """ZIP'ten gelen yer tutucu (negatif ID) kayıtlarını gerçek ID'ye bağla."""
    from sqlalchemy import select, func
    from app.models.ig_user import IgUser
    from app.services.user_ids import resolve_placeholder
    by_name = {}
    for u in user_dicts:
        uid = int(u.get("pk") or u.get("id") or 0)
        if uid and u.get("username"):
            by_name[str(u["username"]).lower()] = uid
    if not by_name:
        return
    rows = db.execute(
        select(IgUser.id, func.lower(IgUser.username))
        .where(IgUser.id < 0, func.lower(IgUser.username).in_(list(by_name)))
    ).all()
    for old_id, lname in rows:
        resolve_placeholder(db, old_id, by_name[lname])


def _finish_scan(db, session_id: str, kind: str, flag: str, seen: set[int]) -> dict:
    """Tam tarama bitti: görülmeyenleri 'artık değil' yap, farkı snapshot olarak kaydet."""
    import uuid
    from sqlalchemy import select, update
    from app.core.config import settings
    from app.models.ig_user import IgUser
    from app.models.relationship import Relationship
    from app.models.import_snapshot import ImportSnapshot

    sid = uuid.UUID(session_id)
    col = getattr(Relationship, flag)
    prev = set(db.execute(select(Relationship.ig_user_id).where(Relationship.session_id == sid, col.is_(True))).scalars().all())
    lost = prev - seen
    gained = seen - prev
    sweep_skipped = bool(len(prev) > 20 and len(seen) < settings.scan_min_sweep_ratio * len(prev))
    if sweep_skipped:
        logger.warning("Süpürme atlandı: %d kayıt görüldü, önceki %d (eşik %.0f%%)", len(seen), len(prev), settings.scan_min_sweep_ratio * 100)
    elif lost:
        db.execute(update(Relationship).where(
            Relationship.session_id == sid, Relationship.ig_user_id.in_(list(lost))
        ).values({flag: False, "last_checked_at": datetime.now(timezone.utc)}))

    def names(ids):
        ids = list(ids)[:500]
        return db.execute(select(IgUser.username).where(IgUser.id.in_(ids))).scalars().all() if ids else []

    snap = ImportSnapshot(session_id=sid, source="scan")
    if kind == "followers":
        snap.followers_count, snap.followers_gained, snap.followers_lost = len(seen), names(gained), names(lost)
    else:
        snap.following_count, snap.following_gained, snap.following_lost = len(seen), names(gained), names(lost)
    db.add(snap)
    db.commit()
    return {"gained": len(gained), "lost": 0 if sweep_skipped else len(lost), "sweep_skipped": sweep_skipped}


def _run_budgeted_scan(task, session_id: str, job_id: str, kind: str):
    """
    followers/following taraması — ScanGovernor bütçesi altında, kaldığı yerden devam eder.
    Bütçe dolarsa 'paused' döner (saat/gün dolmasında otomatik devam planlanır);
    Instagram risk sinyali verirse cooldown'a girer ve otomatik devam ETMEZ.
    """
    import uuid
    from datetime import datetime, timezone
    from app.core.config import settings
    from app.models.session import Session
    from app.models.sync_job import SyncJob
    from app.services.scan_governor import ScanPaused
    from app.services.playwright_instagram import get_friendship_pages

    flag = "they_follow" if kind == "followers" else "we_follow"
    gov = _make_governor(session_id)
    if not gov.acquire_lock():
        return {"status": "already_running"}

    db = _get_sync_db()
    job = None
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")
        job = db.get(SyncJob, uuid.UUID(job_id))
        if not session.plan_b_active:
            _activate_plan_b(db, session)
        if job:
            job.status = "running"; job.error_msg = None; db.commit()

        gov.check()   # tarayıcı açmadan önce bütçe/cooldown kontrolü
        cursor = gov.get_cursor(kind)
        if cursor is None:
            gov.clear_scan(kind)          # taze tarama: eski 'görülenler' kalıntısını temizle
        cookies = _load_cookies(session)
        total = len(gov.seen(kind))
        finished = False

        task.update_state(state="PROGRESS", meta={"current": total, "total": total, "step": kind, "plan": "B", "resumed": cursor is not None})
        for page in get_friendship_pages(cookies, str(session.ig_user_id), kind, cursor, gov, settings.scan_page_size):
            if page.get("done"):
                finished = True
                continue
            ids = []
            for user_dict in page["users"]:
                ig_uid = _upsert_ig_user(db, user_dict)
                if ig_uid:
                    ids.append(ig_uid)
                    _upsert_relationship(db, session_id, ig_uid, **{flag: True})
            _heal_placeholders(db, page["users"])
            db.commit()
            gov.add_seen(kind, ids)
            if page["next_cursor"]:
                gov.set_cursor(kind, page["next_cursor"])
            total += len(ids)
            if job:
                job.processed_items = total; db.commit()
            task.update_state(state="PROGRESS", meta={"current": total, "total": total, "step": kind, "plan": "B"})

        if not finished:
            raise RuntimeError("Tarama beklenmedik şekilde yarıda kaldı")
        summary = _finish_scan(db, session_id, kind, flag, gov.seen(kind))
        gov.clear_scan(kind)
        gov.report_clean_finish()
        if job:
            job.status = "completed"; job.processed_items = total
            job.finished_at = datetime.now(timezone.utc); db.commit()
        return {"status": "completed", "total": total, "plan": "B", **summary}

    except ScanPaused as p:
        db.rollback()
        resume_iso = datetime.fromtimestamp(p.resume_at, tz=timezone.utc).isoformat() if p.resume_at else None
        if job:
            job.status = "paused"
            job.error_msg = f"{p.reason} (devam: {resume_iso or 'elle başlat'})"
            db.commit()
        if p.auto_resume and p.resume_at:
            task.apply_async(args=[session_id, job_id], eta=datetime.fromtimestamp(p.resume_at + 30, tz=timezone.utc))
        logger.warning("Tarama duraklatıldı (%s): %s", kind, p.reason)
        return {"status": "paused", "reason": p.reason, "resume_at": resume_iso, "auto_resume": p.auto_resume, "total": total if 'total' in locals() else 0}

    except Exception as e:
        logger.exception("sync_%s failed", kind)
        db.rollback()
        if job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()
        gov.release_lock()


@celery_app.task(bind=True, name="sync_followers")
def sync_followers(self, session_id: str, job_id: str):
    return _run_budgeted_scan(self, session_id, job_id, "followers")


@celery_app.task(bind=True, name="sync_following")
def sync_following(self, session_id: str, job_id: str):
    return _run_budgeted_scan(self, session_id, job_id, "following")


def _handle_pause(task, db, job, p, session_id: str, job_id: str, total: int = 0):
    """ScanPaused -> job'u 'paused' yap; yalnızca bütçe dolmasında otomatik devam planla."""
    resume_iso = datetime.fromtimestamp(p.resume_at, tz=timezone.utc).isoformat() if p.resume_at else None
    db.rollback()
    if job:
        job.status = "paused"
        job.error_msg = f"{p.reason} (devam: {resume_iso or 'elle başlat'})"
        db.commit()
    if p.auto_resume and p.resume_at:
        task.apply_async(args=[session_id, job_id], eta=datetime.fromtimestamp(p.resume_at + 30, tz=timezone.utc))
    logger.warning("%s duraklatıldı: %s", task.name, p.reason)
    return {"status": "paused", "reason": p.reason, "resume_at": resume_iso, "auto_resume": p.auto_resume, "total": total}


# ── sync_posts (Plan A only — Playwright video/resim scraping karmaşık) ────────

@celery_app.task(bind=True, name="sync_posts")
def sync_posts(self, session_id: str, job_id: str):
    from app.models.session import Session
    from app.models.post import Post
    from app.models.sync_job import SyncJob
    import uuid

    from app.services.scan_governor import ScanPaused
    gov = _make_governor(session_id)
    if not gov.acquire_lock():
        return {"status": "already_running"}

    db = _get_sync_db()
    job = None
    total = 0
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")

        job = db.get(SyncJob, uuid.UUID(job_id))
        if job:
            job.status = "running"; job.error_msg = None; db.commit()

        if not session.plan_b_active:
            _activate_plan_b(db, session)

        gov.check()
        cookies = _load_cookies(session)
        ig_user_id = str(session.ig_user_id)

        from app.services.playwright_instagram import get_posts
        self.update_state(state="PROGRESS", meta={"current": 0, "total": 0, "step": "posts", "plan": "B"})

        ig_username = session.ig_username or ""
        total = 0
        i = 0
        for batch in get_posts(cookies, ig_user_id, ig_username, governor=gov):
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

        gov.report_clean_finish()
        # Beğeni/yorum taraması tek bir bütçeli görevde, sırayla ve en yeni N gönderi için çalışır.
        # Önce kilidi bırak ki o görev alabilsin.
        gov.release_lock()
        sync_all_interactions.delay(session_id, str(uuid.uuid4()))
        logger.info("sync_posts: sync_all_interactions kuyruğa alındı")

        return {"status": "completed", "total": total, "plan": "B"}

    except ScanPaused as p:
        return _handle_pause(sync_posts, db, job, p, session_id, job_id, total)

    except Exception as e:
        logger.exception("sync_posts failed")
        db.rollback()
        if job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()
        gov.release_lock()


# ── Etkileşimler (beğeni/yorum): tek tarayıcı, bütçeli, sıralı ────────────────

def _run_interactions(task, session_id: str, job_id: str, post_ids: list[int] | None):
    """
    post_ids verilirse yeni iş listesi kurulur; None ise yarım kalan liste devam ettirilir.
    Her gönderi bittiğinde listeden düşülür; bütçe dolarsa kaldığı gönderiden devam edilir.
    """
    import uuid
    from sqlalchemy import select as sa_select
    from app.core.config import settings
    from app.models.session import Session
    from app.models.post import Post
    from app.models.interaction import Interaction
    from app.models.sync_job import SyncJob
    from app.services.scan_governor import ScanPaused
    from app.services.playwright_instagram import get_interactions

    kind = "interactions"
    gov = _make_governor(session_id)
    if not gov.acquire_lock():
        return {"status": "already_running"}

    db = _get_sync_db()
    job, done_posts, n_likes, n_comments = None, 0, 0, 0
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            raise ValueError("Session bulunamadı")
        try:
            job = db.get(SyncJob, uuid.UUID(job_id))
        except ValueError:
            job = None
        if job:
            job.status = "running"; job.error_msg = None; db.commit()
        if not session.plan_b_active:
            _activate_plan_b(db, session)

        if post_ids is not None:
            gov.set_pending(kind, post_ids)
        todo = gov.pending(kind)
        if not todo and post_ids is None:
            # yeni tur: profildeki sayıda en yeni gönderi
            from app.services.risk_profiles import load_profile_sync
            max_posts = load_profile_sync(session_id).interactions_max_posts
            todo = db.execute(
                sa_select(Post.id).where(Post.session_id == uuid.UUID(session_id))
                .order_by(Post.taken_at.desc().nullslast()).limit(max_posts)
            ).scalars().all()
            gov.set_pending(kind, list(todo))
        if not todo:
            if job:
                job.status = "completed"; job.finished_at = datetime.now(timezone.utc); db.commit()
            return {"status": "completed", "posts": 0}

        gov.check()
        cookies = _load_cookies(session)
        total_posts = len(todo)
        task.update_state(state="PROGRESS", meta={"current": 0, "total": total_posts, "step": kind, "plan": "B"})
        sid = uuid.UUID(session_id)

        for what, pid, payload in get_interactions(cookies, list(todo), gov):
            if what == "done":
                db.commit()
                gov.pop_pending(kind, pid)
                done_posts += 1
                if job:
                    job.processed_items = done_posts; db.commit()
                task.update_state(state="PROGRESS", meta={"current": done_posts, "total": total_posts, "step": kind, "plan": "B"})
                continue

            if what == "likers":
                for user_info in payload:
                    uid = int(user_info.get("pk") or user_info.get("id") or 0)
                    if not uid:
                        continue
                    _upsert_ig_user(db, user_info)
                    if not db.query(Interaction).filter_by(ig_user_id=uid, post_id=pid, interaction_type="like").first():
                        db.add(Interaction(session_id=sid, ig_user_id=uid, post_id=pid, interaction_type="like"))
                    n_likes += 1
            else:
                for comment in payload:
                    user = comment.get("user", {})
                    uid = int(user.get("pk") or user.get("id") or 0)
                    if not uid:
                        continue
                    _upsert_ig_user(db, user)
                    text = comment.get("text", "")
                    ts = comment.get("created_at") or comment.get("created_at_utc")
                    when = datetime.fromtimestamp(float(ts), tz=timezone.utc) if ts else None
                    # tabloda (ig_user_id, post_id, tür) benzersiz: kullanıcı başına ilk yorum saklanır
                    if not db.query(Interaction).filter_by(ig_user_id=uid, post_id=pid, interaction_type="comment").first():
                        db.add(Interaction(session_id=sid, ig_user_id=uid, post_id=pid, interaction_type="comment",
                                           content=text, interacted_at=when))
                    n_comments += 1
            db.commit()

        gov.clear_scan(kind)
        gov.report_clean_finish()
        if job:
            job.status = "completed"; job.processed_items = done_posts
            job.finished_at = datetime.now(timezone.utc); db.commit()
        return {"status": "completed", "posts": done_posts, "likes": n_likes, "comments": n_comments}

    except ScanPaused as p:
        db.commit()   # o ana kadar yazılanlar (tamamlanmış sayfalar) korunur
        return _handle_pause(task, db, job, p, session_id, job_id, done_posts)

    except Exception as e:
        logger.exception("interactions sync failed")
        db.rollback()
        if job:
            job.status = "failed"; job.error_msg = str(e); db.commit()
        raise
    finally:
        db.close()
        gov.release_lock()


@celery_app.task(bind=True, name="sync_post_interactions")
def sync_post_interactions(self, session_id: str, post_id: int, job_id: str):
    """Tek gönderi (elle tetikleme)."""
    return _run_interactions(self, session_id, job_id, [int(post_id)])


@celery_app.task(bind=True, name="sync_all_interactions")
def sync_all_interactions(self, session_id: str, job_id: str):
    """En yeni N gönderi için beğeni/yorum; yarım kalmışsa kaldığı yerden devam eder."""
    return _run_interactions(self, session_id, job_id, None)
