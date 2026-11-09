"""SPEC-001 T-4a: tarama, envanter, filtre ve koleksiyon alımı (servis katmanı; router T-5).

AC: S1, S2, S5, S8, S13..S16, S18, S19, C22 ve [W] S20. Spec §9 bu testleri `test_cleanup.py` adıyla listeler
(uç nokta düzeyi, T-5/T-6); burada aynı davranış servis düzeyinde, aynı test adlarıyla pinlenir.
Sahte saat: `now` parametresi; gerçek bekleme yok.
"""
from datetime import datetime, timedelta, timezone
from types import MappingProxyType

import pytest
from sqlalchemy import func, select

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, SavedCollection, SavedTarget,
)
from app.services import cleanup_limits as cl
from app.services import cleanup_scan as sc
from app.services.cleanup_scan import CleanupError

pytestmark = pytest.mark.asyncio

T0 = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)
MIN = timedelta(minutes=1)


def mk_limits(**ov):
    values = dict(cl.DEFAULTS)
    values.update(ov)
    return cl.Limits(MappingProxyType(values), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


L = mk_limits()


def item(i, **kw):
    d = {"media_id": str(3500000000000000000 + i), "shortcode": f"Cabc{i:06d}"}
    d.update(kw)
    return d


async def err(coro):
    with pytest.raises(CleanupError) as e:
        await coro
    return e.value


async def run_scan(db, s, items, now, outcome="ok", collections=None, limits=L):
    st = await sc.start_scan(db, s, now, limits=limits)
    if collections is not None:
        await sc.add_collections(db, s, st.scan_id, collections, now)
    await sc.add_page(db, s, st.scan_id, 1, items, now, limits=limits)
    if outcome:
        await sc.finish_scan(db, s, st.scan_id, outcome, None, now)
    await db.commit()
    return st.scan_id


def colls(*pairs):
    return {"available": True, "collections": [{"collection_id": i, "name": n} for i, n in pairs]}


@pytest.fixture
def w_mode(monkeypatch):
    monkeypatch.setattr(sc, "COLLECTION_CHOICE_AVAILABLE", True)


# ── AC-S1: başlatma, sınır, hız ─────────────────────────────────────────────────

async def test_scan_start_response_and_feature_off(db, make_session):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    assert st.max_pages == 100 and st.page_delay == (3, 6)
    assert st.warn_after_ms == (6 + 60) * 1000
    assert st.stale_after_ms == 600 * 1000
    assert st.collection_choice is True
    row = await db.get(CleanupScan, st.scan_id)
    assert row.status == "running" and row.kind == "saved" and row.collections_mode == "all_protected"
    assert row.started_at == T0
    off = await make_session(username="off", allow_unsave=False)
    e = await err(sc.start_scan(db, off, T0, limits=L))
    assert (e.code, e.status) == ("feature_off", 403)


async def test_scan_start_uses_file_limits(db, make_session):
    s = await make_session(allow_unsave=True)
    lim = mk_limits(**{"scan.saved_max_pages": 7, "scan.page_delay_min": 5, "scan.page_delay_max": 130})
    st = await sc.start_scan(db, s, T0, limits=lim)
    assert st.max_pages == 7 and st.page_delay == (5, 120)           # sert tavan 120 (kapı yeniden kırpar)
    assert st.stale_after_ms == max(600, 2 * 120 + 120) * 1000
    assert st.warn_after_ms == (120 + 60) * 1000


async def test_scan_too_soon(db, make_session):
    """AC-S1: kayan saatte max_per_hour (2) taramadan fazlası -> 429 scan_too_soon + retry_after."""
    s = await make_session(allow_unsave=True)
    await run_scan(db, s, [item(1)], T0, outcome="failed")
    await run_scan(db, s, [item(1)], T0 + 10 * MIN, outcome="failed")
    e = await err(sc.start_scan(db, s, T0 + 20 * MIN, limits=L))
    assert (e.code, e.status) == ("scan_too_soon", 429)
    assert e.extra["retry_after"] == 40 * 60                           # en eski T0 + 60 dk'da düşer
    # sınırda (T0 + 60 dk) pencere dışına çıkar: izin
    st = await sc.start_scan(db, s, T0 + 60 * MIN, limits=L)
    assert st.scan_id
    # max_per_hour dosyadan: 1'e inerse tek tarama yeter
    s2 = await make_session(username="b", allow_unsave=True)
    one = mk_limits(**{"scan.max_per_hour": 1})
    await run_scan(db, s2, [item(1)], T0, outcome="failed", limits=one)
    assert (await err(sc.start_scan(db, s2, T0 + MIN, limits=one))).code == "scan_too_soon"


async def test_scan_too_soon_is_per_profile(db, make_session):
    a = await make_session(username="a", allow_unsave=True)
    b = await make_session(username="b", allow_unsave=True)
    one = mk_limits(**{"scan.max_per_hour": 1})
    await run_scan(db, a, [item(1)], T0, outcome="failed", limits=one)
    assert (await sc.start_scan(db, b, T0 + MIN, limits=one)).scan_id


# ── AC-S8: tarama durumları ─────────────────────────────────────────────────────

async def test_scan_state_machine_partial_failed_stuck_stale(db, make_session):
    s = await make_session(allow_unsave=True)
    # ok
    s1 = await run_scan(db, s, [item(1), item(2)], T0)
    x = await db.get(CleanupScan, s1)
    assert (x.status, x.items, x.pages) == ("ok", 2, 1) and x.finished_at == T0
    # partial: yeni envanterin yerini alır, partial işaretli
    s2 = await run_scan(db, s, [item(3)], T0 + 2 * H, outcome="partial")
    await db.refresh(x)
    assert (await db.get(CleanupScan, s2)).status == "partial"
    assert await _target_ids(db, s1) == []                            # eski envanter silindi
    assert len(await _target_ids(db, s2)) == 1
    assert (await sc.current_inventory_scan(db, s.id)).id == s2
    # failed: satırları silinir, önceki envanter kalır
    s3 = await run_scan(db, s, [item(4), item(5)], T0 + 4 * H, outcome="failed")
    assert await _target_ids(db, s3) == []
    assert len(await _target_ids(db, s2)) == 1
    assert (await sc.current_inventory_scan(db, s.id)).id == s2
    # blocked: aynı + 24 sa duraklatma (AC-C13)
    now = T0 + 6 * H
    s4 = await run_scan(db, s, [item(6)], now, outcome="blocked")
    assert await _target_ids(db, s4) == []
    await db.refresh(s)
    assert s.cleanup_paused_until == now + 24 * H and s.paused_until == now + 24 * H
    assert s.paused_reason == "Ek iş: Instagram işlemi engelledi"
    assert s.cleanup_paused_reason == "blocked"
    assert (await db.get(CleanupScan, s4)).status == "blocked"
    # takılı running tarama: eşik aşılınca failed olur ve yeni taramaya izin verilir (scan_running yok)
    s5 = (await sc.start_scan(db, s, now + 3 * H, limits=L)).scan_id
    e = await err(sc.start_scan(db, s, now + 3 * H + MIN, limits=L))
    assert (e.code, e.status) == ("scan_running", 409)
    st = await sc.start_scan(db, s, now + 3 * H + 11 * MIN, limits=L)
    assert (await db.get(CleanupScan, s5)).status == "failed"
    assert st.scan_id != s5


async def test_blocked_does_not_shorten_longer_pause(db, make_session):
    s = await make_session(allow_unsave=True)
    s.cleanup_paused_until = T0 + 72 * H
    s.paused_until = T0 + 72 * H
    await db.commit()
    await run_scan(db, s, [item(1)], T0, outcome="blocked")
    await db.refresh(s)
    assert s.cleanup_paused_until == T0 + 72 * H and s.paused_until == T0 + 72 * H


async def test_finish_is_idempotent_and_accepted_when_feature_off(db, make_session):
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [item(1)], T0)
    r = await sc.finish_scan(db, s, sid, "failed", None, T0 + MIN)       # kapalı tarama değişmez
    assert r.status == "ok" and r.items == 1
    st = await sc.start_scan(db, s, T0 + H, limits=L)
    s.allow_unsave = False                                               # AC §7.5: finish kapalıyken de kabul
    await db.commit()
    r = await sc.finish_scan(db, s, st.scan_id, "partial", "page_cap", T0 + H)
    assert r.status == "partial"


