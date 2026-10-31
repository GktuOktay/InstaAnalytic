import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.ig_user import IgUser
from app.models.relationship import Relationship
from app.services import ghost_state as gs
from app.services.ghost_check import BLOCKED, OK, UNKNOWN, UNREACHABLE, Pacer, classify

pytestmark = pytest.mark.asyncio


class FakeRedis:
    def __init__(self):
        self.h, self.kv = {}, {}

    def hgetall(self, k): return dict(self.h.get(k, {}))
    def hset(self, k, key=None, value=None, mapping=None):
        d = self.h.setdefault(k, {})
        if mapping: d.update({a: str(b) for a, b in mapping.items()})
        if key is not None: d[key] = str(value)
    def expire(self, *a): pass
    def delete(self, *keys):
        for k in keys: self.h.pop(k, None); self.kv.pop(k, None)
    def get(self, k): return self.kv.get(k)
    def set(self, k, v, nx=False, ex=None):
        if nx and k in self.kv: return None
        self.kv[k] = v; return True


# ── sınıflandırıcı ───────────────────────────────────────────────────────────

def test_classify_reads_the_rendered_title():
    assert classify("Instagram (@instagram) • Instagram photos and videos", "/instagram/") == OK
    assert classify("Ayşe Y. (@ayse.y) • Instagram fotoğrafları ve videoları", "/ayse.y/") == OK
    assert classify("Profile mevcut değil • Instagram", "/x/") == UNREACHABLE
    assert classify("Profile isn't available • Instagram", "/x/") == UNREACHABLE
    assert classify("Page Not Found • Instagram", "/x/") == UNREACHABLE


def test_classify_does_not_guess():
    assert classify("Instagram", "/x/") == UNKNOWN                  # boş kabuk: render olmadı
    assert classify("", "/x/") == UNKNOWN
    assert classify("Login • Instagram", "/x/") == UNKNOWN
    assert classify("Instagram", "/accounts/login/?next=/x/") == BLOCKED
    assert classify("Instagram", "/challenge/") == BLOCKED


# ── adaptif hız ──────────────────────────────────────────────────────────────

def test_pacer_speeds_up_when_clean_but_never_below_floor():
    p = Pacer(FakeRedis(), now=lambda: 1_000_000.0)
    start = p.snapshot()
    assert 100 <= start["per_hour"] <= 130 and start["interval_s"] == Pacer.START_S     # 20/saat değil
    for _ in range(15):
        assert p.record(OK) == "continue"
    assert p.snapshot()["interval_s"] == pytest.approx(Pacer.START_S * 0.85, abs=0.1)
    for _ in range(15 * 20):
        p.record(UNREACHABLE)
    assert p.snapshot()["interval_s"] == Pacer.FLOOR_S              # ~250/saat üstüne çıkmaz
    assert p.snapshot()["per_hour"] <= 270


def test_pacer_backs_off_on_block_and_cooldown_grows():
    t = {"now": 1_000_000.0}
    p = Pacer(FakeRedis(), now=lambda: t["now"])
    assert p.record(BLOCKED) == "cooldown"
    assert p.snapshot()["interval_s"] == Pacer.START_S * 2           # bekleme iki katına çıktı
    reason, until = p.wait_reason()
    assert reason == "cooldown" and until == t["now"] + 15 * 60
    t["now"] = until + 1
    assert p.wait_reason() is None
    assert p.record(BLOCKED) == "cooldown"
    assert p.wait_reason()[1] == pytest.approx(t["now"] + 30 * 60)   # 15 dk -> 30 dk


def test_pacer_treats_three_unknowns_as_throttle_and_stops_after_repeated_strikes():
    p = Pacer(FakeRedis(), now=lambda: 1_000_000.0)
    assert [p.record(UNKNOWN) for _ in range(2)] == ["continue", "continue"]
    assert p.record(UNKNOWN) == "cooldown"
    for _ in range(Pacer.MAX_STRIKES - 1):
        assert p.record(BLOCKED) == "cooldown"
    assert p.record(BLOCKED) == "stop"                               # kullanıcıya bırak


def test_pacer_forgives_strikes_after_a_clean_stretch_and_honours_daily_cap():
    r = FakeRedis()
    p = Pacer(r, now=lambda: 1_000_000.0)
    p.record(BLOCKED)
    for _ in range(Pacer.FORGIVE_AFTER_CLEAN):
        p.record(OK)
    assert p.snapshot()["strikes"] == 0
    r.h[Pacer.KEY]["day_count"] = str(Pacer.DAILY_CAP)
    r.h[Pacer.KEY]["cooldown_until"] = "0"
    assert p.wait_reason()[0] == "daily_cap"


