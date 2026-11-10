"""SPEC-001 T-4c: `next` / `precheck` / `result`, hata sınıfları, 429, `protected`, okuma bütçesi, sunucu tarafı durdurma.

AC: C2, C13..C19, C23, C26, C28, C29 (sunucu yarısı), C35, C44, C46..C50, C52, C53, C57, S16, S17, S21, S23.
Spec §9 bu testlerin çoğunu `test_cleanup.py` (uç nokta düzeyi, T-5/T-6) altında listeler; burada aynı davranış servis
düzeyinde pinlenir (T-4a/T-4b ile aynı yöntem). Sahte saat: tüm servis fonksiyonları `now` alır, gerçek bekleme yoktur
(tek istisna: eşzamanlı precheck testindeki veritabanı kilidi bekleme payı).
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import MappingProxyType

import pytest
from sqlalchemy import event, func, null as sql_null, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, CleanupWriteGrant, SavedCollection, SavedTarget,
)
from app.models.notification import Notification
from app.models.session import Session
from app.services import cleanup_batch as cb
from app.services import cleanup_exec as ex
from app.services import cleanup_limits as cl
from app.services.cleanup_scan import CleanupError

T0 = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)        # İstanbul 15:00: sessiz saat dışı
SEC = timedelta(seconds=1)
MIN = timedelta(minutes=1)
H = timedelta(hours=1)
DAY = timedelta(days=1)
EXT = "2.9.0"
A_ID, B_ID, X_ID = "17890000000000001", "17890000000000002", "17890000000000003"


def mk_limits(**ov):
    values = dict(cl.DEFAULTS)
    values.update(ov)
    return cl.Limits(MappingProxyType(values), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


L = mk_limits()          # safe: 40/sa, 200/gün, gecikme 20-45 sn, T = 600 sn


def ref(i):
    return str(3500000000000000000 + i)


async def err(coro):
    with pytest.raises(CleanupError) as e:
        await coro
    return e.value


def viewer(s):
    return str(s.ig_user_id)


async def mk_profile(make_session, username="me", **kw):
    kw.setdefault("allow_unsave", True)
    kw.setdefault("unsave_enabled_at", T0 - 30 * DAY)           # ısınma bitmiş
    return await make_session(username=username, **kw)


async def mk_inventory(db, s, n, *, now=T0, collections=None, rows=None):
    """n satırlık güncel envanter. `collections`: [(id, ad, protected)] -> W (per_collection); yoksa F."""
    w = collections is not None
    scan = CleanupScan(session_id=s.id, kind="saved", status="ok", started_at=now - H, finished_at=now - H + MIN,
                       items=n, pages=1, collections_mode="per_collection" if w else "all_protected",
                       collections_received_at=(now - H) if w else None)
    db.add(scan)
    await db.flush()
    for cid, name, prot in collections or []:
        db.add(SavedCollection(session_id=s.id, collection_id=cid, name=name, protected=prot,
                               first_seen_scan_id=scan.id, last_seen_scan_id=scan.id, listed_scan_id=scan.id))

    def row(i):
        d = dict(session_id=s.id, scan_id=scan.id, position=i - 1, media_id=ref(i), shortcode=f"Cabc{i:06d}",
                 owner_username=f"user{i}", media_type=("image", "video", "carousel")[i % 3])
        d.update((rows or {}).get(i, {}))
        if "collection_ids" in d and d["collection_ids"] is None:
            d["collection_ids"] = sql_null()
        return SavedTarget(**d)

    db.add_all([row(i) for i in range(1, n + 1)])
    await db.commit()
    return scan


async def reload(db, obj):
    await db.refresh(obj)
    return obj


async def mk_run(db, make_session, n=3, *, now=T0, limits=L, collections=None, rows=None, profile_kw=None):
    """Profil + envanter + onaylı parti + Başlat. (s, batch, run_seq, items) döner; items id sırasındadır."""
    s = await mk_profile(make_session, **(profile_kw or {}))
    scan = await mk_inventory(db, s, n, now=now, collections=collections, rows=rows)
    r = await cb.preview(db, s, {"scan_id": scan.id, "select": "refs", "refs": [ref(i) for i in range(1, n + 1)]},
                         now, limits=limits)
    await db.commit()
    await cb.confirm(db, s, r.batch_id, r.item_count, now, limits=limits)
    await db.commit()
    st = await cb.start_batch(db, s, r.batch_id, None, now, limits=limits)
    await db.commit()
    b = await reload(db, await db.get(CleanupBatch, r.batch_id))
    return s, b, st.run_seq, await items_of(db, b.id)


async def items_of(db, batch_id):
    rows = list((await db.execute(select(CleanupItem).where(CleanupItem.batch_id == batch_id)
                                  .order_by(CleanupItem.id))).scalars())
    for r in rows:
        await db.refresh(r)
    return rows


async def nxt(db, s, b, seq, now=T0, *, limit=10, viewer_id=None, ext=EXT, limits=L):
    out = await ex.next_items(db, s, b.id, seq, viewer_id or viewer(s), ext, limit, now, limits=limits)
    await db.commit()
    return out


async def pre(db, s, item, seq, now=T0, *, ids=(), viewer_id=None, ext=EXT, limits=L):
    out = await ex.precheck(db, s, item.id, viewer_id or viewer(s), ext, seq, list(ids), now, limits=limits)
    await db.commit()
    return out


async def res(db, s, item, seq, outcome, now=T0, *, viewer_id=None, limits=L, **kw):
    out = await ex.report_result(db, s, item.id, viewer_id or viewer(s), seq, outcome, now, limits=limits, **kw)
    await db.commit()
    return out


async def allowed(db, s, item, seq, now=T0, **kw):
    p = await pre(db, s, item, seq, now, **kw)
    assert p.allow is True, p
    return p


async def notifs(db, s, kind):
    return list((await db.execute(select(Notification).where(
        Notification.session_id == s.id, Notification.kind == kind).order_by(Notification.id))).scalars())


async def alog(db, s):
    return list((await db.execute(select(ActionLog).where(
        ActionLog.session_id == s.id, ActionLog.action_type == "unsave").order_by(ActionLog.id))).scalars())


async def grants(db, s):
    return (await db.execute(select(func.count()).select_from(CleanupWriteGrant).where(
        CleanupWriteGrant.session_id == s.id))).scalar_one()


async def untouched_batch(db, b):
    """(durum, last_seen_at, last_stop_reason, run_seq) damgası: uyuşmazlık çağrıları bunu değiştirmemeli (R5 L-c)."""
    await db.refresh(b)
    return (b.status, b.last_seen_at, b.last_stop_reason, b.run_seq)


# ══ Saf: hata sınıfları (AC-C19, C46, S17; §7.9.4 tek tablo) ═════════════════════

@pytest.mark.parametrize("note,http,expected", [
    ("network", None, ("retry", None)),
    ("not_json", 200, ("retry", None)),
    ("unrecognised_shape", None, ("retry", None)),
    ("verify_failed", None, ("retry", None)),
    ("verify_unavailable", None, ("retry", None)),
    ("precheck_unavailable", None, ("retry", None)),
    ("exception", None, ("retry", None)),
    ("http_error", 500, ("retry", None)),
    ("http_error", 503, ("retry", None)),
    ("http_error", None, ("retry", None)),
    ("http_error", 400, ("permanent", None)),
    ("http_error", 403, ("permanent", None)),
    ("http_error", 405, ("permanent", None)),
    ("http_error", 422, ("permanent", None)),
    ("http_error", 401, ("halt", "login_required")),
    ("http_error", 429, ("halt", "rate_limited")),
    ("http_error", 404, ("not_found", None)),
    ("http_error", 410, ("not_found", None)),
    ("login_required", None, ("halt", "login_required")),
    ("tokens_missing", None, ("halt", "tokens_missing")),
    ("account_mismatch", None, ("halt", "account_mismatch")),
    ("rate_limited", None, ("halt", "rate_limited")),
    ("rate_limited", 429, ("halt", "rate_limited")),
    ("mutation_unrecognised", 200, ("halt", "mutation_unrecognised")),
    ("blocked", None, ("halt", "blocked")),
    (None, None, ("retry", None)),                      # nedensiz failed: yeniden denenebilir (exception gibi)
])
def test_classify_failure_single_table(note, http, expected):
    assert ex.classify_failure(note, http) == expected


def test_read_cap_default_and_clamps_to_240():
    assert ex.read_cap(L) == 120
    assert ex.read_cap(mk_limits(**{"reads.status_per_hour": 999})) == 240
    assert ex.read_cap(mk_limits(**{"reads.status_per_hour": 3})) == 3
    assert ex.read_cap(mk_limits(**{"reads.status_per_hour": True})) == 120        # bozuk değer: varsayılan
    assert ex.read_cap(mk_limits(**{"reads.status_per_hour": float("nan")})) == 120


# ══ next (AC-C2, C44, C49, C57, C53, S21, S23) ══════════════════════════════════

async def test_next_serves_pending_in_order_with_timing_and_marks_seen(db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 4)
    out = await nxt(db, s, b, seq, T0 + 5 * SEC, limit=2)
    assert out.reason is None and out.run_seq == seq
    assert out.items == [{"id": its[0].id, "ref": ref(1), "label": its[0].label},
                         {"id": its[1].id, "ref": ref(2), "label": its[1].label}]
    assert out.delay == (20, 45) and out.stale_after_ms == 600_000
    assert out.allow_collections == []                                    # F: boş (R6 H-3)
    await reload(db, b)
    assert b.last_seen_at == T0 + 5 * SEC and b.stale_after_s == 600 and b.status == "running"
    assert await grants(db, s) == 0                                       # next izin vermez
    assert [i.status for i in await items_of(db, b.id)] == ["pending"] * 4


@pytest.mark.parametrize("bad", [0, 11, -1, True, "3", None, 2.0])
async def test_next_limit_validation(db, make_session, bad):
    s, b, seq, _ = await mk_run(db, make_session, 2)
    e = await err(ex.next_items(db, s, b.id, seq, viewer(s), EXT, bad, T0, limits=L))
    assert (e.code, e.status, e.extra["fields"]) == ("invalid", 422, ["limit"])


async def test_only_running_batch_is_served(db, make_session):
    """AC-C40: running dışında `reason=stopped`; `done` partide bekleyen kalmadığı için `empty`."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    for st, want in (("confirmed", "stopped"), ("stopped", "stopped"), ("cancelled", "stopped"), ("done", "empty")):
        await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(status=st))
        await db.commit()
        out = await nxt(db, s, b, seq, T0 + MIN)
        assert (out.reason, out.items) == (want, []), st
        assert (await reload(db, b)).status == st                         # next durumu değiştirmedi