async def test_finish_rejects_unknown_outcome_and_foreign_scan(db, make_session):
    a = await make_session(username="a", allow_unsave=True)
    b = await make_session(username="b", allow_unsave=True)
    st = await sc.start_scan(db, a, T0, limits=L)
    assert (await err(sc.finish_scan(db, a, st.scan_id, "weird", None, T0))).code == "invalid"
    e = await err(sc.finish_scan(db, b, st.scan_id, "ok", None, T0))
    assert (e.code, e.status) == ("not_found", 404)                      # IDOR
    assert (await err(sc.add_page(db, b, st.scan_id, 1, [], T0, limits=L))).status == 404


async def _target_ids(db, scan_id):
    return list((await db.execute(select(SavedTarget.media_id).where(SavedTarget.scan_id == scan_id))).scalars())


# ── AC-S2: yalnız izinli alanlar ────────────────────────────────────────────────

async def test_scan_rejects_extra_fields(db, make_session):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    for extra in ({"caption": {"text": "x"}}, {"user": {"pk": "1"}}, {"taken_at": 1}, {"id": "1_2"}):
        e = await err(sc.add_page(db, s, st.scan_id, 1, [item(1, **extra)], T0, limits=L))
        assert (e.code, e.status) == ("invalid", 422)
        assert "media_id" not in str(e.extra)                              # girdi yansıtılmaz
    assert await _target_ids(db, st.scan_id) == []


# ── AC-S13: sayfa doğrulaması ───────────────────────────────────────────────────

async def test_scan_page_validation(db, make_session):
    s = await make_session(allow_unsave=True)
    lim = mk_limits(**{"scan.saved_max_pages": 3})
    st = await sc.start_scan(db, s, T0, limits=lim)
    sid = st.scan_id
    # sayfa 2 ile başlamak, 0 ve tekrar: page_out_of_order
    for bad in (2, 0, -1):
        e = await err(sc.add_page(db, s, sid, bad, [item(1)], T0, limits=lim))
        assert (e.code, e.status) == ("page_out_of_order", 409)
    # > 50 öğe: 422
    e = await err(sc.add_page(db, s, sid, 1, [item(i) for i in range(51)], T0, limits=lim))
    assert (e.code, e.status) == ("invalid", 422)
    # tek geçersiz öğe tüm sayfayı reddeder
    page = [item(i) for i in range(5)] + [item(9, shortcode="x")]
    assert (await err(sc.add_page(db, s, sid, 1, page, T0, limits=lim))).code == "invalid"
    assert await _target_ids(db, sid) == []
    # 50 öğe tamam; yinelenenler duplicates olarak sayılır
    r = await sc.add_page(db, s, sid, 1, [item(i) for i in range(50)], T0, limits=lim)
    assert (r.accepted, r.duplicates, r.total, r.continue_) == (50, 0, 50, True)
    # aynı sayfada tekrar eden id + önceki sayfadaki id
    r = await sc.add_page(db, s, sid, 2, [item(1), item(100), item(100), item(101)], T0 + MIN, limits=lim)
    assert (r.accepted, r.duplicates, r.total) == (2, 2, 52)
    # sıra: position sayfa sırasıyla 0'dan artar, tekrarlar sayılmaz
    pos = dict((await db.execute(select(SavedTarget.media_id, SavedTarget.position).where(
        SavedTarget.scan_id == sid))).all())
    assert sorted(pos.values()) == list(range(52))
    assert pos[item(100)["media_id"]] == 50 and pos[item(101)["media_id"]] == 51
    row = await db.get(CleanupScan, sid)
    assert (row.pages, row.items, row.duplicates, row.last_page_at) == (2, 52, 2, T0 + MIN)
    # ardışık değil: 2 tekrar, 4 atlama
    assert (await err(sc.add_page(db, s, sid, 2, [item(200)], T0, limits=lim))).code == "page_out_of_order"
    assert (await err(sc.add_page(db, s, sid, 4, [item(200)], T0, limits=lim))).code == "page_out_of_order"
    # max_pages: 3 geçerli (devam=false), 4 -> page_cap
    r = await sc.add_page(db, s, sid, 3, [item(300)], T0 + 2 * MIN, limits=lim)
    assert r.continue_ is False
    e = await err(sc.add_page(db, s, sid, 4, [item(400)], T0 + 3 * MIN, limits=lim))
    assert (e.code, e.status) == ("page_cap", 409)
    # boş sayfa kabul edilir (boş ilk sayfa, AC-S18)
    s2 = await make_session(username="e", allow_unsave=True)
    st2 = await sc.start_scan(db, s2, T0, limits=L)
    r = await sc.add_page(db, s2, st2.scan_id, 1, [], T0, limits=L)
    assert (r.accepted, r.total) == (0, 0)
    # kapalı taramaya sayfa: scan_closed
    await sc.finish_scan(db, s2, st2.scan_id, "ok", None, T0)
    e = await err(sc.add_page(db, s2, st2.scan_id, 2, [item(1)], T0, limits=L))
    assert (e.code, e.status) == ("scan_closed", 409)


