"""SPEC-001 T-4b: önizleme, onay, parti durum makinesi, start/stop/cancel, `run_seq`, `stale` ve koruma kuralı.

AC: C5..C9, C22, C23, C39, C40, C44, C45, C49, C50, C57 (start yarısı), S5, S9..S11, S14, S16; [W] S21, U7 (K-22).
Spec §9 bu testlerin bir kısmını `test_cleanup.py` adıyla (uç nokta düzeyi, T-5/T-6) listeler; burada aynı davranış
servis düzeyinde, aynı test adlarıyla pinlenir (T-4a ile aynı yöntem).
Sahte saat: tüm servis fonksiyonları `now` alır; gerçek bekleme yoktur (tek istisna: eşzamanlı preview testindeki
veritabanı kilidi bekleme payı).
Ortak fixture: tests/fixtures/is_protected_cases.json (Python kolu, SQL kolu; eklenti T-10a'da okur).
"""
import asyncio
import itertools
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import MappingProxyType

import pytest
from sqlalchemy import func, null as sql_null, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, CleanupWriteGrant, SavedCollection, SavedTarget,
)
from app.models.notification import Notification
from app.models.session import Session
from app.services import cleanup_batch as cb
from app.services import cleanup_limits as cl
from app.services import cleanup_scan as sc
from app.services.cleanup_scan import CleanupError

T0 = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)        # İstanbul 15:00: sessiz saat dışı
MIN = timedelta(minutes=1)
H = timedelta(hours=1)
DAY = timedelta(days=1)
FIXTURE = Path(__file__).parent / "fixtures" / "is_protected_cases.json"
A_ID, B_ID, X_ID = "17890000000000001", "17890000000000002", "17890000000000003"