async def test_next_with_old_run_seq_is_stopped_and_untouched(db, make_session):
    """AC-C49 (K-3, L-c): eski run_seq -> reason=stopped; parti durumu, last_seen_at, last_stop_reason değişmez."""
    s, b, seq, _ = await mk_run(db, make_session, 2)
    before = await untouched_batch(db, b)
    out = await nxt(db, s, b, seq - 1, T0 + 30 * SEC)
    assert (out.reason, out.items) == ("stopped", [])
    assert await untouched_batch(db, b) == before
    out = await nxt(db, s, b, seq + 1, T0 + 30 * SEC)
    assert out.reason == "stopped" and await untouched_batch(db, b) == before


async def test_old_run_seq_is_refused_after_restart(db, make_session):
    """AC-C49: Durdur -> Başlat sonrası eski döngü yeni çalıştırmayı benimseyemez (next ve precheck)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + MIN)
    await db.commit()
    st = await cb.start_batch(db, s, b.id, None, T0 + 2 * MIN, limits=L)
    await db.commit()
    assert st.run_seq == seq + 1
    assert (await nxt(db, s, b, seq, T0 + 3 * MIN)).reason == "stopped"
    p = await pre(db, s, its[0], seq, T0 + 3 * MIN)
    assert (p.allow, p.reason) == (False, "stopped") and await grants(db, s) == 0
    assert (await nxt(db, s, b, st.run_seq, T0 + 3 * MIN)).items          # yeni çalıştırma normal


async def test_next_when_feature_off_stops_running_batch(db, make_session):
    """AC-C2, C14: özellik kapalıyken next -> 200 reason=off; çalışan parti stopped(off)."""
    s, b, seq, _ = await mk_run(db, make_session, 2)
    s.allow_unsave = False
    await db.commit()
    out = await nxt(db, s, b, seq, T0 + MIN)
    assert (out.reason, out.items) == ("off", [])
    await reload(db, b)
    assert (b.status, b.last_stop_reason) == ("stopped", "off")
    out = await nxt(db, s, b, seq, T0 + 2 * MIN)                          # parti artık running değil, ama özellik kapalı
    assert out.reason == "off"


async def test_next_gate_denials_stop_batch_server_side(db, make_session):
    """AC-C14, C13: paused / quiet_hours / limit -> reason + sunucu partiyi kendisi stopped(<neden>) yapar."""
    # paused
    s, b, seq, _ = await mk_run(db, make_session, 2)
    s.cleanup_paused_until = T0 + 3 * H
    await db.commit()
    out = await nxt(db, s, b, seq, T0 + MIN)
    assert (out.reason, (await reload(db, b)).last_stop_reason, b.status) == ("paused", "paused", "stopped")
    # limit: son saatte 40 izin
    s, b, seq, its = await mk_run(db, make_session, 2)
    db.add_all([CleanupWriteGrant(session_id=s.id, item_id=its[0].id, granted_at=T0 - i * MIN) for i in range(1, 41)])
    await db.commit()
    out = await nxt(db, s, b, seq, T0 + MIN)
    assert (out.reason, (await reload(db, b)).last_stop_reason) == ("limit", "limit")


async def test_next_quiet_hours_stops_batch(db, make_session):
    start = datetime(2026, 11, 9, 21, 55, tzinfo=timezone.utc)            # İstanbul 00:55
    s, b, seq, _ = await mk_run(db, make_session, 2, now=start)
    out = await nxt(db, s, b, seq, start + 5 * MIN + 30 * SEC)             # İstanbul 01:00:30
    assert out.reason == "quiet_hours"
    assert (await reload(db, b)).last_stop_reason == "quiet_hours"


async def test_next_empty_when_nothing_pending_completes_batch(db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == b.id).values(status="done", done_at=T0))
    await db.commit()
    out = await nxt(db, s, b, seq, T0 + MIN)
    assert (out.reason, out.items) == ("empty", [])
    assert (await reload(db, b)).status == "done"


async def test_stale_detected_on_next_and_precheck(db, make_session):
    """AC-C44: T_eff aşıldıysa işlem başında stopped(stale); uykudan uyanan döngünün precheck'i allow=false/stopped (S-16)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    out = await nxt(db, s, b, seq, T0 + 601 * SEC)
    assert (out.reason, (await reload(db, b)).last_stop_reason) == ("stopped", "stale")
    s, b, seq, its = await mk_run(db, make_session, 2)
    p = await pre(db, s, its[0], seq, T0 + 601 * SEC)
    assert (p.allow, p.reason) == (False, "stopped")
    assert (await reload(db, b)).last_stop_reason == "stale" and await grants(db, s) == 0
    # sınır: tam T'de takılı değil
    s, b, seq, its = await mk_run(db, make_session, 2)
    assert (await nxt(db, s, b, seq, T0 + 600 * SEC)).items