# ── dilim akışı (sahte yoklayıcı, gerçek test veritabanı) ────────────────────

class FakeProber:
    def __init__(self, answers): self.answers, self.seen, self.closed = answers, [], False
    def probe(self, username):
        self.seen.append(username)
        return self.answers.get(username, ("Instagram", "/x/"))
    def close(self): self.closed = True


async def _seed(db, make_session, names):
    s = await make_session()
    for i, n in enumerate(names):
        db.add(IgUser(id=5000 + i, username=n))
    await db.flush()
    for i, _ in enumerate(names):
        db.add(Relationship(session_id=s.id, ig_user_id=5000 + i, we_follow=True, they_follow=False))
    await db.commit()
    return s


def _sync_db(test_db_url):
    eng = create_engine(test_db_url.set(drivername="postgresql+psycopg2"))
    return sessionmaker(bind=eng)(), eng


async def test_slice_saves_statuses_skips_manual_and_closes_browser(db, make_session, test_db_url):
    from app.tasks.ghost_tasks import run_slice
    s = await _seed(db, make_session, ["alive", "gone", "manual_one"])
    manual = await db.get(IgUser, 5002)
    manual.reach_status, manual.reach_source = "ok", "manual"
    await db.commit()

    sdb, eng = _sync_db(test_db_url)
    r = FakeRedis()
    prober = FakeProber({"alive": ("A (@alive) • Instagram", "/alive/"), "gone": ("Profile isn't available • Instagram", "/gone/")})
    gs.start(r, s.id, 2)
    res = run_slice(sdb, r, s.id, prober_factory=lambda: prober, pacer=Pacer(r), sleep=lambda _: None)
    sdb.close(); eng.dispose()

    assert res.stopped_reason == "empty" and res.probed == 2
    assert prober.closed and sorted(prober.seen) == ["alive", "gone"]    # elle işaretlenene dokunulmadı
    await db.refresh(await db.get(IgUser, 5000)); await db.refresh(await db.get(IgUser, 5001))
    assert (await db.get(IgUser, 5000)).reach_status == "ok"
    assert (await db.get(IgUser, 5001)).reach_status == "unreachable"
    assert (await db.get(IgUser, 5001)).reach_source == "auto"
    job = gs.read(r, s.id)
    assert (job["done"], job["ok"], job["unreachable"]) == (2, 1, 1)


async def test_slice_backs_off_on_login_wall_without_labelling_anyone(db, make_session, test_db_url):
    from app.tasks.ghost_tasks import run_slice
    s = await _seed(db, make_session, ["a", "b", "c"])
    sdb, eng = _sync_db(test_db_url)
    r = FakeRedis()
    prober = FakeProber({n: ("Instagram", "/accounts/login/") for n in "abc"})
    res = run_slice(sdb, r, s.id, prober_factory=lambda: prober, pacer=Pacer(r), sleep=lambda _: None)
    sdb.close(); eng.dispose()
    assert res.stopped_reason == "cooldown" and res.resume_at and res.probed == 1
    assert (await db.execute(select(IgUser.reach_status).where(IgUser.id == 5000))).scalar_one() is None   # tahmin yok


async def test_slice_honours_stop_request(db, make_session, test_db_url):
    from app.tasks.ghost_tasks import run_slice
    s = await _seed(db, make_session, ["a", "b"])
    sdb, eng = _sync_db(test_db_url)
    r = FakeRedis()
    gs.request_stop(r, s.id)
    res = run_slice(sdb, r, s.id, prober_factory=lambda: pytest.fail("tarayıcı açılmamalı"), pacer=Pacer(r), sleep=lambda _: None)
    sdb.close(); eng.dispose()
    assert res.stopped_reason == "stop" and res.probed == 0


# ── API ──────────────────────────────────────────────────────────────────────