async def test_page_rejected_when_feature_off(db, make_session):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    s.allow_unsave = False
    await db.commit()
    e = await err(sc.add_page(db, s, st.scan_id, 1, [item(1)], T0, limits=L))
    assert (e.code, e.status) == ("feature_off", 403)


async def test_page_field_validation_table(db, make_session):
    s = await make_session(allow_unsave=True)
    bad = [
        {"media_id": 123, "shortcode": "Cabcde12345"},                          # sayı: yuvarlanır, kabul edilmez
        {"media_id": "12a", "shortcode": "Cabcde12345"},
        {"media_id": "1" * 26, "shortcode": "Cabcde12345"},
        {"media_id": "1", "shortcode": "a b c d e"},
        {"media_id": "1", "shortcode": "Cabcde12345", "owner_username": "Upper"},
        {"media_id": "1", "shortcode": "Cabcde12345", "owner_username": "x" * 31},
        {"media_id": "1", "shortcode": "Cabcde12345", "media_type": "gif"},
        {"media_id": "1", "shortcode": "Cabcde12345", "is_ad": "yes"},
        {"media_id": "1", "shortcode": "Cabcde12345", "thumbnail_url": "http://scontent.cdninstagram.com/x.jpg"},
        {"media_id": "1", "shortcode": "Cabcde12345", "thumbnail_url": "https://evil.example.com/x.jpg"},
        {"media_id": "1", "shortcode": "Cabcde12345", "thumbnail_url": "https://cdninstagram.com.evil.io/x.jpg"},
        {"media_id": "1", "shortcode": "Cabcde12345", "thumbnail_url": "https://u:p@scontent.fbcdn.net/x.jpg"},
        {"media_id": "1", "shortcode": "Cabcde12345", "collection_ids": ["abc"]},
        {"media_id": "1", "shortcode": "Cabcde12345", "collection_ids": [5]},
        {"media_id": "1", "shortcode": "Cabcde12345", "collection_ids": [str(i) for i in range(21)]},
        {"media_id": "1", "shortcode": "Cabcde12345", "collections_unreadable": False},
        {"media_id": "1", "shortcode": "Cabcde12345", "collections_unreadable": True, "collection_ids": ["1"]},
    ]
    st = await sc.start_scan(db, s, T0, limits=L)
    for b in bad:
        e = await err(sc.add_page(db, s, st.scan_id, 1, [b], T0, limits=L))
        assert (e.code, e.status) == ("invalid", 422), b
    ok = {"media_id": "1", "shortcode": "Cabcde12345", "owner_username": "a.b_c", "media_type": "carousel",
          "is_ad": True, "thumbnail_url": "https://scontent-x.cdninstagram.com/v/t.jpg?x=1",
          "collection_ids": ["17890000000000001"]}
    r = await sc.add_page(db, s, st.scan_id, 1, [ok, {"media_id": "2", "shortcode": "Cabcde12346",
                                                      "thumbnail_url": "https://a.fbcdn.net/z.jpg",
                                                      "collections_unreadable": True}], T0, limits=L)
    assert r.accepted == 2
    rows = {x.media_id: x for x in (await db.execute(select(SavedTarget))).scalars()}
    assert rows["1"].is_ad is True and rows["1"].collection_ids == ["17890000000000001"]
    assert rows["2"].collections_unreadable is True and rows["2"].collection_ids is None and rows["2"].is_ad is False


async def test_media_id_must_be_pk(db, make_session):
    """AC-S18 (R7 M6): `<pk>_<sahip_pk>` kabul edilmez; 19 haneli pk string olarak aynen saklanır."""
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    e = await err(sc.add_page(db, s, st.scan_id, 1, [{"media_id": "3512345678901234567_99", "shortcode": "Cabcde12345"}],
                              T0, limits=L))
    assert e.code == "invalid"
    await sc.add_page(db, s, st.scan_id, 1, [{"media_id": "3512345678901234567", "shortcode": "Cabcde12345"}], T0, limits=L)
    assert await _target_ids(db, st.scan_id) == ["3512345678901234567"]


# ── AC-C22: yeniden tarama ──────────────────────────────────────────────────────

async def test_rescan_replaces_inventory_keeps_batch_and_scan_row(db, make_session):
    s = await make_session(allow_unsave=True)
    s1 = await run_scan(db, s, [item(1), item(2)], T0)
    b = CleanupBatch(session_id=s.id, kind="saved", status="running", scan_id=s1, item_count=1,
                     max_items_at_preview=100, expires_at=T0 + H)
    db.add(b)
    await db.commit()
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, ref=item(1)["media_id"], label="@a · Cabc000001"))
    await db.commit()
    s2 = await run_scan(db, s, [item(2), item(3)], T0 + 2 * H)
    assert await _target_ids(db, s1) == []                                  # eski satırlar silindi
    assert sorted(await _target_ids(db, s2)) == sorted([item(2)["media_id"], item(3)["media_id"]])
    assert (await db.get(CleanupScan, s1)).status == "ok"                  # tarama satırı kalır
    await db.refresh(b)
    assert b.scan_id == s1 and b.status == "running"                       # parti ve öğeleri değişmez
    assert (await db.execute(select(func.count()).select_from(CleanupItem))).scalar_one() == 1
    assert (await sc.current_inventory_scan(db, s.id)).id == s2
    # envanter yalnız güncel taramanın satırlarını görür
    inv = await sc.inventory(db, s, T0 + 3 * H)
    assert inv["scan"]["id"] == s2 and inv["total"] == 2