async def test_stale_uses_max_of_saved_and_current_T(db, make_session):
    """AC-C44 (L-1, I-7): yazılı stale_after_s güncel T'den büyükse o geçerlidir."""
    s, b, seq, _ = await mk_run(db, make_session, 2)
    b.stale_after_s = 2000
    await db.commit()
    out = await nxt(db, s, b, seq, T0 + 1500 * SEC)
    assert out.items and (await reload(db, b)).status == "running"
    assert b.stale_after_s == 600                                         # her next kendi T'sini yazar
    out = await nxt(db, s, b, seq, T0 + 1500 * SEC + 601 * SEC)
    assert out.reason == "stopped" and (await reload(db, b)).last_stop_reason == "stale"


async def test_restart_after_long_stop_is_not_stale(db, make_session):
    """AC-C44 (g): 60 dk sonra Başlat; hemen ardından next parti `stale` yapmaz (start last_seen_at yazar)."""
    s, b, seq, _ = await mk_run(db, make_session, 2)
    await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + MIN)
    await db.commit()
    t1 = T0 + 70 * MIN
    st = await cb.start_batch(db, s, b.id, None, t1, limits=L)
    await db.commit()
    out = await nxt(db, s, b, st.run_seq, t1 + 2 * SEC)
    assert out.items and (await reload(db, b)).status == "running"


async def test_next_account_viewer_and_extension_guards_stop_batch(db, make_session):
    """AC-C4, C37 (servis yarısı): 409 + çalışan parti stopped(<neden>); durum kalıcıdır (hata öncesi commit)."""
    for kw, code in (({"viewer_id": "999"}, "account_mismatch"), ({"ext": "2.8.9"}, "extension_outdated"),
                     ({"ext": None}, "extension_outdated"), ({"ext": "2.9"}, None), ({"ext": "2.10.0"}, None)):
        s, b, seq, _ = await mk_run(db, make_session, 2)
        if code is None:
            assert (await nxt(db, s, b, seq, T0 + MIN, **kw)).items, kw
            continue
        e = await err(nxt(db, s, b, seq, T0 + MIN, **kw))
        assert (e.code, e.status) == (code, 409)
        await reload(db, b)
        assert (b.status, b.last_stop_reason) == ("stopped", code)
    s, b, seq, _ = await mk_run(db, make_session, 2)
    e = await err(nxt(db, s, b, seq, T0 + MIN, ext="abc"))
    assert (e.code, e.status, e.extra["fields"]) == ("invalid", 422, ["ext_version"])


async def test_viewer_unknown_when_profile_has_no_ig_id(db, make_session):
    s, b, seq, _ = await mk_run(db, make_session, 2)
    s.ig_user_id = 0
    await db.commit()
    e = await err(nxt(db, s, b, seq, T0 + MIN, viewer_id="0"))
    assert (e.code, e.status) == ("viewer_unknown", 409)
    assert (await reload(db, b)).last_stop_reason == "account_mismatch"


async def test_account_mismatch_with_old_run_seq_does_not_touch_new_run(db, make_session):
    s, b, seq, _ = await mk_run(db, make_session, 2)
    before = await untouched_batch(db, b)
    e = await err(nxt(db, s, b, seq - 1, T0 + MIN, viewer_id="999"))
    assert e.code == "account_mismatch"
    assert await untouched_batch(db, b) == before


async def test_next_refused_until_extension_updated_after_mutation_unrecognised(db, make_session):
    """AC-C57: stopped_ext_version doluyken ext ≤ ise 409 extension_update_required, öğe yok, parti yeniden
    stopped(mutation_unrecognised); eski stopped_ext_version düşmez. Yama sürümüyle (2.9.1) start ve next normal."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    p = await allowed(db, s, its[0], seq, T0 + SEC)
    out = await res(db, s, its[0], seq, "failed", T0 + 2 * SEC, note_code="mutation_unrecognised", http_status=200,
                    fields=["errors"], ext_version="2.9.0")
    assert (out.status, out.stopped) == ("pending", True)
    await reload(db, b)
    assert (b.status, b.last_stop_reason, b.stopped_ext_version) == ("stopped", "mutation_unrecognised", "2.9.0")
    e = await err(cb.start_batch(db, s, b.id, "2.9.0", T0 + 3 * SEC, limits=L))
    assert e.code == "extension_update_required"
    # arayüzü atlayan start: parti running yapılır, sonra next -> 409 + yeniden stopped, öğe yok, damga düşmez
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(status="running", last_seen_at=T0 + 3 * SEC))
    await db.commit()
    e = await err(nxt(db, s, b, seq, T0 + 4 * SEC, ext="2.9.0"))
    assert (e.code, e.status) == ("extension_update_required", 409)
    await reload(db, b)
    assert (b.status, b.last_stop_reason, b.stopped_ext_version) == ("stopped", "mutation_unrecognised", "2.9.0")
    e = await err(nxt(db, s, b, seq, T0 + 4 * SEC, ext="2.9.0"))          # stopped partide de aynı: öğe/izin yok
    assert e.code == "extension_update_required"
    assert await grants(db, s) == 1                                       # yalnız ilk precheck'in izni
    # yama sürümü
    st = await cb.start_batch(db, s, b.id, "2.9.1", T0 + 5 * SEC, limits=L)
    await db.commit()
    assert (await nxt(db, s, b, st.run_seq, T0 + 6 * SEC, ext="2.9.1")).items


async def test_next_returns_allow_collections_w_and_f(db, make_session):
    """AC-S23, S21: W -> korumasız bilinen kimlikler (sıralı liste); F -> []."""
    s, b, seq, _ = await mk_run(db, make_session, 2, collections=[(A_ID, "Aile", True), (B_ID, "Seyahat", False)])
    out = await nxt(db, s, b, seq, T0 + SEC)
    assert out.allow_collections == [B_ID]
    await db.execute(update(SavedCollection).where(SavedCollection.collection_id == B_ID).values(protected=True))
    await db.commit()
    assert (await nxt(db, s, b, seq, T0 + 2 * SEC)).allow_collections == []        # koruma her çağrıda güncel okunur
    s2, b2, seq2, _ = await mk_run(db, make_session, 2)
    assert (await nxt(db, s2, b2, seq2, T0 + SEC)).allow_collections == []


async def test_protection_context_shared_by_next_and_precheck_after_rescan(db, make_session):
    """AC-S23 (R6 M-2): yeniden taramadan sonra bile next ve precheck partinin scan_id'siyle aynı bağlamı kullanır."""
    s, b, seq, its = await mk_run(db, make_session, 2, collections=[(A_ID, "Aile", True), (B_ID, "Seyahat", False)],
                                  rows={1: {"collection_ids": [B_ID]}})
    await mk_inventory(db, s, 1, now=T0 + 2 * H, collections=[])       # yeni envanter: B görülmedi
    assert (await nxt(db, s, b, seq, T0 + SEC)).allow_collections == [B_ID]               # parti bağlamı eski tarama
    assert (await pre(db, s, its[0], seq, T0 + 2 * SEC, ids=[B_ID])).allow is True
    p = await pre(db, s, its[1], seq, T0 + 50 * SEC, ids=[A_ID])
    assert (p.allow, p.reason) == (False, "protected")


# ══ precheck (AC-C26, C47, C48, C15, S23) ═══════════════════════════════════════