def mk_limits(**ov):
    values = dict(cl.DEFAULTS)
    values.update(ov)
    return cl.Limits(MappingProxyType(values), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


L = mk_limits()


def ref(i):
    return str(3500000000000000000 + i)


async def err(coro):
    with pytest.raises(CleanupError) as e:
        await coro
    return e.value


async def mk_profile(make_session, username="me", **kw):
    kw.setdefault("allow_unsave", True)
    kw.setdefault("unsave_enabled_at", T0 - 30 * DAY)           # ısınma bitmiş
    return await make_session(username=username, **kw)


async def mk_inventory(db, s, n, *, now=T0, status="ok", collections=None, rows=None, w=False):
    """Doğrudan envanter: n satır, position = i-1, ref(i), sahip `user<i>`, tür i%3. `collections`: [(id, ad, protected)];
    `rows`: {i: SavedTarget alan geçersiz kılmaları}. `w=True` ya da `collections` verilmişse tarama W (per_collection)."""
    w = w or collections is not None
    scan = CleanupScan(session_id=s.id, kind="saved", status=status, started_at=now - H, finished_at=now - H + MIN,
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
            d["collection_ids"] = sql_null()                      # SQL NULL (JSON 'null' değil), add_page gibi
        return SavedTarget(**d)

    db.add_all([row(i) for i in range(1, n + 1)])
    await db.commit()
    return scan


def refs_payload(scan, *idx):
    return {"scan_id": scan.id, "select": "refs", "refs": [ref(i) for i in idx]}


def filter_payload(scan, flt=None, exclude=None):
    p = {"scan_id": scan.id, "select": "filter", "filter": flt or {}}
    if exclude is not None:
        p["exclude_refs"] = exclude
    return p


async def mk_done_batch(db, s, status="done", **kw):
    b = CleanupBatch(session_id=s.id, kind="saved", status=status, max_items_at_preview=500, expires_at=T0 - DAY,
                     **kw)
    db.add(b)
    await db.flush()
    return b


async def mk_items(db, s, batch, statuses, *, created_at=T0):
    """statuses: {i: durum}; her biri `batch` altında bir cleanup_items satırı."""
    rows = [CleanupItem(session_id=s.id, batch_id=batch.id, ref=ref(i), label=f"@user{i} · Cabc{i:06d}", status=st,
                        created_at=created_at) for i, st in statuses.items()]
    db.add_all(rows)
    await db.commit()
    return rows


async def drafted(db, s, scan, *idx, limits=L, now=T0):
    r = await cb.preview(db, s, refs_payload(scan, *idx), now, limits=limits)
    await db.commit()
    return r


async def confirmed(db, s, scan, *idx, limits=L, now=T0):
    r = await drafted(db, s, scan, *idx, limits=limits, now=now)
    await cb.confirm(db, s, r.batch_id, r.item_count, now, limits=limits)
    await db.commit()
    return r.batch_id


async def batch_of(db, batch_id):
    b = await db.get(CleanupBatch, batch_id)
    await db.refresh(b)
    return b


async def started(db, s, scan, *idx, limits=L, now=T0):
    bid = await confirmed(db, s, scan, *idx, limits=limits, now=now)
    r = await cb.start_batch(db, s, bid, None, now, limits=limits)
    await db.commit()
    return bid, r


async def anomalies(db, s):
    return list((await db.execute(select(Notification).where(
        Notification.session_id == s.id, Notification.kind == "cleanup_anomaly").order_by(Notification.id))).scalars())


# ══ AC-S21: koruma kuralı, ortak fixture ═════════════════════════════════════════

def fixture_cases():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_fixture_covers_the_eight_spec_rows():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = data["cases"]
    assert len({c["name"] for c in cases}) == len(cases)
    shapes = {(c["mode"], json.dumps(c["collection_ids"]), c["collections_unreadable"]) for c in cases}
    # spec tablosunun 8 satırı: [] ve null (her iki mod), okunamayan, boş değil/F, [A], [B], [A,B], [X]
    for need in (("per_collection", "[]", False), ("all_protected", "[]", False), ("per_collection", "null", False),
                 ("all_protected", "null", False), ("per_collection", "null", True), ("all_protected", f'["{B_ID}"]', False),
                 ("per_collection", f'["{A_ID}"]', False), ("per_collection", f'["{B_ID}"]', False),
                 ("per_collection", f'["{A_ID}", "{B_ID}"]', False), ("per_collection", f'["{X_ID}"]', False)):
        assert need in shapes, need
    for c in cases:
        assert c["allow"] == ([] if c["mode"] == "all_protected" else [B_ID])      # F'de allow her zaman boş


@pytest.mark.parametrize("case", fixture_cases(), ids=lambda c: c["name"])
def test_is_protected_table(case):
    """AC-S21 Python kolu: tablo satırı satırı."""
    got = cb.is_protected(case["collection_ids"], case["collections_unreadable"], frozenset(case["allow"]))
    assert got is case["protected"]


def test_is_protected_is_fail_closed_on_odd_input():
    """Bilinmeyen/garip girdi korunur; allow karşılaştırması kimlik dizesidir."""
    assert cb.is_protected([A_ID], False, {A_ID}) is False           # allow'daki kimlik korumasız
    assert cb.is_protected(["x"], False, {A_ID}) is True
    assert cb.is_protected([], True, {A_ID}) is True                 # okunamayan boş listeyi ezer


async def test_is_protected_sql_matches_table(db, make_session):
    """AC-S21 SQL kolu: aynı tablo `protected_clause` ile; null ve okunamayan satırlarda korunan + seçilebilir = toplam (R7 M1)."""
    s = await mk_profile(make_session)
    for mode, allow in (("all_protected", []), ("per_collection", [B_ID])):
        cases = [c for c in fixture_cases() if c["mode"] == mode]
        rows = {i + 1: {"collection_ids": c["collection_ids"], "collections_unreadable": c["collections_unreadable"]}
                for i, c in enumerate(cases)}
        scan = await mk_inventory(db, s, len(cases), rows=rows)
        clause = sc.protected_clause(allow)
        protected_refs = set((await db.execute(select(SavedTarget.media_id).where(
            SavedTarget.scan_id == scan.id, clause))).scalars())
        selectable = (await db.execute(select(func.count()).select_from(SavedTarget).where(
            SavedTarget.scan_id == scan.id, ~clause))).scalar_one()
        total = (await db.execute(select(func.count()).select_from(SavedTarget).where(
            SavedTarget.scan_id == scan.id))).scalar_one()
        assert protected_refs == {ref(i + 1) for i, c in enumerate(cases) if c["protected"]}, mode
        assert len(protected_refs) + selectable == total, mode
        await db.execute(update(CleanupScan).where(CleanupScan.id == scan.id).values(status="failed"))
        await db.commit()


async def test_fixture_allow_matches_context_derived_from_db(db, make_session):
    """Fixture'daki W `allow` (yalnız B), A korunuyor + B korumasız + X bilinmiyor dünyasından protection_context ile türer."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 1, collections=[(A_ID, "Aile", True), (B_ID, "Seyahat", False)])
    mode, allow = await sc.protection_context(db, scan.id)
    assert mode == "per_collection" and allow == frozenset({B_ID})
    for c in fixture_cases():
        assert frozenset(c["allow"]) == (allow if c["mode"] == "per_collection" else frozenset())


async def test_known_ids_seen_in_context_scan_or_later(db, make_session):
    """AC-S21 / R6 M-3: bilinen = bağlam taramasında ya da daha sonra görülmüş; parti bağlamı partinin scan_id'sidir (R6 M-2)."""
    s = await mk_profile(make_session)
    s0 = await mk_inventory(db, s, 1, now=T0 - 3 * DAY, collections=[("11", "eski", False)])     # 11: yalnız S0'da görüldü
    s1 = await mk_inventory(db, s, 1, now=T0 - 2 * DAY, collections=[("12", "orta", False)])     # 12: S1'de görüldü
    s2 = await mk_inventory(db, s, 1, now=T0 - DAY, collections=[("13", "yeni", False)])         # 13: S2'de görüldü
    assert s0.id < s1.id < s2.id
    _, allow1 = await sc.protection_context(db, s1.id)
    _, allow2 = await sc.protection_context(db, s2.id)
    assert allow1 == frozenset({"12", "13"})            # 13: S1'den sonraki taramada görüldü -> bilinir; 11 bilinmez
    assert allow2 == frozenset({"13"})                  # 12 yalnız S1'de görüldü: S2 bağlamında bilinmez (fail-closed)
    # parti bağlamı: partinin scan_id'si (S1) kullanılır, güncel (S2) değil (R6 M-2)
    b = await mk_done_batch(db, s, scan_id=s1.id)
    assert await cb.batch_protection_context(db, b) == ("per_collection", allow1)
    b.scan_id = None
    assert await cb.batch_protection_context(db, b) == ("all_protected", frozenset())            # tarama satırı yok -> F


# ══ AC-C23: durum makineleri ═════════════════════════════════════════════════════

def test_item_transitions_table():
    """§6.8 öğe tablosu: yalnız tabloda olan geçişler izinli; terminaller kapalı."""
    terminal_out = {"done", "already", "not_found", "protected", "failed"}
    allowed = {("pending", d) for d in ("pending", "done", "already", "not_found", "protected", "failed", "cancelled")}
    allowed |= {("cancelled", "done")}
    states = ("pending", "done", "already", "not_found", "protected", "failed", "cancelled")
    for src, dst in itertools.product(states, states):
        assert cb.item_transition_allowed(src, dst) is ((src, dst) in allowed), (src, dst)
    for t in terminal_out:
        assert not any(cb.item_transition_allowed(t, d) for d in states)
    assert not cb.item_transition_allowed("pending", "unknown")


def test_batch_transitions_table():
    """§6.8 parti tablosu; tablo dışı geçiş reddedilir (AC-C23)."""
    allowed = {
        ("draft", "confirmed"), ("draft", "cancelled"), ("draft", "expired"),
        ("confirmed", "running"), ("confirmed", "cancelled"), ("confirmed", "expired"),
        ("running", "stopped"), ("running", "done"), ("running", "cancelled"), ("running", "expired"),
        ("stopped", "running"), ("stopped", "done"), ("stopped", "cancelled"), ("stopped", "expired"),
    }
    states = ("draft", "confirmed", "running", "stopped", "done", "cancelled", "expired")
    for src, dst in itertools.product(states, states):
        if (src, dst) in allowed:
            cb.check_batch_transition(src, dst)
        else:
            with pytest.raises(cb.InvalidTransition):
                cb.check_batch_transition(src, dst)


def test_cancelled_recent_precheck_becomes_done():
    """AC-C23: iptal edilmiş öğeye `done`, `prechecked_at` son 120 sn içindeyse done (sınır dahil)."""
    assert cb.cancelled_result_decision(T0 - timedelta(seconds=119), T0) == "done"
    assert cb.cancelled_result_decision(T0 - timedelta(seconds=120), T0) == "done"


def test_cancelled_old_precheck_is_late_result():
    assert cb.cancelled_result_decision(T0 - timedelta(seconds=121), T0) == "late_result"
    assert cb.cancelled_result_decision(None, T0) == "late_result"               # hiç izin almamış


async def test_expiry_uses_coalesce(db, make_session):
    """AC-C23: 7 gün kuralı coalesce(last_progress_at, started_at, confirmed_at) üstündedir (T-4a run_retention)."""
    s = await mk_profile(make_session)
    only_confirmed = CleanupBatch(session_id=s.id, kind="saved", status="confirmed", max_items_at_preview=5,
                                  expires_at=T0, confirmed_at=T0 - 8 * DAY)
    db.add(only_confirmed)
    await db.commit()
    assert (await sc.run_retention(db, T0))["batches_expired"] == 1
    await db.refresh(only_confirmed)
    assert only_confirmed.status == "expired"
    s2 = await mk_profile(make_session, username="b")
    progressed = CleanupBatch(session_id=s2.id, kind="saved", status="stopped", max_items_at_preview=5, expires_at=T0,
                              confirmed_at=T0 - 20 * DAY, started_at=T0 - 20 * DAY, last_progress_at=T0 - 6 * DAY)
    db.add(progressed)
    await db.commit()
    assert (await sc.run_retention(db, T0))["batches_expired"] == 0
    await db.refresh(progressed)
    assert progressed.status == "stopped"


# ══ Önizleme: AC-C5, C8, C9, C39, S5, S9..S11, S14, S16, U7 ═══════════════════════

async def test_preview_is_dry_run_and_closes_old_drafts(db, make_session):
    """AC-C5: yalnız draft + plan_refs; cleanup_items yok; önceki taslaklar aynı işlemde cancelled; eski taslağın confirm'ü 409 not_draft."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 6)
    r1 = await cb.preview(db, s, refs_payload(scan, 1, 2, 3), T0, limits=L)
    await db.commit()
    b1 = await batch_of(db, r1.batch_id)
    assert b1.status == "draft" and b1.plan_refs == [ref(1), ref(2), ref(3)] and b1.item_count == 3
    assert b1.expires_at == T0 + 30 * MIN and b1.created_at == T0 and b1.scan_id == scan.id
    assert b1.max_items_at_preview == 500 and b1.run_seq == 0
    assert (await db.execute(select(func.count()).select_from(CleanupItem))).scalar_one() == 0
    assert r1.expires_at == T0 + 30 * MIN
    r2 = await cb.preview(db, s, refs_payload(scan, 4, 5), T0 + MIN, limits=L)
    await db.commit()
    assert (await batch_of(db, r1.batch_id)).status == "cancelled"
    assert (await batch_of(db, r2.batch_id)).status == "draft"
    e = await err(cb.confirm(db, s, r1.batch_id, 3, T0 + MIN, limits=L))
    assert (e.code, e.status) == ("not_draft", 409)
    drafts = (await db.execute(select(func.count()).select_from(CleanupBatch).where(CleanupBatch.status == "draft"))).scalar_one()
    assert drafts == 1


async def test_concurrent_preview_returns_409_not_500(db, db_engine, make_session):
    """AC-C5 (I-13, N-6): iki eşzamanlı preview'dan biri başarılı, diğeri 409 batch_active (UniqueViolation -> 409, 500 değil)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4)
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def second():
        async with maker() as d2:
            s2 = await d2.get(Session, s.id)
            try:
                await cb.preview(d2, s2, refs_payload(scan, 3, 4), T0, limits=L)
                await d2.commit()
                return "ok"
            except CleanupError as e:
                await d2.rollback()
                return (e.code, e.status)

    async with maker() as d1:
        s1 = await d1.get(Session, s.id)
        await cb.preview(d1, s1, refs_payload(scan, 1, 2), T0, limits=L)      # henüz commit yok: taslak indeksini tutuyor
        task = asyncio.create_task(second())
        await asyncio.sleep(1.0)                                              # ikincinin INSERT'te beklemesi için (DB kilidi)
        assert not task.done()
        await d1.commit()
        assert await asyncio.wait_for(task, 20) == ("batch_active", 409)
    drafts = (await db.execute(select(CleanupBatch.plan_refs).where(CleanupBatch.status == "draft"))).scalars().all()
    assert drafts == [[ref(1), ref(2)]]


async def test_preview_blocked_by_active_batch(db, make_session):
    """AC-C8: confirmed/running/stopped parti varken preview -> 409 batch_active."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4)
    for st in ("confirmed", "running", "stopped"):
        await db.execute(update(CleanupBatch).where(CleanupBatch.session_id == s.id).values(status="cancelled"))
        b = CleanupBatch(session_id=s.id, kind="saved", status=st, max_items_at_preview=5, expires_at=T0,
                         started_at=T0, last_seen_at=T0)
        db.add(b)
        await db.commit()
        e = await err(cb.preview(db, s, refs_payload(scan, 1), T0 + MIN, limits=L))
        assert (e.code, e.status) == ("batch_active", 409), st


async def test_preview_feature_off_and_other_profile_scan(db, make_session):
    off = await mk_profile(make_session, username="off", allow_unsave=False)
    scan_off = await mk_inventory(db, off, 2)
    e = await err(cb.preview(db, off, refs_payload(scan_off, 1), T0, limits=L))
    assert (e.code, e.status) == ("feature_off", 403)
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 2)
    e = await err(cb.preview(db, s, refs_payload(scan_off, 1), T0, limits=L))        # başkasının taraması
    assert (e.code, e.status) == ("scan_mismatch", 409)
    assert scan.id != scan_off.id


async def test_preview_rejects_scan_mismatch(db, make_session):
    """AC-S14: önizlemedeki scan_id güncel envanter değilse 409 scan_mismatch; hiç envanter yoksa no_scan; 24 saati aşan scan_stale (AC-S8)."""
    s = await mk_profile(make_session)
    e = await err(cb.preview(db, s, {"scan_id": 1, "select": "filter"}, T0, limits=L))
    assert (e.code, e.status) == ("no_scan", 409)
    old = await mk_inventory(db, s, 3, now=T0 - 5 * H)
    new = await mk_inventory(db, s, 3, now=T0 - H)
    e = await err(cb.preview(db, s, refs_payload(old, 1), T0, limits=L))
    assert (e.code, e.status) == ("scan_mismatch", 409)
    # bitiş anı + 24 sa sınırı: tam 24 sa geçerli, 24 sa 1 sn eski
    fin = new.finished_at
    assert (await cb.preview(db, s, refs_payload(new, 1), fin + DAY, limits=L)).item_count == 1
    e = await err(cb.preview(db, s, refs_payload(new, 1), fin + DAY + timedelta(seconds=1), limits=L))
    assert (e.code, e.status) == ("scan_stale", 409)


async def test_preview_refs_mode_unknown_refs(db, make_session):
    """AC-S9: refs modunda yalnız envanterdeki ref'ler; diğerleri unknown_refs. Sıra position'dır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    p = {"scan_id": scan.id, "select": "refs", "refs": [ref(4), ref(2), "999", ref(2), "123456"]}
    r = await cb.preview(db, s, p, T0, limits=L)
    assert r.item_count == 2 and r.unknown_refs == 2 and r.excluded == 0
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(2), ref(4)]           # position sırası, yineleme tek


async def test_preview_filter_mode_with_excludes(db, make_session):
    """AC-S10: aday küme = filtreye uyan envanter eksi exclude_refs; boş filtre tümünü seçer."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 9)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert r.item_count == 9
    r = await cb.preview(db, s, filter_payload(scan, {"media_type": "video"}, exclude=[ref(1)]), T0, limits=L)
    vids = [i for i in range(1, 10) if i % 3 == 1]                               # tür = ("image","video","carousel")[i % 3]
    assert r.item_count == len(vids) - 1                                         # ref(1) video ve hariç
    plan = (await batch_of(db, r.batch_id)).plan_refs
    assert plan == [ref(i) for i in vids if i != 1]
    r = await cb.preview(db, s, filter_payload(scan, {"q": " @USER5 "}), T0, limits=L)
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(5)]


@pytest.mark.parametrize("make,code,status", [
    (lambda sc_, mx: {}, "invalid", 422),                                                                   # scan_id eksik
    (lambda sc_, mx: {"select": "filter"}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": "5", "select": "filter"}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": True, "select": "filter"}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "nope"}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs"}, "invalid", 422),                                   # refs yok
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": ["abc"]}, "invalid", 422),                  # geçersiz ref
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": [1]}, "invalid", 422),                      # sayı ref
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": "1"}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": ["1"], "filter": {}}, "invalid_selection", 422),   # karışık
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": ["1"], "exclude_refs": []}, "invalid_selection", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "refs": ["1"]}, "invalid_selection", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "refs", "refs": [str(n) for n in range(1, mx + 2)]}, "invalid_selection", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "exclude_refs": [str(n) for n in range(1, 5002)]}, "invalid_selection", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "exclude_refs": ["x"]}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "extra": 1}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "filter": {"zzz": 1}}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "filter": {"q": "50%"}}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "filter": {"media_type": "gif"}}, "invalid", 422),
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "filter": {"collection_id": "123"}}, "not_available", 422),   # AC-S5
    (lambda sc_, mx: {"scan_id": sc_, "select": "filter", "filter": {"collection_id": "1' OR '1'='1"}}, "invalid", 422),
])
async def test_preview_input_validation(db, make_session, make, code, status):
    """AC-S11 (+S5): karışık mod, tavan, geçersiz ref, scan_id eksik; AC-S5: koleksiyon filtresi Faz 1'de yok."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 3)
    lim = mk_limits(**{"batch.max_items": 3})
    e = await err(cb.preview(db, s, make(scan.id, 3), T0, limits=lim))
    assert (e.code, e.status) == (code, status)
    assert (await db.execute(select(func.count()).select_from(CleanupBatch))).scalar_one() == 0     # taslak oluşmadı
    if code == "invalid":
        assert all(isinstance(f, str) and len(f) < 41 for f in e.extra.get("fields", []))


async def test_preview_empty_collection_filter_means_no_filter(db, make_session):
    """AC-S5/S14: boş `collection_id` ve boş `media_type` filtre değildir."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4)
    r = await cb.preview(db, s, filter_payload(scan, {"collection_id": "", "media_type": "", "q": "  "}), T0, limits=L)
    assert r.item_count == 4


async def test_preview_cap_truncates_to_batch_max(db, make_session):
    """AC-C9: 1200 öğelik seçim -> item_count=500, truncated, remaining=700; max_items=100 -> 100; 0 öğe -> batch_id=null."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 1200)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert (r.item_count, r.truncated, r.remaining) == (500, True, 700)
    b = await batch_of(db, r.batch_id)
    assert len(b.plan_refs) == 500 and b.plan_refs[0] == ref(1) and b.plan_refs[-1] == ref(500)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=mk_limits(**{"batch.max_items": 100}))
    assert (r.item_count, r.truncated, r.remaining) == (100, True, 1100)
    assert (await batch_of(db, r.batch_id)).max_items_at_preview == 100
    r = await cb.preview(db, s, filter_payload(scan, exclude=[]), T0, limits=mk_limits(**{"batch.max_items": 5000}))
    assert r.item_count == 500                                                    # dosya ne derse sert tavan 500


