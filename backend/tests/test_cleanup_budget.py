"""SPEC-001 T-2: ek iş kapısı, bütçe, "hazır" kuralı, tahmin ve ısınma (cleanup_gate).

Sahte saat: tüm fonksiyonlar `now` alır, gerçek bekleme yoktur. Yazma sayımı `cleanup_write_grants` üzerindendir
(R7 M5). Saf hesap testleri veritabanı istemez; kapı/sayım testleri izole `instaanalytic_pytest` veritabanında koşar.
"""
import math
from datetime import datetime, timedelta, timezone
from types import MappingProxyType
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import event

from app.models.bridge_action import BridgeAction
from app.models.cleanup import CleanupBatch, CleanupItem, CleanupWriteGrant
from app.services import cleanup_gate as cg
from app.services import cleanup_limits as cl

IST = ZoneInfo("Europe/Istanbul")
H = timedelta(hours=1)
M = timedelta(minutes=1)


def at(h, m=0, s=0, day=9):
    return datetime(2026, 11, day, h, m, s, tzinfo=IST)


NOON = at(12)


def mk_limits(**ov):
    """DEFAULTS üzerine düz anahtar geçersiz kılmaları; yükleyiciyi atlar (kapının yeniden kırpmasını sınamak için)."""
    values = dict(cl.DEFAULTS)
    values.update(ov)
    return cl.Limits(MappingProxyType(values), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


def eff(profile="safe", age_h=10_000.0, **ov):
    return cg.compute_effective(mk_limits(**ov).values, profile, age_h)


def ev(grants=(), follows=()):
    return cg.Events(grants=tuple(grants), follows=tuple(follows))


def ready(profile="safe", age_h=10_000.0, remaining=500, now=NOON, grants=(), follows=(), pause=None, **ov):
    v = mk_limits(**ov).values

    def eff_at(t):          # ısınma zamanla ilerler
        return cg.compute_effective(v, profile, age_h + (t - now).total_seconds() / 3600)

    return cg.evaluate_ready(eff_at, ev(grants, follows), remaining, now, pause, cg.ramp_change_times(v, age_h, now))


# ── AC-C11: sert tavanlar ve ısınma sınırları ───────────────────────────────────

def test_hard_caps_and_ramp_boundaries():
    v = mk_limits().values
    s = lambda sec: sec / 3600
    assert cg.ramp_fraction(v, s(72 * 3600 - 1)) == 0.333       # 71:59
    assert cg.ramp_fraction(v, 72.0) == 0.667                   # 72:00
    assert cg.ramp_fraction(v, s(168 * 3600 - 1)) == 0.667      # 167:59
    assert cg.ramp_fraction(v, 168.0) == 1.0                    # 168:00
    assert cg.ramp_fraction(v, 0.0) == 0.333
    # örnek (safe): 66 / 133 / 200
    assert eff(age_h=s(72 * 3600 - 1)).daily_eff == 66
    assert eff(age_h=72.0).daily_eff == 133
    assert eff(age_h=s(168 * 3600 - 1)).daily_eff == 133
    assert eff(age_h=168.0).daily_eff == 200
    # hourly_eff = min(hourly, daily_eff)
    assert eff(age_h=0.0).hourly_eff == 40 and eff(age_h=0.0).hourly_cap == 40
    # ısınma kapalı: oran 1
    assert cg.ramp_fraction(mk_limits(**{"ramp.enabled": False}).values, 0.0) == 1.0
    # oran ve süre de dosyadan tek kaynak
    v2 = mk_limits(**{"ramp.first_hours": 10, "ramp.first_fraction": 0.5, "ramp.second_hours": 20,
                      "ramp.second_fraction": 0.75}).values
    assert [cg.ramp_fraction(v2, a) for a in (9.99, 10.0, 19.99, 20.0)] == [0.5, 0.75, 0.75, 1.0]


def test_hard_cap_never_exceeded_whatever_the_values():
    big = 10 ** 400
    for p in cl.PROFILES:
        e = eff(p, **{f"profiles.{p}.unsave.hourly": big, f"profiles.{p}.unsave.daily": big,
                      "account.hourly": big, "account.daily": big})
        assert e.hourly_eff <= 80 and e.daily_eff <= 400
        assert e.hourly_cap <= 80 and e.daily_cap <= 400
        assert e.account_hourly == 80 and e.account_daily == 400
    # alt sınır: negatif ve sıfır en az 1
    e = eff(**{"profiles.safe.unsave.hourly": -5, "profiles.safe.unsave.daily": 0, "account.hourly": -1})
    assert e.hourly_eff >= 1 and e.daily_eff >= 1 and e.account_hourly >= 1
    # kesirli ısınma oranı sert aralığın dışında olamaz
    assert cg.ramp_fraction(mk_limits(**{"ramp.first_fraction": 0.0}).values, 0.0) == 0.1
    assert cg.ramp_fraction(mk_limits(**{"ramp.first_fraction": 50.0}).values, 0.0) == 1.0


def test_gate_reclamps():
    """AC-C11/L9: yükleyiciyi atlayan bozuk değerler kapıda 'izin yok'a ya da sert tavana iner."""
    for bad in (math.nan, math.inf, -math.inf, True, "40", None):
        with pytest.raises(ValueError):
            eff(**{"profiles.safe.unsave.hourly": bad})
    with pytest.raises(ValueError):
        eff(**{"ramp.enabled": 1})
    with pytest.raises(ValueError):
        eff(**{"ramp.first_fraction": math.nan})


def test_gate_reapplies_delay_floor():
    """AC-L9 (v1.5, I-14): önbellekte delay_min=3 olsa bile kapı 10 kullanır; delay_max >= delay_min + 5."""
    e = eff(**{"profiles.safe.unsave.delay_min": 3, "profiles.safe.unsave.delay_max": 4})
    assert (e.delay_min, e.delay_max) == (10, 15)
    e = eff(**{"profiles.safe.unsave.delay_min": 100, "profiles.safe.unsave.delay_max": 101})
    assert (e.delay_min, e.delay_max) == (100, 105)
    e = eff(**{"profiles.safe.unsave.delay_min": 10 ** 9, "profiles.safe.unsave.delay_max": 10 ** 9})
    assert e.delay_min == 600 and e.delay_max == 900


# ── AC-C42: "hazır" kuralı ve next_allowed_at (a-f) ─────────────────────────────

def test_ready_rule_and_next_allowed_at():
    # (a) saatlik pencerede 1 boş yer açıldı: hazır değil; 39 izin çıkınca 40 boş yer: hazır
    r = ready(grants=[NOON - 10 * M] * 39)
    assert r.hourly_room == 1 and r.need == 40 and not r.ready
    assert r.next_allowed_at == NOON + 50 * M
    # (b) 40 boş yer açılınca hazır
    r = ready(grants=[NOON - 61 * M] * 40)
    assert r.hourly_room == 40 and r.ready and r.next_allowed_at is None
    r = ready(now=NOON + 50 * M, grants=[NOON - 10 * M] * 40)
    assert r.ready
    # (c) kalan 7 öğe: 7 boş yer yeter
    r = ready(remaining=7, grants=[NOON - 10 * M] * 33)
    assert r.need == 7 and r.hourly_room == 7 and r.ready
    r = ready(remaining=7, grants=[NOON - 10 * M] * 34)
    assert not r.ready and r.next_allowed_at == NOON + 50 * M
    # (d) hesap toplamı bağlayıcı: 10 izin + 50 takip -> hesap boş yeri 20, need 30
    r = ready(grants=[NOON - 50 * M] * 10, follows=[NOON - 30 * M] * 50)
    assert r.need == 30 and r.hourly_room == 20 and not r.ready
    assert r.next_allowed_at == NOON + 10 * M            # 10 izin penceresinden çıkınca hesap boş yeri 30
    # (e) ısınmada günün son kısmi payı hazır: daily_eff 66, hourly 40, r = 26
    e0 = eff(age_h=0.0)
    assert e0.daily_cap == 66 and e0.hourly_cap == 40
    r = ready(age_h=0.0, grants=[NOON - 2 * H] * 40)
    assert r.daily_room == 26 and r.hourly_room == 40 and r.daily_need == 26 and r.ready
    r = ready(age_h=0.0, grants=[NOON - 2 * H] * 41)
    assert r.daily_room == 25 and not r.ready
    assert r.next_allowed_at == NOON + 22 * H           # en eski izin 24 sa penceresinden çıkınca
    # (f) aggressive: 1 takip -> need 79, 79 boş yerle hazır (R4 M-1)
    r = ready("aggressive", follows=[NOON - 5 * M])
    assert r.need == 79 and r.hourly_room == 79 and r.ready
    r = ready("aggressive", follows=[NOON - 5 * M], grants=[NOON - 5 * M])
    assert r.need == 79 and r.hourly_room == 78 and not r.ready
    assert r.next_allowed_at == NOON + 55 * M


def test_ready_rule_quiet_hours_and_pause():
    # sessiz saatte hazır değil; bitişi 08:00
    r = ready(now=at(3))
    assert not r.ready and r.next_allowed_at == at(8)
    # duraklatma bitişi
    r = ready(pause=NOON + 3 * H)
    assert not r.ready and r.next_allowed_at == NOON + 3 * H
    # duraklatma sessiz saate taşar: ikisinin sonu
    r = ready(now=at(0, 30), pause=at(2))
    assert r.next_allowed_at == at(8)
    # geçmiş duraklatma sayılmaz
    assert ready(pause=NOON - H).ready
    # yarın sessiz saat öncesi boş yer açılırsa bile sessiz saat sonrası: 23:50'de dolu pencere
    r = ready(now=at(0, 50, day=10), grants=[at(0, 45, day=10)] * 40)
    assert r.next_allowed_at == at(8, day=10)           # 01:45'te boş yer açılır ama sessiz saat; 08:00
    # ısınma geçişi boş yer açar: 71,5 sa'te 66 izin dolu günlük pay; 72. saatte günlük tavan 133 olur
    r = ready(age_h=71.5, grants=[NOON - 50 * M] * 66)
    assert not r.ready and r.next_allowed_at == NOON + 30 * M


# ── AC-C43: tahmin ──────────────────────────────────────────────────────────────

def test_estimate_days_and_starts():
    v = mk_limits().values
    est = cg.estimate(500, v, "safe", 10_000.0)           # ısınma bitmiş
    assert est["days"] == 3 and est["starts"] == 13       # 5 + 5 + 3
    assert est["hourly"] == 40 and est["daily"] == 200
    est = cg.estimate(100, v, "safe", 0.0)                # ısınmanın ilk 72 saati
    assert est["daily"] == 66 and est["days"] == 2 and est["starts"] == 3   # (40+26) + 34
    # 0 öğe
    assert cg.estimate(0, v, "safe", 0.0)["days"] == 0
    # ısınma geçişi gün gün: 71 sa'te başlayan iş ikinci güne 133/gün ile girer
    est = cg.estimate(300, v, "safe", 71.0)
    assert est["daily"] == 66 and est["days"] == 3
    # hesap tavanı tahmini sınırlar
    est = cg.estimate(500, mk_limits(**{"account.daily": 100}).values, "safe", 10_000.0)
    assert est["daily"] == 100 and est["days"] == 5


# ── Veritabanı: kapı ve izin sayımı ─────────────────────────────────────────────

async def _session(make_session, profile="safe", **kw):
    kw.setdefault("allow_unsave", True)
    kw.setdefault("unsave_enabled_at", NOON - timedelta(days=30))
    return await make_session(risk_profile=profile, **kw)


async def _grants(db, s, times, status="failed"):
    from sqlalchemy import select
    b = (await db.execute(select(CleanupBatch).where(CleanupBatch.session_id == s.id))).scalars().first()
    if b is None:
        b = CleanupBatch(session_id=s.id, kind="saved", status="running", item_count=0, max_items_at_preview=500,
                         expires_at=NOON + 7 * 24 * H)
        db.add(b)
        await db.flush()
    n = len((await db.execute(select(CleanupItem.id).where(CleanupItem.session_id == s.id))).all())
    for i, t in enumerate(times):
        it = CleanupItem(session_id=s.id, batch_id=b.id, ref=str(10_000 + n + i), label="x", status=status)
        db.add(it)
        await db.flush()
        db.add(CleanupWriteGrant(session_id=s.id, item_id=it.id, granted_at=t))
    await db.commit()


async def _follows(db, s, times, action="follow"):
    for t in times:
        db.add(BridgeAction(session_id=s.id, ig_user_id=s.ig_user_id, username="x", action=action, status="done",
                            done_at=t))
    await db.commit()


async def gate(db, s, now=NOON, **kw):
    return await cg.cleanup_gate(db, s, "saved", now, **kw)


async def test_gate_order_and_quiet_hours_boundaries(db, make_session):
    """AC-C12: 00:59:59 izin, 01:00:00 / 04:00 / 07:59:59 quiet_hours, 08:00:00 izin."""
    s = await _session(make_session)
    assert await gate(db, s, at(0, 59, 59)) is None
    for t in (at(1), at(4), at(7, 59, 59)):
        assert await gate(db, s, t) == "quiet_hours"
    assert await gate(db, s, at(8)) is None
    # sıra: off > paused > quiet_hours > limit
    s.cleanup_paused_until = at(9)
    await db.commit()
    assert await gate(db, s, at(4)) == "paused"
    s.allow_unsave = False
    await db.commit()
    assert await gate(db, s, at(4)) == "off"


async def test_budgets_unsave_side_ignores_follow_queue_limits(db, make_session):
    """AC-C10 (kapı yanı): takip kuyruğu sert tavanını (15/sa) doldurmuş olsa da unsave kapısı açık."""
    s = await _session(make_session)
    await _follows(db, s, [NOON - 10 * M] * 15)
    assert await gate(db, s) is None
    # tür bütçesi dolunca limit
    await _grants(db, s, [NOON - 10 * M] * 40)
    assert await gate(db, s) == "limit"


async def test_account_total_cap_counts_follow_and_unsave(db, make_session):
    """AC-C25: takip + unsave toplamı 80/sa ve 400/gün'e ulaşınca limit."""
    s = await _session(make_session)
    await _follows(db, s, [NOON - 10 * M] * 60)
    await _grants(db, s, [NOON - 10 * M] * 19)
    assert await gate(db, s) is None
    await _grants(db, s, [NOON - 10 * M])
    assert await gate(db, s) == "limit"
    st = await cg.budget_state(db, s, NOON)
    assert st.next_allowed_at == NOON + 50 * M
    # günlük: 350 takip (24 sa içinde, son saat dışında) + 50 izin = 400
    s2 = await _session(make_session, username="other")
    await _follows(db, s2, [NOON - 5 * H] * 350, action="unfollow")
    await _grants(db, s2, [NOON - 4 * H] * 49)
    assert await gate(db, s2) is None
    await _grants(db, s2, [NOON - 4 * H])
    assert await gate(db, s2) == "limit"


async def test_failed_writes_count_toward_budget(db, make_session):
    """AC-C26 (R7 M5): hourly=3 iken üç izin `failed` dönse de dördüncü precheck limit alır."""
    s = await _session(make_session)
    lim = mk_limits(**{"profiles.safe.unsave.hourly": 3})
    await _grants(db, s, [NOON - 5 * M] * 2, status="failed")
    assert await gate(db, s, limits=lim) is None
    await _grants(db, s, [NOON - 4 * M], status="failed")
    assert await gate(db, s, limits=lim) == "limit"
    # 61 dk sonra pencereden çıkar
    assert await gate(db, s, NOON + 57 * M, limits=lim) is None


async def test_ready_rule_counts_grants(db, make_session):
    """AC-C42 (g): safe profilde son 1 saatte 40 izin alınmış ve hepsi failed dönmüşse hazır değil."""
    s = await _session(make_session)
    await _grants(db, s, [NOON - 20 * M] * 40, status="failed")
    st = await cg.budget_state(db, s, NOON, remaining=500)
    assert not st.ready and st.hourly_room == 0
    assert st.next_allowed_at == NOON + 40 * M
    assert (await cg.budget_state(db, s, NOON + 40 * M, remaining=500)).ready
    # already / not_found / protected izin almadığı için sayılmaz: öğe var, izin yok
    s2 = await _session(make_session, username="o2")
    await _grants(db, s2, [], status="done")
    assert (await cg.budget_state(db, s2, NOON)).ready


async def test_gate_reclamps_db_level(db, make_session):
    """AC-C11: bellekteki değer sert tavanı aşsa da (10**9) kapı 80/sa'te kapanır."""
    s = await _session(make_session, profile="aggressive")
    lim = mk_limits(**{"profiles.aggressive.unsave.hourly": 10 ** 9, "profiles.aggressive.unsave.daily": 10 ** 9,
                       "account.hourly": 10 ** 9, "account.daily": 10 ** 9})
    await _grants(db, s, [NOON - 5 * M] * 79)
    assert await gate(db, s, limits=lim) is None
    await _grants(db, s, [NOON - 5 * M])
    assert await gate(db, s, limits=lim) == "limit"


async def test_gate_fails_closed(db, make_session, monkeypatch):
    """AC-L9: yükleyici ya da kapı istisna atarsa sonuç 'izin yok' (limit)."""
    s = await _session(make_session)
    assert await gate(db, s) is None

    def boom():
        raise RuntimeError("loader")

    monkeypatch.setattr(cg, "get_limits", boom)
    assert await gate(db, s) == "limit"
    monkeypatch.undo()
    assert await gate(db, s, limits=mk_limits(**{"account.hourly": math.nan})) == "limit"
    assert await gate(db, s, limits=mk_limits(**{"profiles.safe.unsave.hourly": True})) == "limit"
    assert await gate(db, s, limits=mk_limits(**{"profiles.safe.unsave.daily": math.inf})) == "limit"


async def test_cleanup_pause_survives_and_follow_pause_is_mirrored(db, make_session):
    """AC-C24: takip anahtarından bağımsız; takip duraklatması kopyalanır, 'Köprü:' önekliler kopyalanmaz."""
    s = await _session(make_session, allow_actions=True)
    s.cleanup_paused_until = NOON + 5 * H
    s.cleanup_paused_reason = "blocked"
    await db.commit()
    for flag in (False, True, False):                       # allow_actions aç/kapa (sessions.py:276-278)
        s.allow_actions = flag
        await db.commit()
        assert await gate(db, s) == "paused"
        assert s.cleanup_paused_until == NOON + 5 * H       # kapı alanı temizlemez
    assert await gate(db, s, NOON + 6 * H) is None          # süresi dolunca açılır, alan silinmez
    assert s.cleanup_paused_until == NOON + 5 * H
    # takip yolunun duraklatması ilk kapı okumasında kopyalanır
    s2 = await _session(make_session, username="f", allow_actions=True)
    s2.paused_until = NOON + 2 * H
    s2.paused_reason = "Instagram işlemi engelledi"
    await db.commit()
    assert await gate(db, s2) == "paused"
    assert s2.cleanup_paused_until == NOON + 2 * H
    s2.paused_until = None                                  # takip tarafı duraklatmayı kaldırsa da
    s2.paused_reason = None
    await db.commit()
    assert await gate(db, s2) == "paused"                   # ek iş duraklatması kalkmaz
    # 'Köprü:' önekli: kopyalanmaz
    s3 = await _session(make_session, username="b", allow_actions=True)
    s3.paused_until = NOON + 2 * H
    s3.paused_reason = "Köprü: oturum uyarısı"
    await db.commit()
    await gate(db, s3)
    assert s3.cleanup_paused_until is None and s3.cleanup_paused_reason is None


async def test_gate_takes_profile_row_lock(db, db_engine, make_session):
    """AC-C47/C26: kapı sessions satırını FOR UPDATE ile kilitler."""
    s = await _session(make_session)
    seen = []

    def spy(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    event.listen(db_engine.sync_engine, "before_cursor_execute", spy)
    try:
        await gate(db, s)
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", spy)
    assert any("FOR UPDATE" in q and "FROM sessions" in q for q in seen)


async def test_gate_holds_profile_row_lock_against_a_second_connection(db, db_engine, make_session):
    """AC-C26/C47 (davranış): kapı döndüğünde profil satırı hâlâ kilitli; ikinci bağlantı NOWAIT ile alamaz.
    Kilit `cleanup_gate` içindeki `lock_session` çağrısından gelir (cleanup_exec'e dayanmaz); `lock=False` kilit almaz."""
    from sqlalchemy import select
    from sqlalchemy.exc import DBAPIError
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.models.session import Session

    s = await _session(make_session)
    await db.commit()                                       # satır görünür, işlem temiz
    sid = s.id                                              # rollback nesneyi eskitir; kimliği önceden al
    other = async_sessionmaker(db_engine, expire_on_commit=False)

    async def try_lock():
        async with other() as o:
            try:
                await o.execute(select(Session.id).where(Session.id == sid).with_for_update(nowait=True))
                return True
            except DBAPIError:
                return False
            finally:
                await o.rollback()

    assert await try_lock() is True                         # kontrol: kimse tutmuyorken alınabilir
    assert await gate(db, s, lock=False) is None
    assert await try_lock() is True                         # lock=False: kapı kilit almaz
    await db.rollback()
    await db.refresh(s)                                     # rollback nesneyi eskitti; kapı sessizce 'limit' dönmesin
    assert await gate(db, s) is None                                       # varsayılan: kapı kilidi alır
    assert await try_lock() is False                        # işlem açıkken ikinci bağlantı alamaz
    await db.rollback()
    assert await try_lock() is True                         # işlem bitince kilit düşer


async def test_record_grant_writes_row_counted_immediately(db, make_session):
    """R7 M5: `record_grant` bir satır yazar; aynı işlemde sayıma girer (uçuştaki izin ayrı kural değildir)."""
    s = await _session(make_session)
    await _grants(db, s, [], status="pending")
    from sqlalchemy import select
    b = (await db.execute(select(CleanupBatch).where(CleanupBatch.session_id == s.id))).scalars().first()
    it = CleanupItem(session_id=s.id, batch_id=b.id, ref="777", label="x")
    db.add(it)
    await db.flush()
    lim = mk_limits(**{"profiles.safe.unsave.hourly": 1})
    assert await gate(db, s, limits=lim) is None
    await cg.record_grant(db, s, it.id, NOON)
    assert await gate(db, s, limits=lim) == "limit"
    rows = (await db.execute(select(CleanupWriteGrant).where(CleanupWriteGrant.session_id == s.id))).scalars().all()
    assert len(rows) == 1 and rows[0].granted_at == NOON