async def test_precheck_allow_writes_grant_and_stamps(db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 3)
    t = T0 + 30 * SEC
    p = await pre(db, s, its[0], seq, t)
    assert (p.allow, p.item_id, p.reason, p.retry_after) == (True, its[0].id, None, None)
    await reload(db, its[0]); await reload(db, b)
    assert its[0].prechecked_at == t and b.last_allow_at == t and b.last_seen_at == t
    g = (await db.execute(select(CleanupWriteGrant))).scalars().all()
    assert [(x.session_id, x.item_id, x.granted_at) for x in g] == [(s.id, its[0].id, t)]


async def test_precheck_too_soon_boundary_and_retry_after(db, make_session):
    """AC-C48: `now − last_allow_at ≥ delay_min` (safe 20 sn) yoksa too_soon; retry_after ≥ 1 tamsayı; hata/anomali değil."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    p = await pre(db, s, its[1], seq, T0 + SEC + 12 * SEC + 400 * timedelta(milliseconds=1))
    assert (p.allow, p.reason) == (False, "too_soon") and type(p.retry_after) is int and p.retry_after == 8
    p = await pre(db, s, its[1], seq, T0 + SEC + 20 * SEC - timedelta(milliseconds=1))
    assert (p.allow, p.reason, p.retry_after) == (False, "too_soon", 1)
    assert (await reload(db, b)).status == "running" and await grants(db, s) == 1
    assert (await pre(db, s, its[1], seq, T0 + SEC + 20 * SEC)).allow is True              # sınır dahil
    assert await grants(db, s) == 2
    assert not await notifs(db, s, "cleanup_anomaly")


async def test_precheck_not_pending_for_cancelled_and_terminal_items(db, make_session):
    """AC-C15: iptal edilmiş öğe -> allow=false reason=not_pending; izin yok; parti durumu değişmez."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    await res(db, s, its[0], seq, "done", T0 + 2 * SEC)
    p = await pre(db, s, its[0], seq, T0 + 30 * SEC)
    assert (p.allow, p.reason) == (False, "not_pending")
    await cb.cancel_batch(db, s, b.id, T0 + 31 * SEC, limits=L)
    await db.commit()
    p = await pre(db, s, its[1], seq, T0 + 60 * SEC)
    assert (p.allow, p.reason) == (False, "not_pending") and await grants(db, s) == 1


async def test_user_stop_blocks_next_precheck_without_extension(db, make_session):
    """AC-C40, C47: stop dönen yanıttan sonra gelen her precheck allow=false (reason=stopped)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + SEC)
    await db.commit()
    p = await pre(db, s, its[0], seq, T0 + 2 * SEC)
    assert (p.allow, p.reason) == (False, "stopped") and await grants(db, s) == 0
    assert (await nxt(db, s, b, seq, T0 + 2 * SEC)).reason == "stopped"


async def test_precheck_takes_the_profile_row_lock(db, make_session, monkeypatch):
    """AC-C47: precheck, stop ve cancel ile aynı profil satırı kilidini (lock_session) alır."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    calls = []
    real = ex.lock_session

    async def spy(d, sess):
        calls.append(sess.id)
        return await real(d, sess)

    monkeypatch.setattr(ex, "lock_session", spy)
    await pre(db, s, its[0], seq, T0 + SEC)
    await nxt(db, s, b, seq, T0 + 2 * SEC)
    await res(db, s, its[0], seq, "done", T0 + 3 * SEC)
    assert calls == [s.id, s.id, s.id]


async def test_precheck_gate_denials_stop_batch_server_side(db, make_session):
    """AC-C14 (R3 High 1): off / paused / limit / quiet_hours -> allow=false + sunucu partiyi stopped(<neden>) yapar."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    s.allow_unsave = False
    await db.commit()
    p = await pre(db, s, its[0], seq, T0 + SEC)
    assert (p.allow, p.reason) == (False, "off") and (await reload(db, b)).last_stop_reason == "off"
    assert await grants(db, s) == 0

    s, b, seq, its = await mk_run(db, make_session, 2)
    s.cleanup_paused_until = T0 + 2 * H
    await db.commit()
    p = await pre(db, s, its[0], seq, T0 + SEC)
    assert (p.allow, p.reason, (await reload(db, b)).last_stop_reason) == (False, "paused", "paused")

    s, b, seq, its = await mk_run(db, make_session, 2)
    db.add_all([CleanupWriteGrant(session_id=s.id, item_id=its[0].id, granted_at=T0 - i * MIN) for i in range(1, 41)])
    await db.commit()
    p = await pre(db, s, its[0], seq, T0 + SEC)
    assert (p.allow, p.reason, (await reload(db, b)).last_stop_reason) == (False, "limit", "limit")

    start = datetime(2026, 11, 9, 21, 55, tzinfo=timezone.utc)
    s, b, seq, its = await mk_run(db, make_session, 2, now=start)
    p = await pre(db, s, its[0], seq, start + 5 * MIN + 30 * SEC)
    assert (p.allow, p.reason, (await reload(db, b)).last_stop_reason) == (False, "quiet_hours", "quiet_hours")


async def test_failed_writes_count_toward_budget(db, make_session):
    """AC-C26 (R7 M5): hourly=3 iken üç öğe allow alır ve üçü de failed (yeniden denenebilir) döner; dördüncü precheck
    limit. Gerçek yazma sayısı tavanı aşamaz."""
    lim = mk_limits(**{"profiles.safe.unsave.hourly": 3})
    s, b, seq, its = await mk_run(db, make_session, 5, limits=lim)
    for k in range(3):
        t = T0 + (k + 1) * 30 * SEC
        await allowed(db, s, its[k], seq, t, limits=lim)
        out = await res(db, s, its[k], seq, "failed", t + 5 * SEC, note_code="network", limits=lim)
        assert (out.status, out.retry, out.stopped) == ("pending", True, False)
    p = await pre(db, s, its[0], seq, T0 + 4 * 30 * SEC, limits=lim)          # yeniden deneme de izin ister
    assert (p.allow, p.reason) == (False, "limit")
    assert await grants(db, s) == 3
    assert (await reload(db, b)).last_stop_reason == "limit"


async def test_concurrent_prechecks_share_last_slot_once(db, db_engine, make_session):
    """AC-C26: iki eşzamanlı precheck son boş yeri paylaşamaz; biri allow, diğeri limit (profil satırı FOR UPDATE)."""
    lim = mk_limits(**{"profiles.safe.unsave.hourly": 1})
    s, b, seq, its = await mk_run(db, make_session, 3, limits=lim)
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def second():
        async with maker() as d2:
            s2 = await d2.get(Session, s.id)
            out = await ex.precheck(d2, s2, its[1].id, viewer(s), EXT, seq, [], T0 + 40 * SEC, limits=lim)
            await d2.commit()
            return out

    async with maker() as d1:
        s1 = await d1.get(Session, s.id)
        first = await ex.precheck(d1, s1, its[0].id, viewer(s), EXT, seq, [], T0 + 30 * SEC, limits=lim)
        task = asyncio.create_task(second())
        await asyncio.sleep(1.0)                                              # ikincinin profil kilidinde beklemesi için
        assert not task.done()
        await d1.commit()
        other = await asyncio.wait_for(task, 20)
    assert first.allow is True
    assert (other.allow, other.reason) == (False, "limit")
    assert await grants(db, s) == 1


async def test_precheck_collection_ids_validation(db, make_session):
    """§7.8: collection_ids zorunlu, ≤ 20, her biri ^\\d{1,25}$; bozuk gövde 422 (eklenti hatası)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    for bad in (None, "123", [5], ["abc"], ["1" * 26], [str(i) for i in range(21)], {"a": 1}, [""], ["12", None]):
        e = await err(ex.precheck(db, s, its[0].id, viewer(s), EXT, seq, bad, T0 + SEC, limits=L))
        assert (e.code, e.status, e.extra["fields"]) == ("invalid", 422, ["collection_ids"]), bad
    assert await grants(db, s) == 0
    assert (await pre(db, s, its[0], seq, T0 + SEC, ids=[str(i) for i in range(20)])).reason == "protected"   # F