async def test_preview_zero_items_creates_no_batch_and_keeps_drafts(db, make_session):
    """AC-C9: 0 öğe -> batch_id=null, item_count=0; mevcut taslağa dokunmaz (§6.8: preview yalnız öğe > 0 iken taslak üretir)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 3)
    first = await drafted(db, s, scan, 1)
    r = await cb.preview(db, s, filter_payload(scan, {"q": "nobody"}), T0 + MIN, limits=L)
    assert r.batch_id is None and r.item_count == 0 and r.truncated is False and r.remaining == 0
    r = await cb.preview(db, s, {"scan_id": scan.id, "select": "refs", "refs": []}, T0 + MIN, limits=L)
    assert r.batch_id is None and r.item_count == 0
    assert (await batch_of(db, first.batch_id)).status == "draft"


async def test_preview_excludes_processed_and_protected_refs(db, make_session):
    """AC-C39, S16: tarama başlangıcından sonra pending/done/already/not_found/protected olanlar ve koruma kuralına
    göre korunanlar `excluded`; `failed`/`cancelled` yeniden aday. `excluded_protected` ⊆ `excluded`."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 12, rows={8: {"collection_ids": [A_ID]}, 11: {"collections_unreadable": True}})
    old = await mk_done_batch(db, s)
    await mk_items(db, s, old, {1: "pending", 2: "done", 3: "already", 4: "not_found", 5: "protected",
                                6: "failed", 7: "cancelled"})
    await mk_items(db, s, old, {9: "done"}, created_at=scan.started_at - MIN)        # taramadan ÖNCE: dışlanmaz
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    # dışlanan: 1..5 (işlenmiş), 8 (F modunda koleksiyonlu), 11 (okunamayan) -> 7; korunan: 5, 8, 11 -> 3
    assert r.excluded == 7 and r.excluded_protected == 3
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(i) for i in (6, 7, 9, 10, 12)]
    assert r.item_count == 5 and r.excluded_protected <= r.excluded
    # refs modunda korunan gönderilirse partiye girmez, excluded_protected sayılır
    r = await cb.preview(db, s, refs_payload(scan, 8, 6, 5), T0, limits=L)
    assert r.item_count == 1 and r.excluded == 2 and r.excluded_protected == 2
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(6)]


