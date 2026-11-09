"""SPEC-001 AC-C32 (T-4a): dakikalık cleanup_stale ve günlük cleanup_retention.

Sahte saat: tüm servis fonksiyonları `now` alır. İzole instaanalytic_pytest veritabanı.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import MappingProxyType

import pytest
from sqlalchemy import event, func, select

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, CleanupWriteGrant, SavedTarget,
)
from app.services import cleanup_limits as cl
from app.services import cleanup_scan as sc

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
MIN = timedelta(minutes=1)
DAY = timedelta(days=1)


def mk_limits(**ov):
    values = dict(cl.DEFAULTS)
    values.update(ov)
    return cl.Limits(MappingProxyType(values), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


L = mk_limits()          # safe: delay_max 45 -> T = max(600, 2*45+120) = 600


async def mk_batch(db, s, status="running", **kw):
    b = CleanupBatch(session_id=s.id, kind="saved", status=status, item_count=kw.pop("item_count", 0),
                     max_items_at_preview=100, expires_at=kw.pop("expires_at", NOW + 30 * MIN), **kw)
    db.add(b)
    await db.commit()
    return b


async def mk_scan(db, s, status="ok", **kw):
    x = CleanupScan(session_id=s.id, kind="saved", status=status, **kw)
    db.add(x)
    await db.commit()
    return x


async def reload(db, obj):
    await db.refresh(obj)
    return obj


# ── cleanup_stale: partiler (AC-C44 kuralı, AC-C32) ─────────────────────────────

async def test_stale_task_batches(db, make_session):
    s = await make_session(allow_unsave=True)
    old = NOW - 11 * MIN                       # T = 600 sn = 10 dk aşıldı
    b = await mk_batch(db, s, started_at=old, last_seen_at=old, stale_after_s=None)
    n = await sc.stop_stale_batches(db, NOW, limits=L)
    await db.commit()
    assert n == 1
    await reload(db, b)
    assert b.status == "stopped" and b.last_stop_reason == "stale"


async def test_stale_task_uses_coalesce_and_threshold_boundaries(db, make_session):
    s = await make_session(allow_unsave=True)
    s2 = await make_session(username="b", allow_unsave=True)
    # last_seen_at yok: started_at'e bakılır (AC-C44 h); 601 sn önce -> stale
    b1 = await mk_batch(db, s, started_at=NOW - timedelta(seconds=601))
    # tam eşikte (600 sn) stale değil
    b2 = await mk_batch(db, s2, started_at=NOW - timedelta(seconds=600), last_seen_at=NOW - timedelta(seconds=600))
    assert await sc.stop_stale_batches(db, NOW, limits=L) == 1
    await reload(db, b1)
    await reload(db, b2)
    assert (b1.status, b2.status) == ("stopped", "running")


async def test_stale_threshold_formula(db, make_session):
    """T = max(600, 2*delay_max + 120); T_eff = max(T_güncel, batch.stale_after_s) (K-2, I-7)."""
    assert sc.stale_threshold_s(45) == 600
    assert sc.stale_threshold_s(240) == 600
    assert sc.stale_threshold_s(241) == 602
    assert sc.stale_threshold_s(900) == 1920
    s = await make_session(allow_unsave=True)
    seen = NOW - 15 * MIN
    # dosyada delay_max düşmüş ama eklenti 1920 sn'lik bekleme almış: stale_after_s korur
    b = await mk_batch(db, s, started_at=seen, last_seen_at=seen, stale_after_s=1920)
    assert await sc.stop_stale_batches(db, NOW, limits=L) == 0
    await reload(db, b)
    assert b.status == "running"
    # stale_after_s yoksa 600 geçerli -> 15 dk stale
    b.stale_after_s = None
    await db.commit()
    assert await sc.stop_stale_batches(db, NOW, limits=L) == 1
    # profilin etkin delay_max'ı: aggressive 25 -> yine 600; delay_max 900 -> 1920
    s2 = await make_session(username="b", allow_unsave=True)
    big = mk_limits(**{"profiles.safe.unsave.delay_max": 900})
    b2 = await mk_batch(db, s2, started_at=seen, last_seen_at=seen)
    assert await sc.stop_stale_batches(db, NOW, limits=big) == 0


async def test_stale_update_is_conditional(db, make_session):
    """I-6: UPDATE ... WHERE status='running' AND eşik; eşzamanlı başlatma/next ezilmez."""
    s = await make_session(allow_unsave=True)
    seen = NOW - 20 * MIN
    b = await mk_batch(db, s, started_at=seen, last_seen_at=seen)
    cands = await sc.stale_batch_candidates(db, NOW)
    assert [c.id for c in cands] == [b.id]
    # aday seçildikten sonra eşzamanlı next last_seen_at'i yeniler
    b.last_seen_at = NOW
    await db.commit()
    assert await sc.stop_batch_if_stale(db, b.id, NOW - 10 * MIN, NOW) is False
    await reload(db, b)
    assert b.status == "running"
    # eşzamanlı olarak zaten durmuş parti ezilmez
    b.status, b.last_stop_reason, b.last_seen_at = "stopped", "user_stop", seen
    await db.commit()
    assert await sc.stop_batch_if_stale(db, b.id, NOW - 10 * MIN, NOW) is False
    await reload(db, b)
    assert b.last_stop_reason == "user_stop"


async def test_stale_ignores_non_running_and_fresh(db, make_session):
    seen = NOW - 3 * 60 * MIN
    for i, st in enumerate(("confirmed", "stopped", "done")):
        s = await make_session(username=f"u{i}", allow_unsave=True)
        await mk_batch(db, s, status=st, started_at=seen, last_seen_at=seen,
                       **({"finished_at": seen} if st == "done" else {}))
    s = await make_session(username="fresh", allow_unsave=True)
    await mk_batch(db, s, started_at=NOW - 5 * MIN, last_seen_at=NOW - 5 * MIN)
    assert await sc.stop_stale_batches(db, NOW, limits=L) == 0


# ── cleanup_stale: taramalar (AC-S8) ────────────────────────────────────────────

async def test_stale_task_scans_fail_and_rows_deleted(db, make_session):
    s = await make_session(allow_unsave=True)
    x = await mk_scan(db, s, status="running", started_at=NOW - 11 * MIN)
    db.add(SavedTarget(session_id=s.id, scan_id=x.id, position=0, media_id="1", shortcode="Cabcde12345"))
    fresh = await mk_scan(db, s, status="running", started_at=NOW - 2 * MIN)
    await db.commit()
    n = await sc.fail_stale_scans(db, NOW, limits=L)
    await db.commit()
    assert n == 1
    await reload(db, x)
    await reload(db, fresh)
    assert x.status == "failed" and x.finished_at == NOW and x.note_code is None
    assert fresh.status == "running"
    assert (await db.execute(select(func.count()).select_from(SavedTarget))).scalar_one() == 0


async def test_scan_stale_threshold_uses_last_page_and_page_delay(db, make_session):
    """Tarama takılma eşiği max(600, 2*page_delay_max+120); sayaç son sayfadan (yoksa başlangıçtan)."""
    assert sc.scan_stale_threshold_s(6) == 600
    assert sc.scan_stale_threshold_s(120) == 600
    assert sc.scan_stale_threshold_s(240) == 600
    assert sc.scan_stale_threshold_s(241) == 602
    s = await make_session(allow_unsave=True)
    x = await mk_scan(db, s, status="running", started_at=NOW - 60 * MIN, last_page_at=NOW - 5 * MIN)
    assert await sc.fail_stale_scans(db, NOW, limits=L) == 0
    x.last_page_at = NOW - 11 * MIN
    await db.commit()
    assert await sc.fail_stale_scans(db, NOW, limits=L) == 1


# ── cleanup_retention (AC-C32, C22, C23, R7 M5) ─────────────────────────────────

async def test_retention_task(db, make_session):
    s = await make_session(allow_unsave=True)
    # 1 günden eski expired/cancelled taslaklar silinir; yenisi ve etkin parti kalır
    old_exp = await mk_batch(db, s, status="expired", expires_at=NOW - 2 * DAY)
    old_can = await mk_batch(db, s, status="cancelled", expires_at=NOW - 2 * DAY)
    new_can = await mk_batch(db, s, status="cancelled", expires_at=NOW - 2 * 60 * MIN)
    act = await mk_batch(db, s, status="stopped", confirmed_at=NOW - 3 * DAY, started_at=NOW - 3 * DAY,
                         expires_at=NOW - 3 * DAY)
    # onaylanmış (geçmiş) iptal/expired parti, taslak değildir: silinmez
    hist = await mk_batch(db, s, status="cancelled", confirmed_at=NOW - 5 * DAY, expires_at=NOW - 5 * DAY)
    ids = (old_exp.id, old_can.id, new_can.id, act.id, hist.id)
    out = await sc.run_retention(db, NOW)
    await db.commit()
    left = set((await db.execute(select(CleanupBatch.id))).scalars())
    assert out["drafts_deleted"] == 2
    assert left == {ids[2], ids[3], ids[4]}


async def test_retention_keeps_last_20_scans_per_session(db, make_session):
    s = await make_session(allow_unsave=True)
    s2 = await make_session(username="other", allow_unsave=True)
    scans = [await mk_scan(db, s, status="failed", started_at=NOW - (30 - i) * 60 * MIN) for i in range(25)]
    other = [await mk_scan(db, s2, status="failed") for _ in range(3)]
    b = await mk_batch(db, s, status="stopped", scan_id=scans[0].id, confirmed_at=NOW, started_at=NOW)
    out = await sc.run_retention(db, NOW)
    await db.commit()
    assert out["scans_deleted"] == 5
    kept = set((await db.execute(select(CleanupScan.id).where(CleanupScan.session_id == s.id))).scalars())
    assert kept == {x.id for x in scans[5:]}
    assert (await db.execute(select(func.count()).select_from(CleanupScan).where(
        CleanupScan.session_id == s2.id))).scalar_one() == 3
    await reload(db, b)
    assert b.scan_id is None                       # SET NULL; parti ve öğeleri kalır


async def test_retention_never_drops_current_inventory_scan(db, make_session):
    """Güncel envanter taraması 20 yeni başarısız tarama arkasında kalsa da silinmez (envanter sessizce yok olmaz)."""
    s = await make_session(allow_unsave=True)
    inv = await mk_scan(db, s, status="ok", started_at=NOW - 48 * 60 * MIN, finished_at=NOW - 47 * 60 * MIN)
    db.add(SavedTarget(session_id=s.id, scan_id=inv.id, position=0, media_id="1", shortcode="Cabcde12345"))
    for i in range(21):
        await mk_scan(db, s, status="failed", started_at=NOW - (20 - i) * 60 * MIN)
    await sc.run_retention(db, NOW)
    await db.commit()
    assert (await db.execute(select(CleanupScan.id).where(CleanupScan.id == inv.id))).scalar_one() == inv.id
    assert (await db.execute(select(func.count()).select_from(SavedTarget))).scalar_one() == 1


async def test_retention_seven_day_rule_expires_batches(db, make_session):
    """AC-C23: coalesce(last_progress_at, started_at, confirmed_at) 7 günü aşan etkin parti expired; bekleyenler cancelled."""
    s = await make_session(allow_unsave=True)
    b = await mk_batch(db, s, status="stopped", item_count=2, confirmed_at=NOW - 9 * DAY, started_at=NOW - 8 * DAY,
                       last_progress_at=NOW - 7 * DAY - MIN)
    s2 = await make_session(username="b", allow_unsave=True)      # kısmi benzersiz indeks: profil başına tek etkin parti
    fresh = await mk_batch(db, s2, status="running", confirmed_at=NOW - 9 * DAY, started_at=NOW - 8 * DAY,
                           last_progress_at=NOW - 6 * DAY)
    db.add_all([
        CleanupItem(session_id=s.id, batch_id=b.id, ref="11", label="@a · Cabcde1", status="pending"),
        CleanupItem(session_id=s.id, batch_id=b.id, ref="12", label="@a · Cabcde2", status="done"),
    ])
    await db.commit()
    out = await sc.run_retention(db, NOW)
    await db.commit()
    assert out["batches_expired"] == 1
    await reload(db, b)
    await reload(db, fresh)
    assert b.status == "expired" and b.finished_at == NOW
    assert fresh.status == "running"
    st = dict((await db.execute(select(CleanupItem.ref, CleanupItem.status))).all())
    assert st == {"11": "cancelled", "12": "done"}
    logs = (await db.execute(select(ActionLog).where(ActionLog.session_id == s.id))).scalars().all()
    assert [(x.action_type, x.status, x.target_ref, x.ig_user_id) for x in logs] == [("unsave", "cancelled", "11", None)]
    # eşik: tam 7 gün sayılmaz
    edge = await mk_batch(db, s, status="stopped", confirmed_at=NOW - 7 * DAY, started_at=NOW - 7 * DAY,
                          last_progress_at=NOW - 7 * DAY)
    assert (await sc.run_retention(db, NOW))["batches_expired"] == 0
    await reload(db, edge)
    assert edge.status == "stopped"


async def test_retention_deletes_grants_older_than_48h(db, make_session):
    s = await make_session(allow_unsave=True)
    b = await mk_batch(db, s)
    items = [CleanupItem(session_id=s.id, batch_id=b.id, ref=str(i), label="@a · Cabcde1") for i in range(3)]
    db.add_all(items)
    await db.commit()
    db.add_all([
        CleanupWriteGrant(session_id=s.id, item_id=items[0].id, granted_at=NOW - 49 * 60 * MIN),
        CleanupWriteGrant(session_id=s.id, item_id=items[1].id, granted_at=NOW - 47 * 60 * MIN),
        CleanupWriteGrant(session_id=s.id, item_id=items[2].id, granted_at=NOW - 48 * 60 * MIN),   # tam 48 sa: eski değil
    ])
    await db.commit()
    out = await sc.run_retention(db, NOW)
    await db.commit()
    assert out["grants_deleted"] == 1             # yalnız 48 saatten ESKİ (49 sa); 48 sa ve 47 sa kalır
    left = (await db.execute(select(CleanupWriteGrant.granted_at))).scalars().all()
    assert sorted(left) == sorted([NOW - 47 * 60 * MIN, NOW - 48 * 60 * MIN])


async def test_retention_is_idempotent(db, make_session):
    s = await make_session(allow_unsave=True)
    await mk_batch(db, s, status="expired", expires_at=NOW - 2 * DAY)
    first = await sc.run_retention(db, NOW)
    await db.commit()
    second = await sc.run_retention(db, NOW)
    assert first["drafts_deleted"] == 1 and second == {k: 0 for k in first}


async def test_hot_paths_do_not_delete(db, make_session):
    """Sıcak yol işlevleri (tarama başlat/sayfa/envanter) hiçbir DELETE çalıştırmaz; silme yalnız
    finish (AC-C22) ve zamanlanmış görevlerdedir. next/precheck/result testi T-4c/T-6'dadır."""
    s = await make_session(allow_unsave=True)
    stmts = []

    def spy(conn, cursor, statement, params, context, executemany):
        stmts.append(statement)

    sync_engine = db.get_bind().sync_engine if hasattr(db.get_bind(), "sync_engine") else db.get_bind()
    event.listen(sync_engine, "before_cursor_execute", spy)
    try:
        st = await sc.start_scan(db, s, NOW, limits=L)
        await sc.add_page(db, s, st.scan_id, 1, [{"media_id": "5", "shortcode": "Cabcde12345"}], NOW, limits=L)
        await sc.inventory(db, s, NOW)
    finally:
        event.remove(sync_engine, "before_cursor_execute", spy)
    assert stmts and not [x for x in stmts if x.lstrip().upper().startswith("DELETE")]


# ── Celery görev sarmalayıcıları ────────────────────────────────────────────────

async def test_task_wrappers_run_services_with_fresh_engine(db_engine, db, make_session, monkeypatch):
    from app.tasks import cleanup_tasks
    s = await make_session(allow_unsave=True)
    old = datetime.now(timezone.utc) - 30 * MIN
    b = await mk_batch(db, s, started_at=old, last_seen_at=old)
    await mk_batch(db, s, status="expired", expires_at=old - 3 * DAY)
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    monkeypatch.setattr(cleanup_tasks, "make_engine",
                        lambda: create_async_engine(db_engine.url, poolclass=NullPool))
    r1 = await asyncio.to_thread(cleanup_tasks.cleanup_stale.run)
    r2 = await asyncio.to_thread(cleanup_tasks.cleanup_retention.run)
    assert r1 == {"batches_stopped": 1, "scans_failed": 0}
    assert r2["drafts_deleted"] == 1
    await reload(db, b)
    assert b.status == "stopped" and b.last_stop_reason == "stale"
