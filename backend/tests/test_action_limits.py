"""Spam koruması: sert tavanlar, ısınma, sessiz saatler, devre kesici, ikinci güvenlik kapısı."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import fakeredis
import pytest

from app.core.security import encrypt
from app.services import risk_profiles as rp
from app.tasks import action_tasks

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)   # 15:00 İstanbul


def test_no_profile_can_exceed_hard_caps():
    for p in rp.PROFILES.values():
        hourly, daily, dmin, dmax = rp.effective_action_limits(p, None, NOW)
        assert hourly <= rp.ACTION_HARD_HOURLY and daily <= rp.ACTION_HARD_DAILY
        assert dmin >= rp.ACTION_HARD_MIN_DELAY and dmax > dmin


def test_caps_hold_even_if_a_profile_is_misconfigured():
    wild = rp.RiskProfile("wild", rp.PROFILES["safe"].scan, 100, 9999, 99999, 1, 2)
    hourly, daily, dmin, _ = rp.effective_action_limits(wild, None, NOW)
    assert (hourly, daily, dmin) == (rp.ACTION_HARD_HOURLY, rp.ACTION_HARD_DAILY, rp.ACTION_HARD_MIN_DELAY)


def test_default_profile_is_the_most_conservative():
    assert rp.DEFAULT_PROFILE == "safe"
    assert rp.PROFILES["safe"].action_daily <= 30 and rp.PROFILES["safe"].action_delay_min >= 120


@pytest.mark.parametrize("days,expected_cap", [(0, 20), (2.9, 20), (3, 40), (6.9, 40), (7, 45), (30, 45)])
def test_ramp_up_after_enabling_actions(days, expected_cap):
    prof = rp.PROFILES["balanced"]                      # günlük 45
    enabled = NOW - timedelta(days=days)
    assert rp.effective_action_limits(prof, enabled, NOW)[1] == expected_cap


@pytest.mark.parametrize("hour_utc,quiet", [(21, False), (22, True), (2, True), (4, True), (5, False), (12, False)])
def test_quiet_hours_are_istanbul_01_to_08(hour_utc, quiet):
    # İstanbul = UTC+3  → 01:00-08:00 yerel = 22:00-05:00 UTC
    assert rp.in_quiet_hours(datetime(2026, 10, 31, hour_utc, 30, tzinfo=timezone.utc)) is quiet


def test_check_limits_uses_effective_limits_not_profile():
    r = fakeredis.FakeRedis()
    prof = rp.PROFILES["aggressive"]
    sid = "s1"
    assert action_tasks._check_limits(r, sid, prof, None, NOW)[0]
    r.set(action_tasks._RATE_HOUR.format(session_id=sid), rp.ACTION_HARD_HOURLY)
    ok, reason = action_tasks._check_limits(r, sid, prof, None, NOW)
    assert not ok and "saatlik" in reason
    r.delete(action_tasks._RATE_HOUR.format(session_id=sid))
    r.set(action_tasks._RATE_DAY.format(session_id=sid), 20)             # yeni açıldı => günlük 20
    assert not action_tasks._check_limits(r, sid, prof, NOW - timedelta(hours=1), NOW)[0]
    assert action_tasks._check_limits(r, sid, prof, NOW - timedelta(days=30), NOW)[0]


# ── Worker: ikinci güvenlik kapısı ve devre kesici (Instagram'a HİÇ istek atılmaz) ──────────────────

@pytest.fixture
def worker(monkeypatch, test_db_url):
    """Gerçek worker döngüsünü sahte Redis + test veritabanı + sahte Playwright ile çalıştır."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    import app.models  # noqa: F401
    from app.db.base import Base
    engine = create_engine(test_db_url.set(drivername="postgresql+psycopg2"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Maker = sessionmaker(bind=engine)

    r = fakeredis.FakeRedis()
    monkeypatch.setattr(action_tasks, "_get_redis", lambda: r)
    monkeypatch.setattr(action_tasks, "_get_db", lambda: Maker())
    monkeypatch.setattr(action_tasks, "_profile", lambda sid: rp.PROFILES["safe"])
    monkeypatch.setattr(action_tasks.time, "sleep", lambda s: None)
    monkeypatch.setattr(action_tasks.process_action_queue, "update_state", lambda *a, **k: None, raising=False)
    monkeypatch.setattr(rp, "in_quiet_hours", lambda now: False)

    calls = {"n": 0}

    def make(result):
        def fake(cookies, uid):
            calls["n"] += 1
            if isinstance(result, Exception):
                raise result
            return result
        return fake

    import app.services.playwright_instagram as pw
    monkeypatch.setattr(pw, "follow_user", make(False))

    def add_session(**kw):
        from app.models.ig_user import IgUser
        from app.models.session import Session
        with Maker() as db:
            uid = 777
            db.merge(IgUser(id=uid, username="me"))
            db.flush()
            s = Session(ig_user_id=uid, ig_username="me", source=kw.pop("source", "browser"),
                        allow_actions=kw.pop("allow_actions", True),
                        session_data=encrypt(json.dumps({"cookies": {"sessionid": "x"}})), **kw)
            db.add(s)
            for i in range(20):
                db.merge(IgUser(id=2000 + i, username=f"t{i}"))
            db.commit()
            return str(s.id)

    def fill(sid, n=10):
        for i in range(n):
            r.rpush(action_tasks._QUEUE_KEY.format(session_id=sid),
                    json.dumps({"action": "follow", "ig_user_id": 2000 + i}))

    class W: pass
    w = W()
    w.r, w.Maker, w.calls, w.add_session, w.fill, w.pw, w.monkeypatch, w.make = r, Maker, calls, add_session, fill, pw, monkeypatch, make
    yield w
    engine.dispose()


def _session(w, sid):
    from app.models.session import Session
    with w.Maker() as db:
        s = db.get(Session, uuid.UUID(sid))
        db.expunge(s)
        return s


def test_worker_refuses_when_actions_disabled_after_queueing(worker):
    sid = worker.add_session(allow_actions=False)
    worker.fill(sid)
    out = action_tasks.process_action_queue.run(sid)
    assert out["status"] == "actions_disabled" and worker.calls["n"] == 0
    assert worker.r.llen(action_tasks._QUEUE_KEY.format(session_id=sid)) == 0


def test_worker_never_acts_for_zip_profiles(worker):
    sid = worker.add_session(source="zip")
    worker.fill(sid)
    assert action_tasks.process_action_queue.run(sid)["status"] == "actions_disabled" and worker.calls["n"] == 0


def test_worker_respects_active_pause(worker):
    sid = worker.add_session(paused_until=datetime.now(timezone.utc) + timedelta(hours=2), paused_reason="x")
    worker.fill(sid)
    assert action_tasks.process_action_queue.run(sid)["status"] == "paused" and worker.calls["n"] == 0


def test_circuit_breaker_pauses_after_three_consecutive_failures(worker):
    sid = worker.add_session()
    worker.fill(sid, 10)
    out = action_tasks.process_action_queue.run(sid)
    assert out["status"] == "paused" and worker.calls["n"] == 3        # 4. işlem denenmedi
    s = _session(worker, sid)
    assert s.paused_until > datetime.now(timezone.utc) + timedelta(hours=5)
    assert "3" in s.paused_reason
    assert worker.r.llen(action_tasks._QUEUE_KEY.format(session_id=sid)) == 0   # kuyruk boşaltıldı


def test_instagram_block_signal_pauses_immediately(worker):
    worker.monkeypatch.setattr(worker.pw, "follow_user", worker.make(RuntimeError("challenge_required")))
    sid = worker.add_session()
    worker.fill(sid, 10)
    out = action_tasks.process_action_queue.run(sid)
    assert out["status"] == "paused" and worker.calls["n"] == 1         # tek işlemden sonra durdu
    assert "challenge" in _session(worker, sid).paused_reason


def test_quiet_hours_keep_the_queue_and_do_nothing(worker):
    worker.monkeypatch.setattr(rp, "in_quiet_hours", lambda now: True)
    sid = worker.add_session()
    worker.fill(sid, 5)
    out = action_tasks.process_action_queue.run(sid)
    assert out["status"] == "quiet_hours" and worker.calls["n"] == 0
    assert worker.r.llen(action_tasks._QUEUE_KEY.format(session_id=sid)) == 5


def test_daily_cap_stops_a_successful_run(worker):
    worker.monkeypatch.setattr(worker.pw, "follow_user", worker.make(True))
    sid = worker.add_session(actions_enabled_at=datetime.now(timezone.utc) - timedelta(days=30))
    worker.r.set(action_tasks._RATE_DAY.format(session_id=sid), 29)      # safe profil: günlük 30
    worker.fill(sid, 10)
    out = action_tasks.process_action_queue.run(sid)
    assert out["processed"] == 1 and worker.calls["n"] == 1             # 30'a ulaşınca durdu
    assert worker.r.llen(action_tasks._QUEUE_KEY.format(session_id=sid)) == 9


def test_stale_browser_sessions_lose_cookies_and_become_read_only(worker, monkeypatch):
    from app.core.config import settings
    from app.core.security import decrypt
    monkeypatch.setattr(settings, "session_ttl_days", 30)
    old = worker.add_session(created_at=datetime.now(timezone.utc) - timedelta(days=45))
    fresh_id = None
    with worker.Maker() as db:                                       # taze oturum
        from app.models.ig_user import IgUser
        from app.models.session import Session
        db.add(IgUser(id=778, username="fresh")); db.flush()
        f = Session(ig_user_id=778, ig_username="fresh", source="browser", allow_actions=True,
                    session_data=encrypt(json.dumps({"cookies": {"sessionid": "y"}})))
        db.add(f); db.commit(); fresh_id = str(f.id)
    assert action_tasks.expire_stale_sessions.run()["expired"] == 1
    s_old, s_fresh = _session(worker, old), _session(worker, fresh_id)
    assert s_old.source == "zip" and s_old.allow_actions is False
    assert json.loads(decrypt(s_old.session_data)) == {"cookies": {}}
    assert s_fresh.source == "browser" and s_fresh.allow_actions is True