async def test_inventory_and_preview_filter_identical(db, make_session):
    """AC-S14: aynı filtre için envanter `total` = filter modundaki aday sayısı (excluded dahil); aynı fonksiyonlar."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 30, rows={3: {"collection_ids": [A_ID]}, 6: {"is_ad": True}})
    old = await mk_done_batch(db, s)
    await mk_items(db, s, old, {4: "done", 7: "pending"})
    for flt in ({}, {"media_type": "video"}, {"media_type": "ad"}, {"q": "user1"}, {"q": "user1", "media_type": "image"}):
        inv = await sc.inventory(db, s, T0, **flt)
        r = await cb.preview(db, s, filter_payload(scan, flt), T0, limits=L)
        assert r.item_count + r.remaining + r.excluded == inv["total"], flt
        assert inv["protected_total"] >= 0


async def test_preview_estimate_matches_gate(db, make_session):
    """AC-C43: safe, ısınma bitmiş, 500 öğe -> days=3, starts=13; ısınmanın ilk 72 saatinde 100 öğe -> starts=3."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 500)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert r.estimate == {"hourly": 40, "daily": 200, "days": 3, "starts": 13}
    s2 = await mk_profile(make_session, username="b", unsave_enabled_at=T0 - H)
    scan2 = await mk_inventory(db, s2, 100)
    r2 = await cb.preview(db, s2, filter_payload(scan2), T0, limits=L)
    assert r2.estimate["starts"] == 3 and r2.estimate["daily"] == 66


async def test_draft_expires_after_30_minutes(db, make_session):
    """§6.8: draft -> expired 30 dk sonra (sınır dahil); beat/preview `expire_drafts` ile; yalnız taslaklar."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 3)
    r = await drafted(db, s, scan, 1)
    assert await cb.expire_drafts(db, T0 + 30 * MIN - timedelta(seconds=1)) == 0
    assert (await batch_of(db, r.batch_id)).status == "draft"
    assert await cb.expire_drafts(db, T0 + 30 * MIN) == 1
    await db.commit()
    b = await batch_of(db, r.batch_id)
    assert b.status == "expired" and b.finished_at == T0 + 30 * MIN
    assert await cb.expire_drafts(db, T0 + DAY) == 0                         # idempotent; expired tekrar sayılmaz
    s2 = await mk_profile(make_session, username="b")
    act = CleanupBatch(session_id=s2.id, kind="saved", status="confirmed", max_items_at_preview=5, expires_at=T0 - DAY)
    db.add(act)
    await db.commit()
    assert await cb.expire_drafts(db, T0 + DAY) == 0 and (await batch_of(db, act.id)).status == "confirmed"


# ── [W] K-22: önizleme özeti ve parti listesinde koleksiyon adları ────────────────

W_COLLS = [(A_ID, "Aile", True), (B_ID, "Seyahat", False)]
W_ROWS = {2: {"collection_ids": [B_ID]}, 3: {"collection_ids": [A_ID]}, 4: {"collection_ids": [A_ID, B_ID]},
          5: {"collection_ids": [X_ID]}, 6: {"collection_ids": None}, 7: {"collection_ids": [B_ID]}}


async def test_preview_w_mode_in_unprotected_collections(db, make_session):
    """AC-U7 / K-22 / S21: W'de korumasız (bilinen) koleksiyondaki gönderiler seçilebilir ve sayılır; korunan/bilinmeyen dışlanır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 8, collections=W_COLLS, rows=W_ROWS)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    # 3 (A), 4 (A,B), 5 (X bilinmeyen) korunur; kalan: 1, 2, 6, 7, 8; koleksiyonda duran (korumasız B): 2, 7
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(i) for i in (1, 2, 6, 7, 8)]
    assert r.excluded == 3 and r.excluded_protected == 3
    assert r.in_unprotected_collections == 2
    # refs modu da aynı; yalnız korumasız koleksiyondaki seçim sayılır
    r = await cb.preview(db, s, refs_payload(scan, 2, 3), T0, limits=L)
    assert r.item_count == 1 and r.in_unprotected_collections == 1 and r.excluded_protected == 1


async def test_preview_f_mode_has_no_unprotected_collections(db, make_session):
    """F'de allow=∅: koleksiyonlu her gönderi korunur; K her zaman 0."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 8, rows=W_ROWS)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(1), ref(6), ref(8)]
    assert r.excluded_protected == 5 and r.in_unprotected_collections == 0


async def test_preview_uses_current_inventory_context_after_protection_change(db, make_session):
    """K-22 / R7 L6: korumayı kaldırma bir sonraki önizlemede aday yapar; korumaya alma anında dışlar (ayar her çağrıda güncel)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4, collections=W_COLLS, rows={2: {"collection_ids": [A_ID]}})
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(1), ref(3), ref(4)]
    await db.execute(update(SavedCollection).where(SavedCollection.collection_id == A_ID).values(protected=False))
    await db.commit()
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    assert (await batch_of(db, r.batch_id)).plan_refs == [ref(1), ref(2), ref(3), ref(4)]
    assert r.in_unprotected_collections == 1


async def test_batch_items_draft_from_plan_with_collection_names(db, make_session):
    """AC-U7 / K-22: `batches/{id}/items` taslakta plan_refs'ten; W'de satır başına koleksiyon adları, F'de []."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 8, collections=W_COLLS, rows=W_ROWS)
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    out = await cb.batch_items(db, s, r.batch_id)
    assert out["total"] == 5
    byref = {i["ref"]: i for i in out["items"]}
    assert [i["ref"] for i in out["items"]] == [ref(i) for i in (1, 2, 6, 7, 8)]
    assert byref[ref(2)]["collections"] == [{"name": "Seyahat", "id_suffix": None}]
    assert byref[ref(1)]["collections"] == [] and byref[ref(6)]["collections"] == []
    assert byref[ref(2)]["label"] == "@user2 · Cabc000002" and byref[ref(2)]["shortcode"] == "Cabc000002"
    assert set(byref[ref(2)]) == {"ref", "label", "status", "shortcode", "thumbnail_url", "collections"}
    # F modu: ad hiç gösterilmez
    s2 = await mk_profile(make_session, username="f")
    scan2 = await mk_inventory(db, s2, 3)
    r2 = await cb.preview(db, s2, filter_payload(scan2), T0, limits=L)
    assert all(i["collections"] == [] for i in (await cb.batch_items(db, s2, r2.batch_id))["items"])


async def test_batch_items_id_suffix_only_for_duplicate_names(db, make_session):
    """R6 L-7: aynı adlı koleksiyonlarda kimliğin son 4 hanesi; tekil adda null."""
    s = await mk_profile(make_session)
    colls = [("17890000000000001", "Aile", False), ("17890000000000004", "Aile", False), (B_ID, "Seyahat", False)]
    scan = await mk_inventory(db, s, 3, collections=colls, rows={
        1: {"collection_ids": ["17890000000000001"]}, 2: {"collection_ids": ["17890000000000004"]},
        3: {"collection_ids": [B_ID]}})
    r = await cb.preview(db, s, filter_payload(scan), T0, limits=L)
    items = (await cb.batch_items(db, s, r.batch_id))["items"]
    assert [i["collections"] for i in items] == [
        [{"name": "Aile", "id_suffix": "0001"}], [{"name": "Aile", "id_suffix": "0004"}],
        [{"name": "Seyahat", "id_suffix": None}]]


async def test_batch_items_paging_status_filter_and_idor(db, make_session):
    """§7.8: limit/offset, status süzgeci, onaydan sonra cleanup_items'tan; başkasının partisi 404; limit sınırı."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 120)
    bid = await confirmed(db, s, scan, *range(1, 121))
    page = await cb.batch_items(db, s, bid, limit=50, offset=100)
    assert page["total"] == 120 and [i["ref"] for i in page["items"]] == [ref(i) for i in range(101, 121)]
    assert all(i["status"] == "pending" for i in page["items"])
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == bid, CleanupItem.ref == ref(5)).values(status="done"))
    await db.commit()
    done = await cb.batch_items(db, s, bid, status="done")
    assert done["total"] == 1 and done["items"][0]["ref"] == ref(5)
    assert (await cb.batch_items(db, s, bid, status="pending"))["total"] == 119
    for bad in ({"limit": 0}, {"limit": 51}, {"offset": -1}, {"status": "weird"}):
        e = await err(cb.batch_items(db, s, bid, **bad))
        assert (e.code, e.status) == ("invalid", 422), bad
    other = await mk_profile(make_session, username="other")
    e = await err(cb.batch_items(db, other, bid))
    assert (e.code, e.status) == ("not_found", 404)