async def test_precheck_reapplies_protection_under_lock_w(db, make_session):
    """AC-S23 (W): çalışan iş sırasında B korumaya alınır; B'deki sıradaki öğenin precheck'i reason=protected;
    izin/damga yok; öğe pending kalır."""
    s, b, seq, its = await mk_run(db, make_session, 3, collections=[(A_ID, "Aile", True), (B_ID, "Seyahat", False)],
                                  rows={1: {"collection_ids": [B_ID]}, 2: {"collection_ids": [B_ID]},
                                        3: {"collection_ids": []}})
    assert len(its) == 3
    await allowed(db, s, its[0], seq, T0 + SEC, ids=[B_ID])               # B korumasızken izin
    await db.execute(update(SavedCollection).where(SavedCollection.collection_id == B_ID).values(protected=True))
    await db.commit()
    before = (await reload(db, b)).last_allow_at
    p = await pre(db, s, its[1], seq, T0 + 40 * SEC, ids=[B_ID])
    assert (p.allow, p.reason, p.retry_after) == (False, "protected", None)
    await reload(db, its[1]); await reload(db, b)
    assert its[1].status == "pending" and its[1].prechecked_at is None and b.last_allow_at == before
    assert b.status == "running" and await grants(db, s) == 1
    assert (await pre(db, s, its[2], seq, T0 + 40 * SEC, ids=[])).allow is True       # koleksiyonsuz öğe devam eder
    p = await pre(db, s, its[1], seq, T0 + 80 * SEC, ids=[X_ID])                        # bilinmeyen kimlik: fail-closed
    assert (p.allow, p.reason) == (False, "protected")
    p = await pre(db, s, its[1], seq, T0 + 80 * SEC, ids=[B_ID, A_ID])
    assert (p.allow, p.reason) == (False, "protected")


async def test_precheck_reapplies_in_f_mode(db, make_session):
    """AC-S23 (R6 H-3): F modunda allow=∅; boş olmayan her dizi korunur, boş dizi geçer."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    p = await pre(db, s, its[0], seq, T0 + SEC, ids=[B_ID])
    assert (p.allow, p.reason) == (False, "protected")
    assert (await pre(db, s, its[0], seq, T0 + 2 * SEC, ids=[])).allow is True
    # tarama satırı silinmiş partide de F
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(scan_id=None))
    await db.commit()
    p = await pre(db, s, its[1], seq, T0 + 40 * SEC, ids=[B_ID])
    assert (p.allow, p.reason) == (False, "protected")


async def test_protected_precheck_does_not_consume_budget_or_gap(db, make_session):
    """Korunan öğe için istenen bir precheck, ardından gelen gerçek yazmayı too_soon'a düşürmez."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    p = await pre(db, s, its[1], seq, T0 + 25 * SEC, ids=[A_ID])
    assert p.reason == "protected"
    assert (await reload(db, b)).last_allow_at == T0 + SEC
    assert (await pre(db, s, its[2], seq, T0 + 26 * SEC)).allow is True


# ══ result: durum makinesi, denetim, hata sınıfları (AC-C17, C19, C23, C52, S16) ═══