async def test_inventory_without_scan_is_empty(db, make_session):
    s = await make_session(allow_unsave=True)
    inv = await sc.inventory(db, s, T0)
    assert inv == {"scan": None, "total": 0, "protected_total": 0, "items": []}


# ── AC-S14: filtre ──────────────────────────────────────────────────────────────

async def _filter_fixture(db, s):
    items = [
        item(1, owner_username="alice", media_type="image"),
        item(2, owner_username="a_b", media_type="video"),
        item(3, owner_username="axb", media_type="carousel"),
        item(4, owner_username="Bob.x".lower(), media_type="image", is_ad=True),
        item(5, media_type="video"),                       # sahibi null
        item(6, owner_username="carol"),                   # türü null
        item(7, owner_username="dave", media_type="video", is_ad=True),
    ]
    return await run_scan(db, s, items, T0)


async def test_inventory_and_preview_filter_identical(db, make_session):
    s = await make_session(allow_unsave=True)
    sid = await _filter_fixture(db, s)
    for q, mt in [(None, None), ("a", None), ("a_b", None), (None, "image"), ("a", "video"), (None, "ad")]:
        f = sc.parse_filters(q, mt, None)
        inv = await sc.inventory(db, s, T0, q=q, media_type=mt)
        assert inv["total"] == await sc.count_matching(db, sid, f), (q, mt)    # önizleme aday sayısı (excluded dahil)
        got = [i["ref"] for i in inv["items"]]
        ids = await sc.matching_refs(db, sid, f)
        assert got == ids                                                   # aynı fonksiyon, aynı sıra


async def test_like_escape_and_q_validation(db, make_session):
    s = await make_session(allow_unsave=True)
    await _filter_fixture(db, s)

    async def owners(q):
        inv = await sc.inventory(db, s, T0, q=q)
        return sorted(i["owner_username"] for i in inv["items"])

    assert await owners("a_b") == ["a_b"]                                   # joker değil
    assert await owners("a") == sorted(["alice", "a_b", "axb", "carol", "dave"])   # alt dize
    assert await owners("  @ALICE ") == ["alice"]                          # kırp, @ at, küçült
    assert await owners("lic") == ["alice"]                                 # alt dize
    for bad in ("50%", "a b", "x" * 31, "ünal", "a\\b", "a;b"):
        e = await err(sc.inventory(db, s, T0, q=bad))
        assert (e.code, e.status) == ("invalid", 422), bad
    # sahibi null olan satırlar q doluyken eşleşmez
    inv = await sc.inventory(db, s, T0, q=".")
    assert all(i["owner_username"] for i in inv["items"])


async def test_empty_filters_mean_no_filter(db, make_session):
    s = await make_session(allow_unsave=True)
    await _filter_fixture(db, s)
    base = (await sc.inventory(db, s, T0))["total"]
    assert base == 7
    for q in ("", "   ", "@", " @ "):
        assert (await sc.inventory(db, s, T0, q=q))["total"] == base
    assert (await sc.inventory(db, s, T0, media_type=""))["total"] == base
    assert (await sc.inventory(db, s, T0, collection_id=""))["total"] == base
    assert (await sc.inventory(db, s, T0, q=None, media_type=None, collection_id=None))["total"] == base


async def test_media_type_filter_semantics(db, make_session):
    s = await make_session(allow_unsave=True)
    await _filter_fixture(db, s)

    async def refs(mt):
        return sorted(i["ref"] for i in (await sc.inventory(db, s, T0, media_type=mt))["items"])

    r = {mt: await refs(mt) for mt in ("image", "video", "carousel", "ad")}
    assert len(r["image"]) == 1 and len(r["video"]) == 2 and len(r["carousel"]) == 1 and len(r["ad"]) == 2
    assert not (set(r["ad"]) & (set(r["image"]) | set(r["video"]) | set(r["carousel"])))
    # türü null satır (6) hiçbir tür filtresinde yok; dört değerin toplamı + null = toplam
    assert sum(len(v) for v in r.values()) + 1 == 7
    e = await err(sc.inventory(db, s, T0, media_type="gif"))
    assert e.code == "invalid"


async def test_ad_filter_disjoint_from_types(db, make_session):
    """AC-S19: is_ad satırı tür filtresinde görünmez; `ad` yalnız is_ad=true; reklam envanterde is_ad ile döner."""
    s = await make_session(allow_unsave=True)
    await _filter_fixture(db, s)
    ad = (await sc.inventory(db, s, T0, media_type="ad"))["items"]
    assert [i["is_ad"] for i in ad] == [True, True]
    img = (await sc.inventory(db, s, T0, media_type="image"))["items"]
    assert all(i["is_ad"] is False for i in img)
    vid = (await sc.inventory(db, s, T0, media_type="video"))["items"]
    assert item(7)["media_id"] not in [i["ref"] for i in vid]               # reklam video, 'video'da çıkmaz


async def test_collection_id_injection_rejected(db, make_session):
    """AC-S14/S5 (S-25, v1.6): desen dışı -> invalid; dolu desenli -> not_available."""
    s = await make_session(allow_unsave=True)
    await _filter_fixture(db, s)
    for bad in ("1' OR '1'='1", "abc", "1" * 26, "-1", "1 2"):
        e = await err(sc.inventory(db, s, T0, collection_id=bad))
        assert (e.code, e.status) == ("invalid", 422), bad
    e = await err(sc.inventory(db, s, T0, collection_id="123"))
    assert (e.code, e.status) == ("not_available", 422)
    with pytest.raises(CleanupError) as ei:
        sc.parse_filters(None, None, "17890000000000001")
    assert ei.value.code == "not_available"