# ══ Onay: AC-C6, C7, C8, C22 (§7.6) ═══════════════════════════════════════════════

async def test_confirm_creates_items_from_plan_refs(db, make_session):
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 6, rows={3: {"owner_username": None}})
    r = await drafted(db, s, scan, 3, 1, 2)
    res = await cb.confirm(db, s, r.batch_id, 3, T0 + 5 * MIN, limits=L)
    await db.commit()
    assert (res.batch_id, res.status, res.queued) == (r.batch_id, "confirmed", 3)
    b = await batch_of(db, r.batch_id)
    assert b.status == "confirmed" and b.confirmed_at == T0 + 5 * MIN
    items = (await db.execute(select(CleanupItem).where(CleanupItem.batch_id == b.id).order_by(CleanupItem.id))).scalars().all()
    assert [(i.ref, i.status, i.action, i.attempts) for i in items] == [(ref(i), "pending", "unsave", 0) for i in (1, 2, 3)]
    assert [i.label for i in items] == ["@user1 · Cabc000001", "@user2 · Cabc000002", "Cabc000003"]
    assert all(i.session_id == s.id and i.created_at == T0 + 5 * MIN for i in items)


@pytest.mark.parametrize("bad,code,status", [(2, "count_mismatch", 422), (4, "count_mismatch", 422),
                                             (0, "count_mismatch", 422), ("3", "invalid", 422), (True, "invalid", 422),
                                             (3.0, "invalid", 422), (None, "invalid", 422), ([3], "invalid", 422)])
async def test_confirm_count_mismatch(db, make_session, bad, code, status):
    """AC-C6: N-1 ve N+1 dahil -> 422 count_mismatch, öğe oluşmaz; string "N" -> 422 invalid."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    r = await drafted(db, s, scan, 1, 2, 3)
    e = await err(cb.confirm(db, s, r.batch_id, bad, T0, limits=L))
    assert (e.code, e.status) == (code, status)
    assert (await db.execute(select(func.count()).select_from(CleanupItem))).scalar_one() == 0
    assert (await batch_of(db, r.batch_id)).status == "draft"


async def test_confirm_state_and_expiry_errors(db, make_session):
    """§7.6: sahiplik 404; draft değil 409 not_draft; süresi dolmuş 410 expired (29:59 geçerli, 30:00 dolmuş)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    other = await mk_profile(make_session, username="other")
    r = await drafted(db, s, scan, 1, 2)
    e = await err(cb.confirm(db, other, r.batch_id, 2, T0, limits=L))
    assert (e.code, e.status) == ("not_found", 404)
    e = await err(cb.confirm(db, s, 999999, 2, T0, limits=L))
    assert (e.code, e.status) == ("not_found", 404)
    e = await err(cb.confirm(db, s, r.batch_id, 2, T0 + 30 * MIN, limits=L))
    assert (e.code, e.status) == ("expired", 410)
    res = await cb.confirm(db, s, r.batch_id, 2, T0 + 30 * MIN - timedelta(seconds=1), limits=L)
    assert res.status == "confirmed"
    await db.commit()
    e = await err(cb.confirm(db, s, r.batch_id, 2, T0, limits=L))                    # zaten confirmed
    assert (e.code, e.status) == ("not_draft", 409)
    # beat ile expired yapılmış taslak: 410 expired (not_draft değil)
    r2 = await mk_done_batch(db, s, status="expired", item_count=1, plan_refs=[ref(1)], scan_id=scan.id)
    await db.commit()
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == r.batch_id).values(status="cancelled"))
    await db.commit()
    e = await err(cb.confirm(db, s, r2.id, 1, T0, limits=L))
    assert (e.code, e.status) == ("expired", 410)


async def test_confirm_plan_changed(db, make_session):
    """AC-C7, C22: güncel envanter taraması değil / scan_id null / tavan düşürüldü -> 409 plan_changed."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 6)
    r = await drafted(db, s, scan, 1, 2, 3)
    # tavan düşürülmüş
    e = await err(cb.confirm(db, s, r.batch_id, 3, T0, limits=mk_limits(**{"batch.max_items": 2})))
    assert (e.code, e.status) == ("plan_changed", 409)
    # scan_id null (saklama görevi tarama satırını sildi)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == r.batch_id).values(scan_id=None))
    await db.commit()
    e = await err(cb.confirm(db, s, r.batch_id, 3, T0, limits=L))
    assert (e.code, e.status) == ("plan_changed", 409)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == r.batch_id).values(scan_id=scan.id))
    await db.commit()
    # yeni tarama ok bitti -> eski taramaya bağlı taslak
    st = await sc.start_scan(db, s, T0, limits=L)
    await sc.add_page(db, s, st.scan_id, 1, [{"media_id": ref(1), "shortcode": "Cabc000001"}], T0, limits=L)
    await sc.finish_scan(db, s, st.scan_id, "ok", None, T0)
    await db.commit()
    e = await err(cb.confirm(db, s, r.batch_id, 3, T0, limits=L))
    assert (e.code, e.status) == ("plan_changed", 409)
    assert (await db.execute(select(func.count()).select_from(CleanupItem))).scalar_one() == 0
    # eski ve yeni arasında, finish öncesi (running tarama) envanter hâlâ eskidir

async def test_confirm_batch_active_and_feature_off(db, make_session):
    """AC-C8: etkin parti varken confirm -> 409 batch_active; kapalıyken 403 feature_off."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    r = await drafted(db, s, scan, 1, 2)
    act = CleanupBatch(session_id=s.id, kind="saved", status="stopped", max_items_at_preview=5, expires_at=T0,
                       started_at=T0, last_seen_at=T0)
    db.add(act)
    await db.commit()
    e = await err(cb.confirm(db, s, r.batch_id, 2, T0, limits=L))
    assert (e.code, e.status) == ("batch_active", 409)
    s.allow_unsave = False
    await db.commit()
    e = await err(cb.confirm(db, s, r.batch_id, 2, T0, limits=L))
    assert (e.code, e.status) == ("feature_off", 403)


# ══ Start / Stop / run_seq: AC-C40, C44, C49, C50, C57 ═══════════════════════════

