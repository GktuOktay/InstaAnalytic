"""
Takip / Takipten çıkma işlemleri — spam korumalı kuyruk sistemi.

Her session için Redis'te ayrı bir FIFO kuyruk tutulur.
Tüm işlemler process_action_queue task'ı tarafından sıralı olarak çalıştırılır.
Aynı anda aynı session için yalnızca 1 worker aktif olur (Redis distributed lock).

Limitler (varsayılan):
  - İşlemler arası: 45–90 sn
  - Saatlik limit: 50 işlem/saat
  - Günlük limit: 200 işlem/gün
"""

import json
import time
import random
import logging
from datetime import datetime, timezone
from app.tasks.celery_app import celery_app
from app.core.security import decrypt

logger = logging.getLogger(__name__)

# Kuyruk ve lock key şablonları
_QUEUE_KEY  = "action_queue:{session_id}"
_LOCK_KEY   = "action_lock:{session_id}"
_RATE_HOUR  = "rate:action:{session_id}:hour"
_RATE_DAY   = "rate:action:{session_id}:day"

HOURLY_LIMIT = 50
DAILY_LIMIT  = 200
DELAY_MIN    = 45   # saniye
DELAY_MAX    = 90


def _get_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url)
    return sessionmaker(bind=engine)()


def _get_redis():
    import redis
    from app.core.config import settings
    return redis.from_url(settings.redis_url)


def _load_cookies(session_obj) -> dict:
    data = json.loads(decrypt(session_obj.session_data))
    return data.get("cookies", {})


def _activate_plan_b(db, session_obj):
    session_obj.plan_b_active = True
    db.commit()


def _check_limits(r, session_id: str) -> tuple[bool, str]:
    """Saatlik ve günlük limitleri kontrol et. (ok, reason) döner."""
    hour_count = int(r.get(_RATE_HOUR.format(session_id=session_id)) or 0)
    day_count  = int(r.get(_RATE_DAY.format(session_id=session_id)) or 0)
    if hour_count >= HOURLY_LIMIT:
        return False, f"saatlik limit ({HOURLY_LIMIT})"
    if day_count >= DAILY_LIMIT:
        return False, f"günlük limit ({DAILY_LIMIT})"
    return True, ""


def _increment_counters(r, session_id: str):
    pipe = r.pipeline()
    pipe.incr(_RATE_HOUR.format(session_id=session_id))
    pipe.expire(_RATE_HOUR.format(session_id=session_id), 3600)
    pipe.incr(_RATE_DAY.format(session_id=session_id))
    pipe.expire(_RATE_DAY.format(session_id=session_id), 86400)
    pipe.execute()


def queue_action(session_id: str, action_type: str, ig_user_id: int) -> dict:
    """
    İşlemi kuyruğa ekle ve process_action_queue task'ını tetikle.
    action_type: 'follow' | 'unfollow'
    """
    r = _get_redis()
    item = json.dumps({"action": action_type, "ig_user_id": ig_user_id, "queued_at": time.time()})
    queue_key = _QUEUE_KEY.format(session_id=session_id)
    position  = r.rpush(queue_key, item)
    queue_len = r.llen(queue_key)

    # Worker zaten çalışmıyorsa başlat
    lock_key = _LOCK_KEY.format(session_id=session_id)
    if not r.exists(lock_key):
        process_action_queue.delay(session_id)

    return {"queued": True, "position": int(position), "queue_length": int(queue_len)}


def get_queue_status(session_id: str) -> dict:
    """Kuyruk durumunu döndür."""
    r = _get_redis()
    queue_key = _QUEUE_KEY.format(session_id=session_id)
    lock_key  = _LOCK_KEY.format(session_id=session_id)
    items = r.lrange(queue_key, 0, -1)
    hour_count = int(r.get(_RATE_HOUR.format(session_id=session_id)) or 0)
    day_count  = int(r.get(_RATE_DAY.format(session_id=session_id)) or 0)
    return {
        "queue_length": len(items),
        "processing": bool(r.exists(lock_key)),
        "hour_count": hour_count,
        "day_count": day_count,
        "hourly_limit": HOURLY_LIMIT,
        "daily_limit": DAILY_LIMIT,
        "items": [json.loads(i) for i in items],
    }