async def test_collection_filter_not_available_in_phase1(db, make_session):
    """AC-S5: dolu -> not_available; desen dışı -> invalid; boş string -> filtre yok."""
    s = await make_session(allow_unsave=True)
    await run_scan(db, s, [item(1)], T0)
    assert (await err(sc.inventory(db, s, T0, collection_id="1"))).code == "not_available"
    assert (await err(sc.inventory(db, s, T0, collection_id="x"))).code == "invalid"
    assert (await sc.inventory(db, s, T0, collection_id=""))["total"] == 1


async def test_inventory_paging_and_limits(db, make_session):
    s = await make_session(allow_unsave=True)
    await run_scan(db, s, [item(i) for i in range(50)], T0)
    inv = await sc.inventory(db, s, T0, limit=20, offset=40)
    assert inv["total"] == 50 and [i["position"] for i in inv["items"]] == list(range(40, 50))
    for lim, off in ((0, 0), (51, 0), (10, -1)):
        assert (await err(sc.inventory(db, s, T0, limit=lim, offset=off))).code == "invalid"


async def test_inventory_row_shape_and_scan_block(db, make_session):
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [item(1, owner_username="alice", media_type="image", is_ad=False,
                                      thumbnail_url="https://a.fbcdn.net/z.jpg")], T0, outcome="partial")
    inv = await sc.inventory(db, s, T0 + 25 * H)
    assert inv["scan"] == {"id": sid, "status": "partial", "started_at": T0, "finished_at": T0, "items": 1,
                           "partial": True, "stale": True, "collections_mode": "all_protected"}
    assert inv["items"] == [{"ref": item(1)["media_id"], "shortcode": item(1)["shortcode"],
                             "owner_username": "alice", "media_type": "image", "is_ad": False,
                             "thumbnail_url": "https://a.fbcdn.net/z.jpg", "collections": [], "position": 0,
                             "state": "available"}]
    fresh = await sc.inventory(db, s, T0 + 23 * H)
    assert fresh["scan"]["stale"] is False


# ── AC-S15: durum ───────────────────────────────────────────────────────────────

async def test_inventory_state_and_excluded(db, make_session):
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [item(i) for i in range(1, 9)], T0)
    scan = await db.get(CleanupScan, sid)
    b = CleanupBatch(session_id=s.id, kind="saved", status="running", scan_id=sid, item_count=8,
                     max_items_at_preview=100, expires_at=T0 + H)
    old = CleanupBatch(session_id=s.id, kind="saved", status="done", scan_id=None, item_count=1,
                       max_items_at_preview=100, expires_at=T0)
    db.add_all([b, old])
    await db.commit()
    mk = lambda i, st, at, batch=b: CleanupItem(session_id=s.id, batch_id=batch.id, ref=item(i)["media_id"],
                                                 label="@a · x", status=st, created_at=at)
    after = scan.started_at + MIN
    db.add_all([
        mk(1, "pending", after), mk(2, "done", after), mk(3, "already", after), mk(4, "not_found", after),
        mk(5, "protected", after), mk(6, "failed", after), mk(7, "cancelled", after),
        mk(8, "done", scan.started_at - MIN, old),                       # tarama başlangıcından ÖNCE: etkisiz
    ])
    await db.commit()
    inv = await sc.inventory(db, s, T0 + H)
    st = {i["ref"]: i["state"] for i in inv["items"]}
    assert [st[item(i)["media_id"]] for i in range(1, 9)] == [
        "queued", "done", "already", "not_found", "protected", "available", "available", "available"]
    assert inv["total"] == 8
    # aynı ref'in birden çok öğesi: failed + sonra done -> done
    db.add(mk(6, "done", after + MIN))
    await db.commit()
    st = {i["ref"]: i["state"] for i in (await sc.inventory(db, s, T0 + H))["items"]}
    assert st[item(6)["media_id"]] == "done"


# ── AC-S16 / S21: koruma (envanter) ─────────────────────────────────────────────

async def test_collection_posts_protected_in_inventory_f_mode(db, make_session):
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [
        item(1, collection_ids=[]),
        item(2),                                       # alan yok (null)
        item(3, collection_ids=["17890000000000001"]),
        item(4, collections_unreadable=True),
    ], T0)
    mode, allow = await sc.protection_context(db, sid)
    assert mode == "all_protected" and allow == frozenset()
    inv = await sc.inventory(db, s, T0)
    st = {i["ref"]: i["state"] for i in inv["items"]}
    assert [st[item(i)["media_id"]] for i in (1, 2, 3, 4)] == ["available", "available", "protected", "protected"]
    assert inv["protected_total"] == 2
    # F modunda kimlik adı yok, protected=true
    row = next(i for i in inv["items"] if i["ref"] == item(3)["media_id"])
    assert row["collections"] == [{"collection_id": "17890000000000001", "name": None, "protected": True}]


async def test_collections_unreadable_is_protected_in_inventory(db, make_session, w_mode):
    """AC-S16/S21: collections_unreadable her modda korunur; null korunmaz (karar taze okumada)."""
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [item(1, collections_unreadable=True), item(2)],
                         T0, collections=colls(("11", "Açık")))
    mode, allow = await sc.protection_context(db, sid)
    assert mode == "per_collection"
    await db.execute(SavedCollection.__table__.update().values(protected=False))
    await db.commit()
    inv = await sc.inventory(db, s, T0)
    st = {i["ref"]: i["state"] for i in inv["items"]}
    assert st[item(1)["media_id"]] == "protected" and st[item(2)["media_id"]] == "available"