async def test_start_stop_state_machine(db, make_session):
    """AC-C40: start -> running; started_at = last_seen_at = now; run_seq+1; user_stop -> stopped; yeniden Başlat yeni run_seq."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid = await confirmed(db, s, scan, 1, 2, 3)
    r = await cb.start_batch(db, s, bid, None, T0 + MIN, limits=L)
    await db.commit()
    assert (r.batch_id, r.status, r.run_seq, r.started_at) == (bid, "running", 1, T0 + MIN)
    b = await batch_of(db, bid)
    assert (b.status, b.started_at, b.last_seen_at, b.stale_after_s, b.last_stop_reason) == ("running", T0 + MIN, T0 + MIN, None, None)
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + 2 * MIN)
    await db.commit()
    assert (st.status, st.last_stop_reason, st.applied) == ("stopped", "user_stop", True)
    r2 = await cb.start_batch(db, s, bid, None, T0 + 3 * MIN, limits=L)
    await db.commit()
    assert r2.run_seq == 2
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason, b.last_seen_at, b.started_at) == ("running", None, T0 + 3 * MIN, T0 + 3 * MIN)


async def test_start_refused_for_non_startable_and_foreign(db, make_session):
    """AC-C50: draft/done/cancelled/expired -> 409 not_startable; başkasının partisi 404; kapalıyken 403."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    d = await drafted(db, s, scan, 1)
    e = await err(cb.start_batch(db, s, d.batch_id, None, T0, limits=L))
    assert (e.code, e.status) == ("not_startable", 409)
    for st in ("done", "cancelled", "expired"):
        b = await mk_done_batch(db, s, status=st)
        await db.commit()
        e = await err(cb.start_batch(db, s, b.id, None, T0, limits=L))
        assert (e.code, e.status) == ("not_startable", 409), st
    other = await mk_profile(make_session, username="o")
    e = await err(cb.start_batch(db, other, d.batch_id, None, T0, limits=L))
    assert (e.code, e.status) == ("not_found", 404)
    s.allow_unsave = False
    await db.commit()
    e = await err(cb.start_batch(db, s, d.batch_id, None, T0, limits=L))
    assert (e.code, e.status) == ("feature_off", 403)


async def test_start_not_now_when_gate_not_ready(db, make_session):
    """AC-C40/C42: kapı hazır değilse 409 not_now + reason + next_allowed_at; parti değişmez."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid = await confirmed(db, s, scan, 1, 2, 3)
    # duraklatma
    s.cleanup_paused_until = T0 + 2 * H
    await db.commit()
    e = await err(cb.start_batch(db, s, bid, None, T0, limits=L))
    assert (e.code, e.status, e.extra["reason"]) == ("not_now", 409, "paused")
    assert datetime.fromisoformat(e.extra["next_allowed_at"]) == T0 + 2 * H
    s.cleanup_paused_until = None
    await db.commit()
    # sessiz saat (İstanbul 02:00 = 23:00 UTC) -> sonraki 08:00 İstanbul = 05:00 UTC
    q = datetime(2026, 11, 9, 23, 0, tzinfo=timezone.utc)
    e = await err(cb.start_batch(db, s, bid, None, q, limits=L))
    assert (e.code, e.extra["reason"]) == ("not_now", "quiet_hours")
    assert datetime.fromisoformat(e.extra["next_allowed_at"]) == datetime(2026, 11, 10, 5, 0, tzinfo=timezone.utc)
    # saatlik sınır dolu: 40 izin, 10 dk önce
    item = (await db.execute(select(CleanupItem).where(CleanupItem.batch_id == bid).limit(1))).scalar_one()
    db.add_all([CleanupWriteGrant(session_id=s.id, item_id=item.id, granted_at=T0 - 10 * MIN) for _ in range(40)])
    await db.commit()
    e = await err(cb.start_batch(db, s, bid, None, T0, limits=L))
    assert (e.code, e.extra["reason"]) == ("not_now", "limit")
    assert datetime.fromisoformat(e.extra["next_allowed_at"]) == T0 + 50 * MIN
    assert (await batch_of(db, bid)).status == "confirmed"


async def test_batch_idempotency_and_stopped_to_done(db, make_session):
    """AC-C50: running'e start 200 (değişiklik yok); stopped'a stop 200, ilk neden korunur; son pending terminale geçince done."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, r1 = await started(db, s, scan, 1, 2)
    again = await cb.start_batch(db, s, bid, None, T0 + 2 * MIN, limits=L)
    assert again.run_seq == r1.run_seq == 1 and again.started_at == T0
    assert (await batch_of(db, bid)).last_seen_at == T0                       # idempotent: değişiklik yok
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + 3 * MIN)
    assert st.applied is True
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + 4 * MIN)
    assert (st.status, st.last_stop_reason, st.applied) == ("stopped", "user_stop", False)
    # bekleyen var -> done olmaz; hepsi terminale geçince done
    assert await cb.complete_if_drained(db, bid, T0 + 5 * MIN) is False
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == bid).values(status="done"))
    await db.commit()
    assert await cb.complete_if_drained(db, bid, T0 + 6 * MIN) is True
    await db.commit()
    b = await batch_of(db, bid)
    assert b.status == "done" and b.finished_at == T0 + 6 * MIN
    assert await cb.complete_if_drained(db, bid, T0 + 7 * MIN) is False        # idempotent


async def test_running_batch_completes_when_drained(db, make_session):
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 3)
    bid, _ = await started(db, s, scan, 1)
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == bid).values(status="already"))
    await db.commit()
    assert await cb.complete_if_drained(db, bid, T0 + MIN) is True


async def test_stop_on_confirmed_is_noop(db, make_session):
    """AC-C50 (R4 L-3): confirmed/done/cancelled/expired/draft'a stop 200, değişiklik yok; geri almak için cancel."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid = await confirmed(db, s, scan, 1)
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + MIN)
    assert (st.status, st.last_stop_reason, st.applied) == ("confirmed", None, False)
    assert (await batch_of(db, bid)).status == "confirmed"
    for status in ("done", "cancelled", "expired", "draft"):
        b = await mk_done_batch(db, s, status=status)
        await db.commit()
        st = await cb.stop_batch(db, s, b.id, {"reason": "user_stop"}, T0 + MIN)
        assert (st.status, st.applied) == (status, False)
    other = await mk_profile(make_session, username="o")
    e = await err(cb.stop_batch(db, other, bid, {"reason": "user_stop"}, T0))
    assert (e.code, e.status) == ("not_found", 404)


async def test_start_on_stale_running_batch(db, make_session):
    """AC-C50 (R5 L-d): takılı running'e start: önce stopped(stale), sonra normal start. Hazırsa yeni run_seq; değilse 409 not_now."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1, 2)
    later = T0 + 11 * MIN                                                      # T = 600 sn aşıldı
    r = await cb.start_batch(db, s, bid, None, later, limits=L)
    await db.commit()
    assert r.run_seq == 2 and r.started_at == later
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason, b.last_seen_at) == ("running", None, later)
    # takılı olmayan running: 200, değişiklik yok
    r = await cb.start_batch(db, s, bid, None, later + MIN, limits=L)
    assert r.run_seq == 2
    # hazır değilse: stale stop uygulanır, sonra 409 not_now
    s.cleanup_paused_until = later + 5 * H
    await db.commit()
    e = await err(cb.start_batch(db, s, bid, None, later + 12 * MIN, limits=L))
    assert (e.code, e.status, e.extra["reason"]) == ("not_now", 409, "paused")
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason, b.run_seq) == ("stopped", "stale", 2)


async def test_start_resets_stale_after_s(db, make_session):
    """AC-C50 (I-15): start `stale_after_s`'i null'a çeker (önceki çalıştırmanın eşiği yeni çalıştırmaya taşınmaz)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == bid).values(stale_after_s=1800))
    await db.commit()
    await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + MIN)
    await cb.start_batch(db, s, bid, None, T0 + 2 * MIN, limits=L)
    await db.commit()
    assert (await batch_of(db, bid)).stale_after_s is None


async def test_start_refused_until_extension_updated_after_mutation_unrecognised(db, make_session):
    """AC-C57 (start yarısı): stopped_ext_version doluyken ext_version yok / ≤ ise 409 extension_update_required (parti stopped kalır)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    b = await batch_of(db, bid)
    assert await cb.halt_batch(db, b, "mutation_unrecognised", T0 + MIN, ext_version="2.9.0") is True
    await db.commit()
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason, b.stopped_ext_version) == ("stopped", "mutation_unrecognised", "2.9.0")
    for ver in (None, "2.9", "2.9.0", "2.8.9", "1.99.0"):
        e = await err(cb.start_batch(db, s, bid, ver, T0 + 2 * MIN, limits=L))
        assert (e.code, e.status) == ("extension_update_required", 409), ver
    assert (await batch_of(db, bid)).status == "stopped"
    for bad in ("x", "2.9.0.0.0", "2..9", 5):
        e = await err(cb.start_batch(db, s, bid, bad, T0 + 2 * MIN, limits=L))
        assert (e.code, e.status) == ("invalid", 422), bad
    r = await cb.start_batch(db, s, bid, "2.10.0", T0 + 2 * MIN, limits=L)         # sayısal: 2.10.0 > 2.9.0
    assert r.status == "running" and r.run_seq == 2


