"""Hayalet hesap kontrolü: oturumsuz, adaptif hızla, dilimler halinde (durdurulabilir, kaldığı yerden devam eder)."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import redis
from sqlalchemy import and_, func, or_, select

from app.core.config import settings
from app.services import ghost_state as gs
from app.services.ghost_check import (BLOCKED, OK, UNKNOWN, UNREACHABLE, BrowserProber, Pacer, SliceResult,
                                      classify, valid_username)
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

SLICE_MAX_PROBES = 120
SLICE_MAX_SECONDS = 25 * 60
UNKNOWN_RETRY_AFTER = timedelta(days=1)
RECHECK_AFTER = timedelta(days=14)


def _db():
    from app.tasks.sync_tasks import _get_sync_db
    return _get_sync_db()


def candidate_filter(session_id, recheck: bool = False):
    """Geri takip etmediğimiz hesaplar; henüz bakılmamış ya da yeniden bakılması gereken ve elle işaretlenmemiş olanlar."""
    from app.models.ig_user import IgUser
    from app.models.relationship import Relationship
    now = datetime.now(timezone.utc)
    stale = [IgUser.reach_status.is_(None),
             and_(IgUser.reach_status == "unknown", IgUser.reach_checked_at < now - UNKNOWN_RETRY_AFTER)]
    if recheck:
        stale.append(and_(IgUser.reach_status.in_(("ok", "unreachable")), IgUser.reach_checked_at < now - RECHECK_AFTER))
    return and_(
        Relationship.session_id == session_id, Relationship.we_follow.is_(True), Relationship.they_follow.is_(False),
        or_(IgUser.reach_source.is_(None), IgUser.reach_source != "manual"),
        or_(*stale),
    )


def count_candidates(db, session_id, recheck: bool = False) -> int:
    from app.models.ig_user import IgUser
    from app.models.relationship import Relationship
    return db.execute(
        select(func.count()).select_from(IgUser).join(Relationship, Relationship.ig_user_id == IgUser.id)
        .where(candidate_filter(session_id, recheck))
    ).scalar_one()


def _next_batch(db, session_id, recheck: bool, n: int = 25) -> list[tuple[int, str]]:
    from app.models.ig_user import IgUser
    from app.models.relationship import Relationship
    rows = db.execute(
        select(IgUser.id, IgUser.username).join(Relationship, Relationship.ig_user_id == IgUser.id)
        .where(candidate_filter(session_id, recheck)).order_by(func.random()).limit(n)
    ).all()
    return [(r[0], r[1]) for r in rows]


def _save(db, user_id: int, status: str) -> None:
    from app.models.ig_user import IgUser
    u = db.get(IgUser, user_id)
    if u and u.reach_source != "manual":
        u.reach_status, u.reach_checked_at, u.reach_source = status, datetime.now(timezone.utc), "auto"
        db.commit()


def run_slice(db, r, session_id, *, prober_factory=BrowserProber, pacer: Pacer | None = None, recheck: bool = False,
              sleep=time.sleep, max_probes: int = SLICE_MAX_PROBES, max_seconds: int = SLICE_MAX_SECONDS) -> SliceResult:
    """Bir dilim yoklar. Takılırsa/bitince/durdurulunca nedenini döner. Tarayıcı yalnızca iş varken açılır."""
    pacer = pacer or Pacer(r)
    started = time.monotonic()
    probed = 0
    prober = None
    try:
        while probed < max_probes and time.monotonic() - started < max_seconds:
            if gs.stop_requested(r, session_id):
                return SliceResult(probed, "stop")
            wait = pacer.wait_reason()
            if wait:
                return SliceResult(probed, wait[0], wait[1])
            batch = _next_batch(db, session_id, recheck)
            if not batch:
                return SliceResult(probed, "empty")
            for uid, username in batch:
                if gs.stop_requested(r, session_id):
                    return SliceResult(probed, "stop")
                wait = pacer.wait_reason()
                if wait:
                    return SliceResult(probed, wait[0], wait[1])
                if not valid_username(username):
                    outcome = UNKNOWN
                else:
                    prober = prober or prober_factory()
                    try:
                        title, path = prober.probe(username)
                        outcome = classify(title, path)
                    except Exception as e:                       # ağ/tarayıcı hatası: kesin bilgi yok
                        logger.warning("Hayalet kontrolü: %s yoklanamadı (%s: %s)", username, type(e).__name__, str(e)[:160])
                        outcome = UNKNOWN
                status = UNREACHABLE if outcome == UNREACHABLE else OK if outcome == OK else UNKNOWN
                if outcome != BLOCKED:                           # giriş duvarı hesap hakkında bilgi vermez
                    _save(db, uid, status)
                probed += 1
                cur = gs.read(r, session_id)
                key = {OK: "ok", UNREACHABLE: "unreachable"}.get(outcome, "unknown")
                gs.write(r, session_id, done=cur["done"] + (0 if outcome in (BLOCKED, UNKNOWN) else 1),
                         **{key: cur[key] + 1})
                action = pacer.record(outcome)
                if action == "stop":
                    return SliceResult(probed, "blocked")
                if action == "cooldown":
                    w = pacer.wait_reason()
                    return SliceResult(probed, "cooldown", w[1] if w else None)
                sleep(pacer.delay())
                if probed >= max_probes or time.monotonic() - started >= max_seconds:
                    break
        return SliceResult(probed, None)
    finally:
        if prober:
            try:
                prober.close()
            except Exception:
                pass


@celery_app.task(name="check_ghosts", bind=True)
def check_ghosts(self, session_id: str, recheck: bool = False):
    import uuid
    sid = uuid.UUID(session_id)
    r = redis.from_url(settings.redis_url)
    if not r.set(gs.LOCK_KEY, session_id, nx=True, ex=SLICE_MAX_SECONDS + 300):
        return {"status": "already_running"}
    db = _db()
    try:
        res = run_slice(db, r, sid, recheck=recheck)
        total_left = count_candidates(db, sid, recheck)
        if res.stopped_reason == "stop":
            gs.write(r, sid, state="stopped", message="Durduruldu", resume_at="")
        elif res.stopped_reason == "blocked":
            gs.write(r, sid, state="blocked", resume_at="",
                     message="Instagram üst üste istekleri yavaşlattı. Birkaç saat sonra tekrar dene.")
        elif res.stopped_reason in ("cooldown", "daily_cap") and res.resume_at:
            msg = "Instagram yavaşlamamızı istedi, bekliyoruz" if res.stopped_reason == "cooldown" else "Günlük sınıra ulaşıldı"
            gs.write(r, sid, state="cooldown", message=msg, resume_at=res.resume_at)
            check_ghosts.apply_async(args=[session_id, recheck], eta=datetime.fromtimestamp(res.resume_at + 5, tz=timezone.utc))
        elif res.stopped_reason == "empty" or total_left == 0:
            gs.write(r, sid, state="done", message="", resume_at="")
        else:                                                  # dilim doldu, iş sürüyor
            gs.write(r, sid, state="running", message="", resume_at="")
            check_ghosts.apply_async(args=[session_id, recheck], countdown=3)
        return {"status": res.stopped_reason or "slice_done", "probed": res.probed}
    except Exception:
        logger.exception("Hayalet kontrolü başarısız")
        gs.write(r, sid, state="failed", message="Beklenmeyen bir hata oluştu")
        raise
    finally:
        db.close()
        r.delete(gs.LOCK_KEY)