async def test_protection_sql_counts_add_up_for_null_and_unreadable(db, make_session, w_mode):
    """R7 M1: null ve okunamayan satırlarda korunan + seçilebilir = toplam (SQL ifadesi NULL dönmez)."""
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [
        item(1), item(2, collection_ids=[]), item(3, collections_unreadable=True),
        item(4, collection_ids=["11"]), item(5, collection_ids=["12"]), item(6, collection_ids=["11", "12"]),
        item(7, collection_ids=["99"]),
    ], T0, collections=colls(("11", "A"), ("12", "B")))
    await db.execute(SavedCollection.__table__.update().where(SavedCollection.collection_id == "12").values(
        protected=False))
    await db.commit()
    mode, allow = await sc.protection_context(db, sid)
    assert mode == "per_collection" and allow == frozenset({"12"})
    clause = sc.protected_clause(allow)
    prot = (await db.execute(select(func.count()).select_from(SavedTarget).where(
        SavedTarget.scan_id == sid, clause))).scalar_one()
    free = (await db.execute(select(func.count()).select_from(SavedTarget).where(
        SavedTarget.scan_id == sid, ~clause))).scalar_one()
    assert prot + free == 7
    inv = await sc.inventory(db, s, T0)
    st = {i["ref"]: i["state"] for i in inv["items"]}
    # [] , null korunmaz; unreadable korunur; [11] korunur; [12] korunmaz; [11,12] korunur; [99] bilinmiyor -> korunur
    assert [st[item(i)["media_id"]] for i in range(1, 8)] == [
        "available", "available", "protected", "protected", "available", "protected", "protected"]
    assert inv["protected_total"] == 4 == prot
    # W: koleksiyon adları ve korunma bayrağı satırda
    row = next(i for i in inv["items"] if i["ref"] == item(6)["media_id"])
    assert row["collections"] == [{"collection_id": "11", "name": "A", "protected": True},
                                  {"collection_id": "12", "name": "B", "protected": False}]
    unk = next(i for i in inv["items"] if i["ref"] == item(7)["media_id"])
    assert unk["collections"] == [{"collection_id": "99", "name": None, "protected": True}]


async def test_known_ids_are_seen_in_context_scan_or_later(db, make_session, w_mode):
    """R6 M-3: allow = korumasız ve last_seen_scan_id >= bağlam taraması olanlar; görülmemiş ya da null bilinmez."""
    s = await make_session(allow_unsave=True)
    s1 = await run_scan(db, s, [item(1)], T0, collections=colls(("11", "A"), ("12", "B")))
    await db.execute(SavedCollection.__table__.update().values(protected=False))
    await db.commit()
    assert (await sc.protection_context(db, s1))[1] == frozenset({"11", "12"})
    # 2. tarama yalnız 11'i görür
    s2 = await run_scan(db, s, [item(1)], T0 + 2 * H, collections=colls(("11", "A")))
    assert (await sc.protection_context(db, s2))[1] == frozenset({"11"})
    assert (await sc.protection_context(db, s1))[1] == frozenset({"11", "12"})   # eski bağlam: 12 s1'de görüldü
    # last_seen null olan korumasız satır bilinmez
    await db.execute(SavedCollection.__table__.update().where(SavedCollection.collection_id == "12").values(
        last_seen_scan_id=None))
    await db.commit()
    assert (await sc.protection_context(db, s1))[1] == frozenset({"11"})
    # tarama satırı yok ya da null -> F
    assert await sc.protection_context(db, None) == ("all_protected", frozenset())
    assert await sc.protection_context(db, 999999) == ("all_protected", frozenset())


async def test_code_level_f_forces_all_protected_context(db, make_session, w_mode, monkeypatch):
    s = await make_session(allow_unsave=True)
    s1 = await run_scan(db, s, [item(1)], T0, collections=colls(("11", "A")))
    await db.execute(SavedCollection.__table__.update().values(protected=False))
    await db.commit()
    assert (await sc.protection_context(db, s1))[0] == "per_collection"
    monkeypatch.setattr(sc, "COLLECTION_CHOICE_AVAILABLE", False)
    assert await sc.protection_context(db, s1) == ("all_protected", frozenset())


# ── AC-S20: koleksiyon alımı [W] ────────────────────────────────────────────────

async def test_scan_collections_once_before_pages_sets_mode(db, make_session, w_mode):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    assert st.collection_choice is True
    r = await sc.add_collections(db, s, st.scan_id, colls(("11", "Tarifler"), ("12", "Seyahat")), T0)
    assert (r.mode, r.new_count) == ("per_collection", 2)
    row = await db.get(CleanupScan, st.scan_id)
    assert row.collections_mode == "per_collection" and row.collections_received_at == T0 and row.note_code is None
    # tarama başına tek hak: ikinci çağrı -> collections_closed
    e = await err(sc.add_collections(db, s, st.scan_id, colls(("13", "X")), T0))
    assert (e.code, e.status) == ("collections_closed", 409)
    assert await _coll_ids(db, s) == ["11", "12"]
    # ilk sayfadan sonra -> collections_closed
    s2 = await make_session(username="late", allow_unsave=True)
    st2 = await sc.start_scan(db, s2, T0, limits=L)
    await sc.add_page(db, s2, st2.scan_id, 1, [item(1)], T0, limits=L)
    e = await err(sc.add_collections(db, s2, st2.scan_id, colls(("11", "A")), T0))
    assert e.code == "collections_closed"
    assert (await db.get(CleanupScan, st2.scan_id)).collections_mode == "all_protected"
    # available:false da hakkı tüketir (2xx) ve modu F bırakır
    s3 = await make_session(username="f", allow_unsave=True)
    st3 = await sc.start_scan(db, s3, T0, limits=L)
    r = await sc.add_collections(db, s3, st3.scan_id, {"available": False, "note_code": "collections_unavailable"}, T0)
    assert (r.mode, r.new_count) == ("all_protected", 0)
    assert (await err(sc.add_collections(db, s3, st3.scan_id, colls(("11", "A")), T0))).code == "collections_closed"
    # kapanmış taramaya: scan_closed; sahipsiz/başka profil: 404
    await sc.finish_scan(db, s3, st3.scan_id, "ok", None, T0)
    assert (await err(sc.add_collections(db, s3, st3.scan_id, colls(), T0))).code == "scan_closed"
    assert (await err(sc.add_collections(db, s, st3.scan_id, colls(), T0))).status == 404