async def test_old_run_seq_is_refused_after_restart(db, make_session):
    """AC-C49: eski çalıştırmanın run_seq'i yeni çalıştırmayı durduramaz (eklenti stop'u)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, r1 = await started(db, s, scan, 1, 2)
    await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + MIN)
    r2 = await cb.start_batch(db, s, bid, None, T0 + 2 * MIN, limits=L)
    await db.commit()
    assert (r1.run_seq, r2.run_seq) == (1, 2)
    st = await cb.stop_batch(db, s, bid, {"reason": "circuit_breaker", "run_seq": 1, "viewer_id": "1001"}, T0 + 3 * MIN)
    assert (st.status, st.applied) == ("running", False)
    assert (await batch_of(db, bid)).status == "running"


async def test_extension_stop_with_old_run_seq_does_not_stop_new_run(db, make_session):
    """AC-C49 (S-23, K-3): eski run_seq -> 200 applied=false, durum/last_seen_at/last_stop_reason değişmez, cleanup_anomaly yazılır;
    güncel run_seq -> uygulanır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    before = await batch_of(db, bid)
    snap = (before.status, before.last_seen_at, before.last_stop_reason, before.run_seq)
    st = await cb.stop_batch(db, s, bid, {"reason": "tab_closed", "run_seq": 7, "viewer_id": "1001"}, T0 + 9 * MIN)
    await db.commit()
    assert st.applied is False and st.status == "running"
    after = await batch_of(db, bid)
    assert (after.status, after.last_seen_at, after.last_stop_reason, after.run_seq) == snap
    notes = await anomalies(db, s)
    assert len(notes) == 1 and notes[0].params["note_code"] == "run_seq_mismatch" and notes[0].params["batch_id"] == bid
    st = await cb.stop_batch(db, s, bid, {"reason": "circuit_breaker", "run_seq": 1, "viewer_id": "1001"}, T0 + 10 * MIN)
    assert (st.status, st.last_stop_reason, st.applied) == ("stopped", "circuit_breaker", True)
    assert len(await anomalies(db, s)) == 1


async def test_user_stop_always_applies(db, make_session):
    """AC-C49: arayüzden gelen user_stop run_seq taşımaz ve her zaman uygulanır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + MIN)
    assert (st.status, st.applied) == ("stopped", True)
    await cb.start_batch(db, s, bid, None, T0 + 2 * MIN, limits=L)
    st = await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0 + 3 * MIN)         # run_seq 2'de de uygulanır
    assert st.applied is True and not await anomalies(db, s)


async def test_ui_start_failed_stop_applies_with_current_run_seq(db, make_session):
    """AC-C50 (H-1 = S-26): arayüzün start_failed'ı güncel run_seq ile uygulanır (viewer_id gerekmez)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, r = await started(db, s, scan, 1)
    st = await cb.stop_batch(db, s, bid, {"reason": "start_failed", "run_seq": r.run_seq}, T0 + MIN)
    assert (st.status, st.last_stop_reason, st.applied) == ("stopped", "start_failed", True)


async def test_ui_start_failed_with_old_run_seq_not_applied(db, make_session):
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, r = await started(db, s, scan, 1)
    st = await cb.stop_batch(db, s, bid, {"reason": "start_failed", "run_seq": r.run_seq + 3}, T0 + MIN)
    assert (st.status, st.applied) == ("running", False)
    assert not await anomalies(db, s)                                           # eklentiden gelmedi (viewer_id yok)


@pytest.mark.parametrize("body", [
    {"reason": "circuit_breaker"},                                              # run_seq'siz yalnız user_stop (H-1)
    {"reason": "stale"},
    {"reason": "circuit_breaker", "run_seq": 1},                                # eklenti nedeni viewer_id ister
    {"reason": "bogus", "run_seq": 1, "viewer_id": "1"},
    {"reason": "user_stop", "extra": 1},                                        # extra='forbid'
    {"reason": "user_stop", "run_seq": "1"},
    {"reason": "user_stop", "run_seq": True},
    {"reason": "user_stop", "run_seq": -1},
    {"reason": "tab_closed", "run_seq": 1, "viewer_id": "abc"},
    {"reason": None},
    {},
    "user_stop",
])
async def test_stop_reason_enum_and_extra_forbid(db, make_session, body):
    """AC-C50 (I-10, H-1): reason §7.9.3 enum'u; gövde extra='forbid'; run_seq'siz gövdede yalnız user_stop (422 invalid)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    e = await err(cb.stop_batch(db, s, bid, body, T0 + MIN))
    assert (e.code, e.status) == ("invalid", 422)
    assert (await batch_of(db, bid)).status == "running"


async def test_circuit_breaker_without_run_seq_is_422(db, make_session):
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    e = await err(cb.stop_batch(db, s, bid, {"reason": "circuit_breaker"}, T0))
    assert (e.code, e.status) == ("invalid", 422)


async def test_run_seq_mismatch_does_not_touch_batch(db, make_session):
    """AC-C49 (R5 L-c): uyuşmazlık durumu, last_seen_at'i ve last_stop_reason'ı değiştirmez; yalnız o çağrının yanıtı etkilenir."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    await cb.stop_batch(db, s, bid, {"reason": "limit", "run_seq": 1, "viewer_id": "1001"}, T0 + MIN)     # stopped(limit)
    snap = await batch_of(db, bid)
    s1 = (snap.status, snap.last_seen_at, snap.last_stop_reason, snap.run_seq, snap.last_progress_at)
    st = await cb.stop_batch(db, s, bid, {"reason": "tab_closed", "run_seq": 99, "viewer_id": "1001"}, T0 + 5 * MIN)
    assert st.applied is False and st.last_stop_reason == "limit"
    snap = await batch_of(db, bid)
    assert (snap.status, snap.last_seen_at, snap.last_stop_reason, snap.run_seq, snap.last_progress_at) == s1


# ── stale: AC-C44 ──────────────────────────────────────────────────────────────────

async def mk_running(db, s, *, last_seen, started=None, stale_after_s=None, run_seq=1):
    b = CleanupBatch(session_id=s.id, kind="saved", status="running", max_items_at_preview=5, expires_at=T0,
                     started_at=started or last_seen, last_seen_at=last_seen, stale_after_s=stale_after_s, run_seq=run_seq)
    db.add(b)
    await db.commit()
    return b


async def test_stale_detected_on_every_endpoint(db, make_session):
    """AC-C44: preview, start, cancel ve status/next/precheck (stop_stale_for_session) işlem başında takılı partiyi stopped(stale) yapar."""
    s = await mk_profile(make_session)
    b = await mk_running(db, s, last_seen=T0 - 11 * MIN)
    assert await cb.stop_stale_for_session(db, s, T0, limits=L) is True
    await db.commit()
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "stale")
    assert await cb.stop_stale_for_session(db, s, T0, limits=L) is False          # idempotent
    # preview: takılı parti etkin sayılır ama önce stale olur; yine de etkin -> batch_active
    scan = await mk_inventory(db, s, 3)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(
        status="running", last_stop_reason=None, last_seen_at=T0 - 11 * MIN))
    await db.commit()
    e = await err(cb.preview(db, s, refs_payload(scan, 1), T0, limits=L))
    assert e.code == "batch_active"
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "stale")
    # cancel de önce stale'e bakar, sonra iptal eder
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(
        status="running", last_stop_reason=None, last_seen_at=T0 - 11 * MIN))
    await db.commit()
    res = await cb.cancel_batch(db, s, b.id, T0)
    assert res.cancelled is True and res.status == "cancelled"