@celery_app.task(bind=True, name="process_action_queue")
def process_action_queue(self, session_id: str):
    """
    Session'ın action kuyruğunu sırayla işle.
    Distributed lock ile aynı anda yalnızca 1 worker çalışır.
    """
    from app.models.session import Session
    from app.models.relationship import Relationship
    from app.models.action_log import ActionLog
    import uuid

    r = _get_redis()
    lock_key  = _LOCK_KEY.format(session_id=session_id)
    queue_key = _QUEUE_KEY.format(session_id=session_id)

    # Lock al — 10 dakika TTL (her item'da yenilenir)
    acquired = r.set(lock_key, "1", nx=True, ex=600)
    if not acquired:
        logger.info("process_action_queue: session %s zaten işleniyor, atlanıyor", session_id)
        return {"status": "already_running"}

    db = _get_db()
    try:
        session = db.get(Session, uuid.UUID(session_id))
        if not session:
            return {"status": "session_not_found"}

        if not session.plan_b_active:
            _activate_plan_b(db, session)

        cookies = _load_cookies(session)
        processed = 0
        skipped = 0
        failed = 0

        while True:
            # Lock TTL'ini yenile
            r.expire(lock_key, 600)

            # Kuyruktan sıradaki öğeyi al
            raw = r.lpop(queue_key)
            if not raw:
                break  # Kuyruk boş — bitir

            item = json.loads(raw)
            action_type = item["action"]
            ig_user_id  = int(item["ig_user_id"])

            self.update_state(state="PROGRESS", meta={
                "current_action": action_type,
                "ig_user_id": ig_user_id,
                "queue_remaining": r.llen(queue_key),
                "processed": processed,
                "skipped": skipped,
                "failed": failed,
            })

            # Limit kontrolü
            ok, reason = _check_limits(r, session_id)
            if not ok:
                logger.warning("Limit aşıldı (%s), bekleniyor...", reason)
                # Öğeyi geri koy
                r.lpush(queue_key, raw)
                # Saatlik limitde 1 saat bekle, günlük limitde dur
                if "günlük" in reason:
                    logger.warning("Günlük limit doldu. Kuyruk askıya alındı.")
                    break
                # Saatlik limit — kalan süreyi hesapla ve bekle
                ttl = r.ttl(_RATE_HOUR.format(session_id=session_id))
                wait = max(60, ttl if ttl > 0 else 3600)
                logger.info("Saatlik limit, %d sn bekleniyor...", wait)
                time.sleep(min(wait, 300))  # max 5 dk bekle, sonra tekrar dene
                continue

            # Log kaydı oluştur
            log = ActionLog(
                session_id=uuid.UUID(session_id),
                ig_user_id=ig_user_id,
                action_type=action_type,
                status="pending",
            )
            db.add(log)
            db.commit()
            db.refresh(log)

            # İşlemi gerçekleştir
            success = False
            try:
                if action_type == "follow":
                    from app.services.playwright_instagram import follow_user as pw_follow
                    success = pw_follow(cookies, ig_user_id)
                elif action_type == "unfollow":
                    from app.services.playwright_instagram import unfollow_user as pw_unfollow
                    success = pw_unfollow(cookies, ig_user_id)
                elif action_type == "remove_follower":
                    from app.services.playwright_instagram import remove_follower as pw_remove
                    success = pw_remove(cookies, ig_user_id)
            except Exception as e:
                logger.warning("Playwright action hata (%s): %s", action_type, e)

            # Sonucu kaydet
            if success:
                log.status = "success"
                log.executed_at = datetime.now(timezone.utc)
                _increment_counters(r, session_id)
                processed += 1

                rel = db.get(Relationship, (uuid.UUID(session_id), ig_user_id))
                if rel:
                    if action_type == "follow":
                        rel.we_follow = True
                    elif action_type == "unfollow":
                        rel.we_follow = False
                    elif action_type == "remove_follower":
                        rel.they_follow = False
                    rel.last_checked_at = datetime.now(timezone.utc)
                elif action_type == "follow":
                    db.add(Relationship(
                        session_id=uuid.UUID(session_id),
                        ig_user_id=ig_user_id,
                        we_follow=True,
                    ))
                db.commit()
            else:
                log.status = "failed"
                log.executed_at = datetime.now(timezone.utc)
                db.commit()
                failed += 1

            # Bir sonraki işlem öncesi rastgele bekleme
            remaining = r.llen(queue_key)
            if remaining > 0:
                delay = random.uniform(DELAY_MIN, DELAY_MAX)
                logger.info("Sonraki işlem için %.0f sn bekleniyor (%d kalan)...", delay, remaining)
                r.expire(lock_key, 600)
                time.sleep(delay)

        return {
            "status": "completed",
            "processed": processed,
            "skipped": skipped,
            "failed": failed,
        }

    except Exception as e:
        logger.exception("process_action_queue failed")
        db.rollback()
        raise
    finally:
        r.delete(lock_key)
        db.close()


@celery_app.task(bind=True, name="bulk_unfollow")
def bulk_unfollow(self, session_id: str, user_ids: list[int], delay_min: int = 45, delay_max: int = 90, hourly_limit: int = 50):
    """Toplu takipten çıkma — tüm ID'leri kuyruğa ekle, ardından işlemeye başla."""
    r = _get_redis()
    queue_key = _QUEUE_KEY.format(session_id=session_id)

    for uid in user_ids:
        item = json.dumps({"action": "unfollow", "ig_user_id": uid, "queued_at": time.time()})
        r.rpush(queue_key, item)

    total = len(user_ids)
    self.update_state(state="PROGRESS", meta={"current": 0, "total": total, "done": 0, "skipped": 0})

    # Ayrı bir process task başlat (lock ile yönetilir)
    process_action_queue.delay(session_id)

    return {"status": "queued", "total": total}


# single_follow / single_unfollow artık queue_action'ı kullanıyor
@celery_app.task(bind=True, name="single_follow")
def single_follow(self, session_id: str, ig_user_id: int):
    return queue_action(session_id, "follow", ig_user_id)


@celery_app.task(bind=True, name="single_unfollow")
def single_unfollow(self, session_id: str, ig_user_id: int):
    return queue_action(session_id, "unfollow", ig_user_id)