async def _coll_ids(db, s):
    return sorted((await db.execute(select(SavedCollection.collection_id).where(
        SavedCollection.session_id == s.id))).scalars())


async def test_scan_without_collections_call_is_all_protected(db, make_session, w_mode):
    s = await make_session(allow_unsave=True)
    sid = await run_scan(db, s, [item(1, collection_ids=["11"])], T0)
    assert (await db.get(CleanupScan, sid)).collections_mode == "all_protected"
    assert await _coll_ids(db, s) == []
    assert (await sc.protection_context(db, sid))[0] == "all_protected"


async def test_new_collections_default_protected_existing_kept(db, make_session, w_mode):
    """K-22: kaldırılan koruma kalıcı; ad güncellenir; yeni satır korumalı, first_seen_scan_id bu tarama."""
    s = await make_session(allow_unsave=True)
    s1 = await run_scan(db, s, [item(1)], T0, collections=colls(("11", "Eski ad"), ("12", "B")))
    rows = {c.collection_id: c for c in (await db.execute(select(SavedCollection))).scalars()}
    assert all(c.protected for c in rows.values())
    assert (rows["11"].first_seen_scan_id, rows["11"].last_seen_scan_id) == (s1, s1)
    await db.execute(SavedCollection.__table__.update().where(SavedCollection.collection_id == "11").values(
        protected=False))
    await db.commit()
    s2 = await run_scan(db, s, [item(1)], T0 + 2 * H, collections=colls(("11", "Yeni ad"), ("13", "C")))
    rows = {c.collection_id: c for c in (await db.execute(select(SavedCollection))).scalars()}
    await db.commit()
    for c in rows.values():
        await db.refresh(c)
    assert rows["11"].protected is False and rows["11"].name == "Yeni ad"       # ayar kalıcı, ad güncel
    assert rows["13"].protected is True and rows["13"].first_seen_scan_id == s2
    assert rows["11"].first_seen_scan_id == s1 and rows["11"].last_seen_scan_id == s2
    assert rows["12"].last_seen_scan_id == s1                                   # s2'de görülmedi: eski kalır
    assert rows["13"].last_seen_scan_id == s2


async def test_last_seen_updates_only_when_scan_ok_or_partial(db, make_session, w_mode):
    """R7 M3: failed/blocked taramanın çağrısı satır ve ad yazar ama last_seen_scan_id'ye dokunmaz."""
    s = await make_session(allow_unsave=True)
    s1 = await run_scan(db, s, [item(1)], T0, collections=colls(("11", "A")))
    s2 = await run_scan(db, s, [item(1)], T0 + 2 * H, outcome="failed",
                        collections=colls(("11", "Yeni ad"), ("12", "Yeni")))
    rows = {c.collection_id: c for c in (await db.execute(select(SavedCollection))).scalars()}
    assert rows["11"].name == "Yeni ad"                                          # ad güncellemesi kalıcı
    assert rows["12"].protected is True and rows["12"].first_seen_scan_id == s2   # yeni satır kalıcı, korumalı
    assert rows["11"].last_seen_scan_id == s1 and rows["12"].last_seen_scan_id is None
    s3 = await run_scan(db, s, [item(1)], T0 + 4 * H, outcome="partial", collections=colls(("11", "A"), ("12", "B")))
    for c in rows.values():
        await db.refresh(c)
    assert rows["11"].last_seen_scan_id == s3 and rows["12"].last_seen_scan_id == s3
    # blocked da yazmaz
    s4 = await run_scan(db, s, [item(1)], T0 + 6 * H, outcome="blocked", collections=colls(("11", "A")))
    await db.refresh(rows["11"])
    assert rows["11"].last_seen_scan_id == s3


async def test_collections_refused_when_code_level_f(db, make_session, monkeypatch):
    """K-5: kod düzeyinde F iken çağrı 409 collections_unavailable; mod all_protected; yanıtta collection_choice=false."""
    monkeypatch.setattr(sc, "COLLECTION_CHOICE_AVAILABLE", False)
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    assert st.collection_choice is False
    for payload in (colls(("11", "A")), {"available": False, "note_code": "collections_unavailable"}):
        e = await err(sc.add_collections(db, s, st.scan_id, payload, T0))
        assert (e.code, e.status) == ("collections_unavailable", 409)
    assert await _coll_ids(db, s) == []
    assert (await db.get(CleanupScan, st.scan_id)).collections_mode == "all_protected"


async def test_422_does_not_consume_collections_call(db, make_session, w_mode):
    """K-7, R6 L-1: 422 hakkı tüketmez; ardından available:false yeniden denemesi 200 alır."""
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    e = await err(sc.add_collections(db, s, st.scan_id, colls(("abc", "Bad")), T0))
    assert (e.code, e.status) == ("invalid", 422)
    r = await sc.add_collections(db, s, st.scan_id, {"available": False, "note_code": "collections_unavailable"}, T0)
    assert r.mode == "all_protected"
    assert (await err(sc.add_collections(db, s, st.scan_id, colls(("11", "A")), T0))).code == "collections_closed"
    # 422'den sonra geçerli available:true de kabul edilir
    s2 = await make_session(username="b", allow_unsave=True)
    st2 = await sc.start_scan(db, s2, T0, limits=L)
    await err(sc.add_collections(db, s2, st2.scan_id, colls(("11", "")), T0))
    r = await sc.add_collections(db, s2, st2.scan_id, colls(("11", "Tamam")), T0)
    assert (r.mode, r.new_count) == ("per_collection", 1)