async def test_restart_after_long_stop_is_not_stale(db, make_session):
    """AC-C44 (g; R4 C-1, S-22): limit ile duran parti 60 dk sonra yeniden başlatılır; hemen ardından gelen status/next/beat stale YAPMAZ."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1, 2)
    await cb.stop_batch(db, s, bid, {"reason": "limit", "run_seq": 1, "viewer_id": "1001"}, T0 + 5 * MIN)
    await db.commit()
    again = T0 + 65 * MIN
    await cb.start_batch(db, s, bid, None, again, limits=L)
    await db.commit()
    assert await cb.stop_stale_for_session(db, s, again + timedelta(seconds=5), limits=L) is False
    assert await sc.stop_stale_batches(db, again + timedelta(seconds=5), limits=L) == 0
    assert (await batch_of(db, bid)).status == "running"


async def test_started_but_never_seen_goes_stale(db, make_session):
    """AC-C44 (h): start'tan sonra hiç next gelmezse last_seen_at = start anı; started_at + T_eff sonra stopped(stale) (7 gün beklemez)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 5)
    bid, _ = await started(db, s, scan, 1)
    assert await cb.stop_stale_for_session(db, s, T0 + timedelta(seconds=600), limits=L) is False     # tam eşik: aşılmadı
    assert await cb.stop_stale_for_session(db, s, T0 + timedelta(seconds=601), limits=L) is True
    await db.commit()
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason) == ("stopped", "stale")


async def test_stale_uses_max_of_saved_and_current_T(db, make_session):
    """AC-C44 (L-1, I-7): T_eff = max(T_güncel, batch.stale_after_s)."""
    s = await mk_profile(make_session)
    b = await mk_running(db, s, last_seen=T0 - 11 * MIN, stale_after_s=1800)
    assert await cb.stop_stale_for_session(db, s, T0, limits=L) is False              # 660 < max(600, 1800)
    assert await cb.stop_stale_for_session(db, s, T0 + 20 * MIN, limits=L) is True     # 1860 > 1800
    s2 = await mk_profile(make_session, username="b")
    await mk_running(db, s2, last_seen=T0 - 11 * MIN, stale_after_s=None)
    big = mk_limits(**{"profiles.safe.unsave.delay_max": 400})                         # T = 2*400+120 = 920
    assert await cb.stop_stale_for_session(db, s2, T0, limits=big) is False
    assert await cb.stop_stale_for_session(db, s2, T0 + 5 * MIN, limits=big) is True   # 960 > 920
    assert b.id


async def test_stale_stop_is_conditional(db, make_session):
    """AC-C44 / I-6: stop_stale_for_session yalnız hâlâ running ve eşiği aşmış partiye dokunur."""
    s = await mk_profile(make_session)
    b = await mk_running(db, s, last_seen=T0 - 11 * MIN)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(last_seen_at=T0 - MIN))   # araya next girdi
    await db.commit()
    assert await cb.stop_stale_for_session(db, s, T0, limits=L) is False
    await db.refresh(b)
    assert b.status == "running"


# ══ Cancel: AC-C45 ════════════════════════════════════════════════════════════════

async def test_cancel_running_batch_single_step(db, make_session):
    """AC-C45: running'de cancel tek işlemde durdurur (user_stop mantığı), pending'leri cancelled yapar ve partiyi cancelled yapar;
    biten öğeler dokunulmaz; her iptal action_log'a yazılır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 6)
    bid, _ = await started(db, s, scan, 1, 2, 3, 4)
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == bid, CleanupItem.ref == ref(1)).values(status="done"))
    await db.execute(update(CleanupItem).where(CleanupItem.batch_id == bid, CleanupItem.ref == ref(2)).values(
        prechecked_at=T0 + MIN))                                                    # uçuştaki öğe
    await db.commit()
    res = await cb.cancel_batch(db, s, bid, T0 + 2 * MIN)
    await db.commit()
    assert (res.cancelled, res.status) == (True, "cancelled")
    b = await batch_of(db, bid)
    assert (b.status, b.last_stop_reason, b.finished_at) == ("cancelled", "user_stop", T0 + 2 * MIN)
    st = dict((await db.execute(select(CleanupItem.ref, CleanupItem.status).where(CleanupItem.batch_id == bid))).all())
    assert st == {ref(1): "done", ref(2): "cancelled", ref(3): "cancelled", ref(4): "cancelled"}
    inflight = (await db.execute(select(CleanupItem).where(CleanupItem.ref == ref(2)))).scalar_one()
    assert inflight.prechecked_at == T0 + MIN and inflight.done_at == T0 + 2 * MIN            # AC-C23 için damga korunur
    logs = (await db.execute(select(ActionLog).where(ActionLog.session_id == s.id).order_by(ActionLog.target_ref))).scalars().all()
    assert [(x.action_type, x.status, x.target_ref, x.ig_user_id) for x in logs] == [
        ("unsave", "cancelled", ref(i), None) for i in (2, 3, 4)]
    assert logs[0].target_label == "@user2 · Cabc000002"
    # sonraki cancel idempotent
    res = await cb.cancel_batch(db, s, bid, T0 + 3 * MIN)
    assert (res.cancelled, res.status) == (False, "cancelled")


async def test_cancel_confirmed_stopped_draft_and_terminal(db, make_session):
    """§6.8: confirmed/stopped/draft -> cancelled; done/expired/cancelled değişmez; stopped'ta ilk neden korunur; başkasının partisi 404."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 6)
    d = await drafted(db, s, scan, 5)
    res = await cb.cancel_batch(db, s, d.batch_id, T0)
    assert (res.cancelled, res.status) == (True, "cancelled")
    bid = await confirmed(db, s, scan, 1, 2)
    res = await cb.cancel_batch(db, s, bid, T0 + MIN)
    assert (res.cancelled, res.status) == (True, "cancelled")
    items = (await db.execute(select(CleanupItem.status).where(CleanupItem.batch_id == bid))).scalars().all()
    assert items == ["cancelled", "cancelled"]
    bid2, _ = await started(db, s, scan, 3)
    await cb.stop_batch(db, s, bid2, {"reason": "limit", "run_seq": 1, "viewer_id": "1001"}, T0 + 2 * MIN)
    await cb.cancel_batch(db, s, bid2, T0 + 3 * MIN)
    b2 = await batch_of(db, bid2)
    assert (b2.status, b2.last_stop_reason) == ("cancelled", "limit")
    for st in ("done", "expired"):
        x = await mk_done_batch(db, s, status=st)
        await db.commit()
        res = await cb.cancel_batch(db, s, x.id, T0)
        assert (res.cancelled, res.status) == (False, st)
    other = await mk_profile(make_session, username="o")
    e = await err(cb.cancel_batch(db, other, bid, T0))
    assert (e.code, e.status) == ("not_found", 404)


async def test_cancel_works_when_feature_off(db, make_session):
    """§7.5: cancel kapalıyken de çalışır."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 3)
    bid = await confirmed(db, s, scan, 1)
    s.allow_unsave = False
    await db.commit()
    assert (await cb.cancel_batch(db, s, bid, T0 + MIN)).status == "cancelled"


async def test_after_cancel_new_preview_and_batch_allowed(db, make_session):
    """İptalden sonra etkin parti kalmaz: yeni preview/confirm çalışır; iptal edilen ref'ler (cancelled) yeniden aday (AC-C39)."""
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4)
    bid = await confirmed(db, s, scan, 1, 2)
    await cb.cancel_batch(db, s, bid, T0 + MIN)
    await db.commit()
    r = await cb.preview(db, s, filter_payload(scan), T0 + 2 * MIN, limits=L)
    assert r.item_count == 4 and r.excluded == 0


async def test_hot_paths_do_not_delete(db, db_engine, make_session):
    """preview/confirm/start/stop/cancel hiçbir DELETE çalıştırmaz; eski taslak silinmez, cancelled yapılır."""
    from sqlalchemy import event
    s = await mk_profile(make_session)
    scan = await mk_inventory(db, s, 4)
    seen = []

    def on_sql(conn, cursor, statement, params, context, executemany):
        seen.append(statement.lstrip().upper())

    event.listen(db_engine.sync_engine, "before_cursor_execute", on_sql)
    try:
        d1 = await drafted(db, s, scan, 1)
        bid = await confirmed(db, s, scan, 2, 3)
        await cb.start_batch(db, s, bid, None, T0, limits=L)
        await cb.stop_batch(db, s, bid, {"reason": "user_stop"}, T0)
        await cb.cancel_batch(db, s, bid, T0)
        await db.commit()
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", on_sql)
    assert seen and not [q for q in seen if q.startswith("DELETE")]
    assert (await batch_of(db, d1.batch_id)).status == "cancelled"