async def test_result_done_after_precheck(db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    await allowed(db, s, its[0], seq, T0 + SEC)
    out = await res(db, s, its[0], seq, "done", T0 + 5 * SEC)
    assert (out.ok, out.status, out.retry, out.stopped, out.paused_until) == (True, "done", False, False, None)
    await reload(db, its[0]); await reload(db, b)
    assert its[0].status == "done" and its[0].done_at == T0 + 5 * SEC and its[0].attempts == 0
    assert b.last_progress_at == T0 + 5 * SEC and b.last_seen_at == T0 + 5 * SEC and b.status == "running"
    rows = await alog(db, s)
    assert [(r.status, r.target_ref, r.target_label, r.ig_user_id, r.error_msg) for r in rows] == [
        ("success", ref(1), its[0].label, None, None)]
    assert not await notifs(db, s, "cleanup_anomaly")


async def test_result_done_without_precheck_is_recorded_with_anomaly(db, make_session):
    """AC-C23: prechecked_at hiç dolmamış öğeye done gelirse öğe done olur ve cleanup_anomaly(precheck_missing) yazılır."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    out = await res(db, s, its[0], seq, "done", T0 + SEC)
    assert out.status == "done"
    an = await notifs(db, s, "cleanup_anomaly")
    assert [n.params["note_code"] for n in an] == ["precheck_missing"]


@pytest.mark.parametrize("outcome,note,status", [
    ("already", None, "already"), ("not_found", None, "not_found"), ("protected", "in_collection", "protected")])
async def test_result_without_write_needs_no_precheck_and_is_not_anomaly(db, make_session, outcome, note, status):
    """AC-C52: already / not_found / protected precheck'siz bildirilir; anomali yazılmaz; action_log skipped."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    out = await res(db, s, its[0], seq, outcome, T0 + SEC, note_code=note, http_status=200 if outcome == "already" else None)
    assert (out.status, out.stopped) == (status, False)
    await reload(db, its[0])
    assert its[0].status == status and its[0].prechecked_at is None and its[0].done_at == T0 + SEC
    assert not await notifs(db, s, "cleanup_anomaly")
    assert await grants(db, s) == 0
    row = (await alog(db, s))[0]
    assert (row.status, row.target_ref, row.error_msg) == ("skipped", ref(1), note or outcome)


async def test_protected_result_requires_in_collection_and_is_terminal(db, make_session):
    """AC-S16, spec §7.8: protected yalnız note_code='in_collection' ile; terminaldir; ikinci bildirim değiştirmez."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    for bad in (None, "already", "exception"):
        e = await err(ex.report_result(db, s, its[0].id, viewer(s), seq, "protected", T0 + SEC, note_code=bad, limits=L))
        assert (e.code, e.status, e.extra["fields"]) == ("invalid", 422, ["note_code"])
    await res(db, s, its[0], seq, "protected", T0 + SEC, note_code="in_collection")
    out = await res(db, s, its[0], seq, "done", T0 + 2 * SEC)
    assert (out.ok, out.status) == (True, "protected")
    assert (await reload(db, its[0])).status == "protected" and len(await alog(db, s)) == 1


async def test_every_outcome_is_audited(db, make_session):
    """AC-C17: done, already, not_found, protected, failed, cancelled -> action_log(action_type=unsave, target_ref,
    target_label); ig_user_id null; error_msg yalnız note_code."""
    s, b, seq, its = await mk_run(db, make_session, 7)
    await allowed(db, s, its[0], seq, T0 + SEC)
    await res(db, s, its[0], seq, "done", T0 + 2 * SEC)
    await res(db, s, its[1], seq, "already", T0 + 3 * SEC)
    await res(db, s, its[2], seq, "not_found", T0 + 4 * SEC, http_status=404)
    await res(db, s, its[3], seq, "protected", T0 + 5 * SEC, note_code="in_collection")
    await res(db, s, its[4], seq, "failed", T0 + 6 * SEC, note_code="http_error", http_status=403)
    await cb.cancel_batch(db, s, b.id, T0 + 7 * SEC, limits=L)
    await db.commit()
    rows = await alog(db, s)
    got = {r.target_ref: (r.status, r.error_msg) for r in rows}
    assert got == {ref(1): ("success", None), ref(2): ("skipped", "already"), ref(3): ("skipped", "not_found"),
                   ref(4): ("skipped", "in_collection"), ref(5): ("failed", "http_error"),
                   ref(6): ("cancelled", None), ref(7): ("cancelled", None)}
    assert all(r.action_type == "unsave" and r.ig_user_id is None and r.target_label for r in rows)
    assert await grants(db, s) == 1


async def test_error_classes_retry_permanent_and_double_report(db, make_session):
    """AC-C19: yeniden denenebilir -> attempts+1, pending, prechecked_at=null, retry; 3. denemede failed. Kalıcı -> failed.
    Aynı öğe için ikinci bildirim durumu değiştirmez."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    t = T0
    for k in range(1, 4):
        t += 30 * SEC
        await allowed(db, s, its[0], seq, t)
        out = await res(db, s, its[0], seq, "failed", t + 2 * SEC, note_code="verify_failed")
        await reload(db, its[0])
        if k < 3:
            assert (out.status, out.retry, its[0].attempts, its[0].prechecked_at) == ("pending", True, k, None)
        else:
            assert (out.status, out.retry, its[0].attempts) == ("failed", False, 3)
    assert (await reload(db, b)).status == "running"                      # yeniden denenebilir hata partiyi durdurmaz
    out = await res(db, s, its[0], seq, "done", t + 5 * SEC)               # çift bildirim
    assert (out.ok, out.status) == (True, "failed") and (await reload(db, its[0])).status == "failed"
    out = await res(db, s, its[1], seq, "failed", t + 6 * SEC, note_code="http_error", http_status=403)
    assert (out.status, out.retry) == ("failed", False)                    # kalıcı: tekrar denenmez
    await reload(db, its[1])
    assert (its[1].attempts, its[1].http_status, its[1].note_code) == (0, 403, "http_error")
    assert [r.status for r in await alog(db, s)] == ["failed", "failed"]   # yalnız terminal sonuçlar denetime yazılır


async def test_http_404_failure_is_not_found(db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    out = await res(db, s, its[0], seq, "failed", T0 + SEC, note_code="http_error", http_status=410)
    assert out.status == "not_found" and (await alog(db, s))[0].status == "skipped"


@pytest.mark.parametrize("note,http,reason", [
    ("login_required", 401, "login_required"), ("tokens_missing", None, "tokens_missing"),
    ("account_mismatch", None, "account_mismatch"), ("rate_limited", 429, "rate_limited"),
    ("http_error", 429, "rate_limited"), ("mutation_unrecognised", 200, "mutation_unrecognised")])
async def test_job_stopping_class_keeps_item_pending_and_stops_batch(db, make_session, note, http, reason):
    """AC-C19, S17: iş durduran sınıf -> deneme sayılmaz, öğe pending, prechecked_at=null, parti stopped(<neden>),
    stopped=true; denetim satırı yok (terminal değil)."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    out = await res(db, s, its[0], seq, "failed", T0 + 2 * SEC, note_code=note, http_status=http)
    assert (out.ok, out.status, out.retry, out.stopped) == (True, "pending", False, True)
    await reload(db, its[0]); await reload(db, b)
    assert (its[0].status, its[0].attempts, its[0].prechecked_at) == ("pending", 0, None)
    assert (b.status, b.last_stop_reason) == ("stopped", reason)
    assert await alog(db, s) == []
    # sonraki next/precheck: parti durmuş
    assert (await nxt(db, s, b, seq, T0 + 3 * SEC)).reason == "stopped"


async def test_429_stops_batch_without_pause(db, make_session):
    """AC-C46: 429 -> failed + rate_limited, iş durduran; paused_until ve cleanup_paused_until DEĞİŞMEZ; 24 sa duraklatma yok."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await allowed(db, s, its[0], seq, T0 + SEC)
    out = await res(db, s, its[0], seq, "failed", T0 + 2 * SEC, note_code="rate_limited", http_status=429)
    assert out.stopped is True and out.paused_until is None
    await reload(db, s); await reload(db, b)
    assert s.paused_until is None and s.cleanup_paused_until is None and s.paused_reason is None
    assert (b.status, b.last_stop_reason) == ("stopped", "rate_limited")
    assert not await notifs(db, s, "actions_blocked")
    # tekrar Başlat: kapı paused demez
    st = await cb.start_batch(db, s, b.id, None, T0 + 3 * SEC, limits=L)
    assert st.status == "running"


async def test_block_pauses_everything_and_server_stops_batch(db, make_session):
    """AC-C13: blocked -> cleanup_paused_until ve paused_until = now+24 sa; neden 'Köprü:' ile başlamaz; actions_blocked
    bildirimi; öğe pending; parti aynı işlemde stopped(blocked); sonraki kapı paused."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    t = T0 + 2 * SEC
    out = await res(db, s, its[0], seq, "blocked", t, note_code="blocked", http_status=400)
    assert (out.status, out.stopped) == ("pending", True) and out.paused_until == t + DAY
    await reload(db, s); await reload(db, b); await reload(db, its[0])
    assert s.cleanup_paused_until == t + DAY and s.paused_until == t + DAY
    assert s.paused_reason == "Ek iş: Instagram işlemi engelledi" and not s.paused_reason.startswith("Köprü:")
    assert s.cleanup_paused_reason == "blocked"
    assert (b.status, b.last_stop_reason) == ("stopped", "blocked")
    assert (its[0].status, its[0].attempts, its[0].prechecked_at) == ("pending", 0, None)
    n = await notifs(db, s, "actions_blocked")
    assert len(n) == 1 and n[0].level == "error" and all(type(v) is int for v in n[0].params.values())
    e = await err(cb.start_batch(db, s, b.id, None, t + MIN, limits=L))
    assert (e.code, e.extra["reason"]) == ("not_now", "paused")


async def test_block_report_from_old_run_still_pauses_but_leaves_new_batch_state(db, make_session):
    """Güvenlik: eski run_seq'li blocked bildirimi yine de 24 sa duraklatır (hesap düzeyi), partiye dokunmaz (L-c)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    before = await untouched_batch(db, b)
    out = await res(db, s, its[0], seq - 1, "blocked", T0 + SEC, note_code="blocked")
    assert out.stopped is True
    await reload(db, s)
    assert s.cleanup_paused_until == T0 + SEC + DAY
    assert await untouched_batch(db, b) == before


async def test_result_for_cancelled_item_recent_precheck_becomes_done(db, make_session):
    """AC-C23: cancelled öğeye done, prechecked_at son 120 sn içindeyse done (action_log + bütçe). Eski: değişmez + late_result."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    await allowed(db, s, its[1], seq, T0 + 30 * SEC)
    await cb.cancel_batch(db, s, b.id, T0 + 40 * SEC, limits=L)
    await db.commit()
    out = await res(db, s, its[1], seq, "done", T0 + 30 * SEC + 120 * SEC)         # tam 120 sn: dahil
    assert (out.status, out.stopped) == ("done", True)
    assert (await reload(db, its[1])).status == "done" and its[1].done_at == T0 + 150 * SEC
    assert [r.status for r in await alog(db, s)].count("success") == 1
    assert await grants(db, s) == 2                                            # bütçe sayımı izin satırlarında kalır
    assert not await notifs(db, s, "cleanup_anomaly")
    out = await res(db, s, its[0], seq, "done", T0 + SEC + 121 * SEC)           # 121 sn: geç
    assert out.status == "cancelled" and (await reload(db, its[0])).status == "cancelled"
    assert [n.params["note_code"] for n in await notifs(db, s, "cleanup_anomaly")] == ["late_result"]
    out = await res(db, s, its[2], seq, "already", T0 + 200 * SEC)              # cancelled + başka sonuç: değişmez
    assert out.status == "cancelled"


async def test_result_on_stopped_or_old_run_seq_returns_stopped_true(db, make_session):
    """AC-C49 (M-a, L-c): uyuşmazlık sonucun kaydını engellemez; yanıt stopped=true; anomali; partiye dokunulmaz."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    await allowed(db, s, its[0], seq, T0 + SEC)
    before = await untouched_batch(db, b)
    out = await res(db, s, its[0], seq - 1, "done", T0 + 2 * SEC)
    assert (out.status, out.stopped) == ("done", True)                          # kayıt korundu
    assert [n.params["note_code"] for n in await notifs(db, s, "cleanup_anomaly")] == ["run_seq_mismatch"]
    assert await untouched_batch(db, b) == before
    # durmuş parti
    await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + 3 * SEC)
    await db.commit()
    out = await res(db, s, its[1], seq, "already", T0 + 4 * SEC)
    assert (out.status, out.stopped) == ("already", True)
    assert (await reload(db, b)).last_stop_reason == "user_stop"                # ilk neden korunur


async def test_last_pending_terminal_completes_running_and_stopped_batches(db, make_session):
    """AC-C50: running/stopped partide son pending terminale geçince parti done (yanıt stopped=false: next → empty)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await res(db, s, its[0], seq, "already", T0 + SEC)
    out = await res(db, s, its[1], seq, "not_found", T0 + 2 * SEC)
    assert out.stopped is False
    await reload(db, b)
    assert b.status == "done" and b.finished_at == T0 + 2 * SEC
    assert (await nxt(db, s, b, seq, T0 + 3 * SEC)).reason == "empty"
    # stopped partide
    s, b, seq, its = await mk_run(db, make_session, 2)
    await res(db, s, its[0], seq, "already", T0 + SEC)
    await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + 2 * SEC)
    await db.commit()
    out = await res(db, s, its[1], seq, "already", T0 + 3 * SEC)
    assert out.stopped is True and (await reload(db, b)).status == "done"


async def test_circuit_breaker_stop_from_extension_stops_batch(db, make_session):
    """AC-C16 (sunucu yarısı): eklentinin stop(circuit_breaker, run_seq, viewer_id) çağrısı partiyi stopped yapar;
    kapının reddettiği öğeler ve too_soon hata sayacını etkilemez (sayaç eklentidedir)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    out = await cb.stop_batch(db, s, b.id, {"reason": "circuit_breaker", "run_seq": seq, "viewer_id": viewer(s)}, T0 + 9 * SEC)
    await db.commit()
    assert (out.status, out.last_stop_reason, out.applied) == ("stopped", "circuit_breaker", True)


async def test_read_budget_stops_batch_and_returns_stopped_true(db, make_session):
    """AC-C53: status_per_hour=3 iken art arda üç already -> üçüncü result stopped=true, parti stopped(read_limit);
    dördüncü okuma yapılmaz (next -> stopped)."""
    lim = mk_limits(**{"reads.status_per_hour": 3})
    s, b, seq, its = await mk_run(db, make_session, 5, limits=lim)
    outs = [await res(db, s, its[k], seq, "already", T0 + (k + 1) * 4 * SEC, limits=lim) for k in range(3)]
    assert [o.stopped for o in outs] == [False, False, True]
    await reload(db, b)
    assert (b.status, b.last_stop_reason) == ("stopped", "read_limit")
    assert (await nxt(db, s, b, seq, T0 + 20 * SEC, limits=lim)).reason == "stopped"


async def test_protected_counts_in_read_budget(db, make_session):
    """AC-C53 (v1.6, L-13): protected (precheck'siz ve precheck sonrası) okuma bütçesine sayılır; not_found da."""
    lim = mk_limits(**{"reads.status_per_hour": 3})
    s, b, seq, its = await mk_run(db, make_session, 5, limits=lim)
    await res(db, s, its[0], seq, "protected", T0 + 4 * SEC, note_code="in_collection", limits=lim)
    p = await pre(db, s, its[1], seq, T0 + 8 * SEC, ids=[A_ID], limits=lim)
    assert p.reason == "protected"
    await res(db, s, its[1], seq, "protected", T0 + 9 * SEC, note_code="in_collection", limits=lim)
    out = await res(db, s, its[2], seq, "not_found", T0 + 12 * SEC, limits=lim)
    assert out.stopped is True and (await reload(db, b)).last_stop_reason == "read_limit"


async def test_next_read_budget_window_and_next_at(db, make_session):
    """AC-C53: next, okuma bütçesi doluyken reason=limit + stopped(read_limit); pencere kayar (60 dk dahil değil);
    write (done) okuma sayılmaz."""
    lim = mk_limits(**{"reads.status_per_hour": 3})
    s, b, seq, its = await mk_run(db, make_session, 6, limits=lim)
    old = await mk_old_batch(db, s)
    stamps = [T0 + 10 * SEC, T0 + 20 * SEC, T0 + 30 * SEC]
    for st, ts in zip(("already", "not_found", "protected"), stamps):
        db.add(CleanupItem(session_id=s.id, batch_id=old.id, ref=f"9{ts.second}", label="x", status=st, done_at=ts,
                           created_at=T0))
    db.add(CleanupItem(session_id=s.id, batch_id=old.id, ref="99", label="x", status="done", done_at=T0 + 5 * SEC,
                       created_at=T0))
    await db.commit()
    rb = await ex.read_budget(db, s, T0 + 40 * SEC, limits=lim)
    assert (rb.used, rb.cap, rb.room, rb.next_at) == (3, 3, 0, T0 + 10 * SEC + H)
    out = await nxt(db, s, b, seq, T0 + 40 * SEC, limits=lim)
    assert (out.reason, out.items) == ("limit", [])
    assert (await reload(db, b)).last_stop_reason == "read_limit"
    rb = await ex.read_budget(db, s, T0 + 10 * SEC + H, limits=lim)              # en eski düştü: tam 60 dk dışarıda
    assert (rb.used, rb.room, rb.next_at) == (2, 1, None)
    st = await cb.start_batch(db, s, b.id, None, T0 + 10 * SEC + H, limits=lim)
    await db.commit()
    assert (await nxt(db, s, b, st.run_seq, T0 + 10 * SEC + H + SEC, limits=lim)).items


async def mk_old_batch(db, s):
    b = CleanupBatch(session_id=s.id, kind="saved", status="done", max_items_at_preview=500, expires_at=T0 - DAY)
    db.add(b)
    await db.flush()
    return b


async def test_result_when_feature_off_is_still_accepted(db, make_session):
    """AC-C2: özellik kapalıyken result kabul edilir."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await allowed(db, s, its[0], seq, T0 + SEC)
    s.allow_unsave = False
    await db.commit()
    out = await res(db, s, its[0], seq, "done", T0 + 2 * SEC)
    assert out.status == "done"


async def test_result_viewer_mismatch_keeps_item_pending_writes_anomaly_and_stops(db, make_session):
    """AC-C4: result reddedilirse öğe pending kalır, cleanup_anomaly yazılır; çalışan parti stopped(account_mismatch)."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    await allowed(db, s, its[0], seq, T0 + SEC)
    e = await err(ex.report_result(db, s, its[0].id, "999", seq, "done", T0 + 2 * SEC, limits=L))
    assert (e.code, e.status) == ("account_mismatch", 409)
    assert (await reload(db, its[0])).status == "pending"
    assert [n.params["note_code"] for n in await notifs(db, s, "cleanup_anomaly")] == ["account_mismatch"]
    assert (await reload(db, b)).last_stop_reason == "account_mismatch"


async def test_result_validation_rejects_free_text_and_bad_shapes(db, make_session):
    """AC-C28: serbest metin 422; yalnız izinli note_code, http_status ve fields[]."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    base = dict(limits=L)
    cases = [
        ("failed", dict(note_code="Instagram said: try again later"), "note_code"),
        ("failed", dict(note_code="x" * 31), "note_code"),
        ("failed", dict(note_code=5), "note_code"),
        ("done", dict(http_status=99), "http_status"),
        ("done", dict(http_status=True), "http_status"),
        ("done", dict(http_status="200"), "http_status"),
        ("failed", dict(note_code="network", fields=["ok"] * 11), "fields"),
        ("failed", dict(note_code="network", fields=["Bad Name"]), "fields"),
        ("failed", dict(note_code="network", fields="errors"), "fields"),
        ("failed", dict(note_code="network", fields=[5]), "fields"),
        ("exploded", dict(), "outcome"),
        (None, dict(), "outcome"),
    ]
    for outcome, kw, field in cases:
        e = await err(ex.report_result(db, s, its[0].id, viewer(s), seq, outcome, T0 + SEC, **kw, **base))
        assert (e.code, e.status, e.extra["fields"]) == ("invalid", 422, [field]), (outcome, kw)
    for bad_seq in (True, -1, "1", None):
        e = await err(ex.report_result(db, s, its[0].id, viewer(s), bad_seq, "done", T0 + SEC, limits=L))
        assert e.extra["fields"] == ["run_seq"]
    e = await err(ex.report_result(db, s, its[0].id, "abc", seq, "done", T0 + SEC, limits=L))
    assert e.extra["fields"] == ["viewer_id"]
    assert (await reload(db, its[0])).status == "pending"
    ok = await res(db, s, its[0], seq, "failed", T0 + SEC, note_code="network", fields=["data", "extensions"],
                   http_status=200)
    assert ok.retry is True and (await reload(db, its[0])).fields == ["data", "extensions"]


async def test_cross_profile_ids_are_404(db, make_session):
    """AC-C27: başka profilin item/batch id'si -> 404 not_found; hiçbir satır değişmez."""
    s, b, seq, its = await mk_run(db, make_session, 2)
    other = await mk_profile(make_session, username="other")
    for coro in (ex.next_items(db, other, b.id, seq, viewer(other), EXT, 5, T0 + SEC, limits=L),
                 ex.precheck(db, other, its[0].id, viewer(other), EXT, seq, [], T0 + SEC, limits=L),
                 ex.report_result(db, other, its[0].id, viewer(other), seq, "done", T0 + SEC, limits=L)):
        e = await err(coro)
        assert (e.code, e.status) == ("not_found", 404)
    assert (await reload(db, its[0])).status == "pending" and await grants(db, s) == 0
    assert (await reload(db, b)).status == "running"
    for bad in ("1", None, True, 1.5):
        assert (await err(ex.next_items(db, s, bad, seq, viewer(s), EXT, 5, T0, limits=L))).code == "not_found"
        assert (await err(ex.precheck(db, s, bad, viewer(s), EXT, seq, [], T0, limits=L))).code == "not_found"


async def test_hot_paths_do_not_delete(db, make_session):
    """AC-C32: next, precheck ve result hiçbir silme sorgusu çalıştırmaz."""
    s, b, seq, its = await mk_run(db, make_session, 3)
    stmts = []

    def spy(conn, cursor, statement, params, context, executemany):
        stmts.append(statement)

    eng = db.get_bind().sync_engine if hasattr(db.get_bind(), "sync_engine") else db.get_bind()
    event.listen(eng, "before_cursor_execute", spy)
    try:
        await nxt(db, s, b, seq, T0 + SEC)
        await pre(db, s, its[0], seq, T0 + 2 * SEC)
        await res(db, s, its[0], seq, "done", T0 + 3 * SEC)
        await res(db, s, its[1], seq, "already", T0 + 4 * SEC)
    finally:
        event.remove(eng, "before_cursor_execute", spy)
    assert stmts and not [x for x in stmts if x.lstrip().upper().startswith("DELETE")]


async def test_halt_running_batch_helper(db, make_session):
    s, b, seq, _ = await mk_run(db, make_session, 2)
    assert await ex.halt_running_batch(db, s, "account_mismatch", T0 + SEC) is True
    await db.commit()
    assert (await reload(db, b)).last_stop_reason == "account_mismatch"
    assert await ex.halt_running_batch(db, s, "limit", T0 + 2 * SEC) is False            # çalışan yok
    assert (await reload(db, b)).last_stop_reason == "account_mismatch"                   # ilk neden korunur


# ══ Açma/kapama denetimi (AC-C35) ═══════════════════════════════════════════════

async def test_toggle_is_audited_and_requires_ack(db, make_session):
    s = await make_session(username="t")
    e = await err(ex.set_saved_enabled(db, s, True, None, T0))
    assert (e.code, e.status) == ("ack_required", 422)
    e = await err(ex.set_saved_enabled(db, s, True, False, T0))
    assert e.code == "ack_required"
    e = await err(ex.set_saved_enabled(db, s, "yes", True, T0))
    assert (e.code, e.extra["fields"]) == ("invalid", ["saved_enabled"])
    assert s.allow_unsave is False
    assert not (await db.execute(select(ActionLog).where(ActionLog.action_type == "cleanup_setting"))).scalars().all()
    out = await ex.set_saved_enabled(db, s, True, True, T0)
    await db.commit()
    assert (out.enabled, out.enabled_at, out.changed) == (True, T0, True)
    await ex.set_saved_enabled(db, s, True, True, T0 + MIN)                             # aynı durum: yeni satır yok
    out = await ex.set_saved_enabled(db, s, False, None, T0 + 2 * MIN)                  # kapatmak onay istemez
    await db.commit()
    assert (out.enabled, out.changed) == (False, True)
    assert s.allow_unsave is False and s.unsave_enabled_at == T0                         # kapatınca açılış zamanı korunur
    out = await ex.set_saved_enabled(db, s, True, True, T0 + 3 * MIN)                   # yeniden açma ısınmayı sıfırlar
    await db.commit()
    assert s.unsave_enabled_at == T0 + 3 * MIN
    rows = list((await db.execute(select(ActionLog).where(ActionLog.session_id == s.id,
                                  ActionLog.action_type == "cleanup_setting").order_by(ActionLog.id))).scalars())
    assert [(r.status, r.target_ref, r.target_label, r.ig_user_id) for r in rows] == [
        ("success", "saved", "enabled", None), ("success", "saved", "disabled", None),
        ("success", "saved", "enabled", None)]


# ══ expire_drafts bağlantısı (T-4b notu) ════════════════════════════════════════

async def test_cleanup_stale_task_also_expires_drafts_without_changing_its_result_shape(db_engine, db, make_session,
                                                                                         monkeypatch):
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    from app.tasks import cleanup_tasks
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 2, now=datetime.now(timezone.utc) - 2 * H)
    old = datetime.now(timezone.utc) - H
    r = await cb.preview(db, s, {"scan_id": scan.id, "select": "refs", "refs": [ref(1)]}, old, limits=L)
    await db.commit()
    monkeypatch.setattr(cleanup_tasks, "make_engine", lambda: create_async_engine(db_engine.url, poolclass=NullPool))
    out = await asyncio.to_thread(cleanup_tasks.cleanup_stale.run)
    assert out == {"batches_stopped": 0, "scans_failed": 0}
    b = await db.get(CleanupBatch, r.batch_id)
    await db.refresh(b)
    assert b.status == "expired"