async def test_api_requires_consent_then_queues(client, db, make_session, monkeypatch):
    from app.tasks import ghost_tasks
    queued = []
    monkeypatch.setattr(ghost_tasks.check_ghosts, "delay", lambda *a, **k: queued.append(a))
    s = await _seed(db, make_session, ["a", "b", "c"])
    r = await client.post(f"/api/sessions/{s.id}/ghosts/check", json={})
    assert r.status_code == 400 and "oturumsuz" in r.json()["detail"]
    assert queued == []
    r = await client.post(f"/api/sessions/{s.id}/ghosts/check", json={"acknowledge": True})
    assert r.status_code == 202 and r.json()["total"] == 3 and len(queued) == 1
    assert (await client.post(f"/api/sessions/{s.id}/ghosts/check", json={"acknowledge": True})).status_code == 409
    st = (await client.get(f"/api/sessions/{s.id}/ghosts/status")).json()
    assert st["job"]["state"] == "running" and st["job"]["total"] == 3 and st["counts"]["unchecked"] == 3
    assert (await client.post(f"/api/sessions/{s.id}/ghosts/stop")).json()["status"] == "stopping"


async def test_ghosts_are_split_from_real_non_followers(client, db, make_session):
    s = await _seed(db, make_session, ["real1", "real2", "ghost1"])
    ghost = await db.get(IgUser, 5002)
    ghost.reach_status = "unreachable"
    await db.commit()
    summ = (await client.get(f"/api/sessions/{s.id}/analysis/summary")).json()
    assert summ["not_following_back"] == 2 and summ["ghosts"] == 1
    nfb = (await client.get(f"/api/sessions/{s.id}/analysis/not-following-back")).json()
    assert sorted(u["username"] for u in nfb) == ["real1", "real2"]
    g = (await client.get(f"/api/sessions/{s.id}/ghosts")).json()
    assert [u["username"] for u in g] == ["ghost1"] and g[0]["reach_status"] == "unreachable"


async def test_manual_mark_overrides_and_can_be_cleared(client, db, make_session):
    s = await _seed(db, make_session, ["x"])
    url = f"/api/sessions/{s.id}/ghosts/5000"
    assert (await client.put(url, json={"ghost": True})).json()["reach_status"] == "unreachable"
    u = await db.get(IgUser, 5000); await db.refresh(u)
    assert u.reach_source == "manual"
    assert (await client.put(url, json={"ghost": None})).json()["reach_status"] is None
    assert (await client.put(f"/api/sessions/{s.id}/ghosts/9999", json={"ghost": True})).status_code == 404


# ── ritim: sabit değil ───────────────────────────────────────────────────────

def test_ghost_delays_are_irregular_with_reading_pauses_and_random_breaks():
    import random
    p = Pacer(FakeRedis(), now=lambda: 1_000_000.0, rng=random.Random(7))
    mean = p.snapshot()["interval_s"]
    ds = [p.delay() for _ in range(400)]
    assert len(set(round(d, 3) for d in ds)) > 380                       # neredeyse hepsi farklı
    assert min(ds) >= mean * 0.35                                        # kırpma alt sınırı
    assert sum(d > mean * 2.2 for d in ds) >= 15                         # bakınma molaları
    long = [i for i, d in enumerate(ds) if d >= 120]                     # uzun molalar
    assert len(long) >= 4
    assert len({b - a for a, b in zip(long, long[1:])}) > 1              # aralıkları sabit değil
    typical = sorted(ds)[len(ds) // 2]
    assert 0.5 * mean < typical < 1.3 * mean                             # medyan ortalama civarında


# ── human_timing ─────────────────────────────────────────────────────────────

def test_between_never_goes_below_the_floor_and_has_a_spread():
    import random, statistics
    from app.services import human_timing as ht
    rng = random.Random(3)
    xs = [ht.between(rng, 60, 120) for _ in range(5000)]
    assert min(xs) >= 60 and max(xs) <= 120 * 1.6
    assert statistics.pstdev(xs) / statistics.mean(xs) > 0.15            # düz değil, dağılımlı
    assert sum(x > 120 for x in xs) > 0                                   # bazen üst sınırı da aşar (yalnızca yukarı doğru)
    assert ht.between(rng, 90, 90) == 90


def test_around_keeps_the_average_close_to_the_target():
    import random, statistics
    from app.services import human_timing as ht
    rng = random.Random(5)
    xs = [ht.around(rng, 20.0) for _ in range(20000)]
    assert statistics.mean(xs) == pytest.approx(20.0, rel=0.08)


def test_random_cadence_is_not_a_fixed_period():
    import random
    from app.services import human_timing as ht
    rng = random.Random(9)
    vals = {ht.random_cadence(rng, 10) for _ in range(200)}
    assert vals <= set(range(6, 16)) and len(vals) > 5
