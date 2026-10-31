import random

import fakeredis
import pytest

from app.services.scan_governor import GovernorConfig, ScanGovernor, ScanPaused


class Clock:
    def __init__(self):
        self.t = 1_000_000.0
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def make(cfg=None, clock=None):
    clock = clock or Clock()
    r = fakeredis.FakeStrictRedis()
    cfg = cfg or GovernorConfig(pages_per_hour=3, pages_per_day=5, long_break_every=2)
    return ScanGovernor(r, "s1", cfg, now=clock.now, sleep=clock.sleep, rng=random.Random(1)), clock, r


def test_hourly_budget_pauses_with_auto_resume():
    g, c, _ = make()
    for _ in range(3):
        g.before_request()
    with pytest.raises(ScanPaused) as e:
        g.before_request()
    assert e.value.auto_resume and e.value.resume_at > c.now()
    assert not g.status()["can_scan"]


def test_budget_frees_after_window():
    g, c, _ = make()
    for _ in range(3):
        g.before_request()
    c.t += 3601
    g.check()  # hata yok
    assert g.status()["used_hour"] == 0


def test_daily_budget():
    cfg = GovernorConfig(pages_per_hour=100, pages_per_day=4)
    g, c, _ = make(cfg)
    for _ in range(4):
        g.before_request()
    with pytest.raises(ScanPaused) as e:
        g.check()
    assert "Günlük" in e.value.reason


def test_pacing_never_below_minimum_and_breaks_are_irregular():
    g, c, _ = make(GovernorConfig(pages_per_hour=500, pages_per_day=500, long_break_every=4))
    for _ in range(80):
        g.before_request()
    normal = [x for x in c.slept if x < 40]
    breaks = [x for x in c.slept if x >= 40]
    assert normal and all(x >= 4.0 for x in normal)                  # güvenlik alt sınırı asla delinmez
    assert max(normal) <= 9 * 1.6 + 1e-9
    assert len(set(round(x, 2) for x in normal)) > 40                # sabit değil, her seferinde farklı
    assert breaks and all(60 <= x <= 120 * 1.6 + 1e-9 for x in breaks)
    # molaların aralığı sabit değil: iki mola arasındaki istek sayısı değişiyor
    gaps, run = [], 0
    for x in c.slept:
        run += 1
        if x >= 40:
            gaps.append(run); run = 0
    assert len(set(gaps)) > 1
    assert len(c.slept) == 79 + len(breaks)                          # ilk istek beklemez


def test_failure_escalates_cooldown_and_blocks_without_auto_resume():
    g, c, _ = make()
    p1 = g.report_failure(429)
    assert not p1.auto_resume and p1.resume_at - c.now() == 1800
    with pytest.raises(ScanPaused) as e:
        g.check()
    assert not e.value.auto_resume
    c.t += 1801
    g.check()
    p2 = g.report_failure(429)
    assert p2.resume_at - c.now() == 7200
    g.report_clean_finish()
    assert g.report_failure(403).resume_at - c.now() == 1800


def test_lock_is_exclusive_and_released():
    g1, c, r = make()
    g2 = ScanGovernor(r, "s1", g1.cfg, now=c.now, sleep=c.sleep)
    assert g1.acquire_lock()
    assert not g2.acquire_lock()
    g1.release_lock()
    assert g2.acquire_lock()


def test_cursor_and_seen_roundtrip():
    g, _, _ = make()
    assert g.get_cursor("followers") is None
    g.set_cursor("followers", "abc")
    g.add_seen("followers", [1, 2, 3])
    g.add_seen("followers", [3, 4])
    assert g.get_cursor("followers") == "abc"
    assert g.seen("followers") == {1, 2, 3, 4}
    assert g.status()["paused"]["followers"] is True
    g.clear_scan("followers")
    assert g.get_cursor("followers") is None and g.seen("followers") == set()


def test_pending_queue_resumes_after_partial_progress():
    g, _, _ = make()
    g.set_pending("interactions", [10, 20, 30])
    assert g.pending("interactions") == [10, 20, 30]
    g.pop_pending("interactions", 10)
    g.pop_pending("interactions", 99)      # baştaki değil: dokunma
    assert g.pending("interactions") == [20, 30]
    g.set_pending("interactions", [7])     # yeni tur eskisini ezer
    assert g.pending("interactions") == [7]
    g.clear_scan("interactions")
    assert g.pending("interactions") == []