async def test_collection_name_sanitised_and_limits(db, make_session, w_mode):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    rlo, lre, zwsp, bom, nl = "‮", "‪", "​", "﻿", "\n"
    pdi = "⁩"
    await sc.add_collections(db, s, st.scan_id, colls(
        ("11", f"  {rlo}Tari{zwsp}fler{pdi}{nl} "),
        ("12", f"{lre}Seyahat{bom}"),
        ("13", "a" * 100),
        ("14", "Türkçe İşğ 🍕"),
    ), T0)
    names = dict((await db.execute(select(SavedCollection.collection_id, SavedCollection.name))).all())
    assert names == {"11": "Tarifler", "12": "Seyahat", "13": "a" * 100, "14": "Türkçe İşğ 🍕"}
    # reddedilenler (tek bozuk öğe tüm çağrıyı reddeder, hiçbir şey yazılmaz)
    cases = {
        "empty after clean": [("15", f" {rlo}{zwsp} ")],
        "empty": [("15", "")],
        "too long": [("15", "a" * 101)],
        "bad id": [("15x", "A")],
        "id too long": [("1" * 26, "A")],
        "id int": [(15, "A")],
        "name not str": [("15", 5)],
    }
    for label, pairs in cases.items():
        s2 = await make_session(username=f"x{abs(hash(label)) % 10**6}", allow_unsave=True)
        st2 = await sc.start_scan(db, s2, T0, limits=L)
        e = await err(sc.add_collections(db, s2, st2.scan_id, colls(*pairs) , T0))
        assert (e.code, e.status) == ("invalid", 422), label
        assert await _coll_ids(db, s2) == []
    # bilinmeyen alan (extra=forbid), uygunsuz kombinasyonlar
    s3 = await make_session(username="y", allow_unsave=True)
    st3 = await sc.start_scan(db, s3, T0, limits=L)
    for payload in (
        {"available": True, "collections": [{"collection_id": "1", "name": "A", "cover": "x"}]},
        {"available": True, "collections": [{"collection_id": "1", "name": "A"}], "extra": 1},
        {"available": True},
        {"available": False, "collections": [{"collection_id": "1", "name": "A"}]},
        {"available": "yes", "collections": []},
        {"collections": []},
    ):
        assert (await err(sc.add_collections(db, s3, st3.scan_id, payload, T0))).code == "invalid", payload
    # çağrı başına 200 sınırı: 201 -> 422; 200 -> kabul
    many = [(str(1000 + i), f"K{i}") for i in range(201)]
    assert (await err(sc.add_collections(db, s3, st3.scan_id, colls(*many), T0))).code == "invalid"
    r = await sc.add_collections(db, s3, st3.scan_id, colls(*many[:200]), T0)
    assert r.new_count == 200
    # ad log'a yazılmaz
    assert (await db.execute(select(func.count()).select_from(ActionLog))).scalar_one() == 0


async def test_duplicate_collection_ids_first_wins(db, make_session, w_mode):
    s = await make_session(allow_unsave=True)
    st = await sc.start_scan(db, s, T0, limits=L)
    r = await sc.add_collections(db, s, st.scan_id, colls(("11", "İlk"), ("11", "İkinci")), T0)
    assert r.new_count == 1
    assert (await db.execute(select(SavedCollection.name))).scalar_one() == "İlk"


async def test_profile_cap_200_prunes_unseen_oldest(db, make_session, w_mode):
    """R6 L-9: yeni satır 200'ü aşacaksa son taramada görülmeyenler en eski last_seen'den başlayarak silinir;
    son taramada görülen satır hiç silinmez; silinen yeniden görülürse yeni sayılır ve korumalıdır."""
    s = await make_session(allow_unsave=True)
    # 3 tarama: ilk 100 (s1), sonra 100 (s2: 100 kimlik 1100..1199 yeni), sonra s3 hepsini görmez
    s1 = await run_scan(db, s, [item(1)], T0, collections=colls(*[(str(1000 + i), f"A{i}") for i in range(100)]))
    s2 = await run_scan(db, s, [item(1)], T0 + 2 * H, collections=colls(*[(str(1100 + i), f"B{i}") for i in range(100)]))
    assert len(await _coll_ids(db, s)) == 200
    # 1050 kimliğini kullanıcı korumasız yaptı (silinirse korumasızlık kaybolur: fail-closed)
    await db.execute(SavedCollection.__table__.update().where(SavedCollection.collection_id == "1050").values(
        protected=False))
    await db.commit()
    # s3: 10 yeni kimlik; son envanter taraması (s2) 1100..1199'u gördü, 1000..1099 görmedi (last_seen = s1)
    s3 = await run_scan(db, s, [item(1)], T0 + 4 * H, collections=colls(*[(str(2000 + i), f"C{i}") for i in range(10)]))
    ids = await _coll_ids(db, s)
    assert len(ids) == 200
    assert all(str(1100 + i) in ids for i in range(100))                    # son taramada görülenler duruyor
    assert all(str(2000 + i) in ids for i in range(10))
    gone = [i for i in range(1000, 1100) if str(i) not in ids]
    assert len(gone) == 10                                                  # 10 tane budandı
    # silinen kimlik yeniden görülürse yeni sayılır ve korumalı başlar
    g = str(gone[0])
    await run_scan(db, s, [item(1)], T0 + 6 * H, collections=colls((g, "Geri")))
    row = (await db.execute(select(SavedCollection).where(SavedCollection.collection_id == g))).scalar_one()
    assert row.protected is True
    # sığmayan çağrı (hiçbir satır budanamaz): 422, hak tüketilmez
    s2p = await make_session(username="b", allow_unsave=True)
    await run_scan(db, s2p, [item(1)], T0, collections=colls(*[(str(3000 + i), "x") for i in range(200)]))
    st = await sc.start_scan(db, s2p, T0 + 3 * H, limits=L)
    e = await err(sc.add_collections(db, s2p, st.scan_id, colls(("9999", "Yeni")), T0 + 3 * H))
    assert (e.code, e.status) == ("invalid", 422)
    r = await sc.add_collections(db, s2p, st.scan_id, {"available": False, "note_code": "collections_unavailable"},
                                 T0 + 3 * H)
    assert r.mode == "all_protected"


async def test_collections_isolated_per_profile(db, make_session, w_mode):
    a = await make_session(username="a", allow_unsave=True)
    b = await make_session(username="b", allow_unsave=True)
    await run_scan(db, a, [item(1)], T0, collections=colls(("11", "A")))
    await run_scan(db, b, [item(1)], T0, collections=colls(("11", "B")))
    names = sorted((await db.execute(select(SavedCollection.name))).scalars())
    assert names == ["A", "B"]
