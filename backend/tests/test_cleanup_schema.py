"""SPEC-001 T-1: temizleme/kaydedilenler tabloları, kısıtlar, varsayılanlar, cascade (AC-C1, C20, C22; S20, S22 tablo düzeyi).

İzole instaanalytic_pytest veritabanında, modellerden `create_all` ile kurulan şemaya karşı koşar.
Migration up/down/up kanıtı `scripts/migrate-check.sh` ile verilir (AC-C36 elle kanıtı).
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models.action_log import ActionLog
from app.models.cleanup import (
    CleanupBatch, CleanupItem, CleanupScan, CleanupWriteGrant, SavedCollection, SavedTarget,
)
from app.models.session import Session

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)


async def _scan(db, s, **kw):
    sc = CleanupScan(session_id=s.id, kind="saved", status=kw.pop("status", "ok"), **kw)
    db.add(sc)
    await db.commit()
    return sc


async def _batch(db, s, status="draft", scan_id=None, **kw):
    b = CleanupBatch(session_id=s.id, kind="saved", status=status, scan_id=scan_id, item_count=0,
                     max_items_at_preview=100, expires_at=NOW, **kw)
    db.add(b)
    await db.commit()
    return b


def _target(s, scan, media_id="1234567890", **kw):
    return SavedTarget(session_id=s.id, scan_id=scan.id, position=0, media_id=media_id,
                       shortcode="Cabcde12345", **kw)


# ---- varsayılanlar (AC-C1 zemini) -----------------------------------------------------------

async def test_session_defaults(make_session):
    s = await make_session()
    assert s.allow_unsave is False
    assert s.unsave_enabled_at is None
    assert s.cleanup_paused_until is None
    assert s.cleanup_paused_reason is None


async def test_row_defaults(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    assert sc.collections_mode == "all_protected"
    assert (sc.pages, sc.items, sc.duplicates) == (0, 0, 0)
    t = _target(s, sc)
    c = SavedCollection(session_id=s.id, collection_id="17", name="x")
    b = await _batch(db, s)
    db.add_all([t, c])
    await db.commit()
    assert t.is_ad is False and t.collections_unreadable is False and t.collection_ids is None
    assert c.protected is True                       # fail-closed (K-22)
    assert b.run_seq == 0 and b.last_stop_reason is None and b.stopped_ext_version is None
    i = CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="99", label="@a · b", status="pending")
    db.add(i)
    await db.commit()
    assert i.attempts == 0


# ---- CHECK kısıtları -------------------------------------------------------------------------

@pytest.mark.parametrize("bad", ["", "abc", "12a", "1_2", "123_456", "-1", "1" * 26, " 1"])
async def test_media_id_check_rejects_non_pk(db, make_session, bad):
    s = await make_session()
    sc = await _scan(db, s)
    db.add(_target(s, sc, media_id=bad))
    with pytest.raises(DBAPIError) as e:       # 26 hane varchar(25)'e takılır (DataError), diğerleri CHECK'e
        await db.commit()
    assert len(bad) > 25 or "ck_saved_targets_media_id" in str(e.value)


async def test_media_id_check_accepts_25_digits(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    db.add(_target(s, sc, media_id="9" * 25))
    await db.commit()


@pytest.mark.parametrize("bad", ["", "x", "1" * 26, "1_2"])
async def test_item_ref_check(db, make_session, bad):
    s = await make_session()
    b = await _batch(db, s)
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref=bad, label="l", status="pending"))
    with pytest.raises(DBAPIError) as e:
        await db.commit()
    assert len(bad) > 25 or "ck_cleanup_items_ref" in str(e.value)


@pytest.mark.parametrize("bad", ["", "x", "1" * 26])
async def test_collection_id_check(db, make_session, bad):
    s = await make_session()
    db.add(SavedCollection(session_id=s.id, collection_id=bad, name="n"))
    with pytest.raises(DBAPIError) as e:
        await db.commit()
    assert len(bad) > 25 or "ck_saved_collections_collection_id" in str(e.value)


async def test_collection_name_length_and_not_empty(db, make_session):
    s = await make_session()
    sid = s.id
    db.add(SavedCollection(session_id=sid, collection_id="1", name="n" * 101))
    with pytest.raises(DBAPIError):
        await db.commit()
    await db.rollback()
    db.add(SavedCollection(session_id=sid, collection_id="1", name=""))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert "ck_saved_collections_name" in str(e.value)


@pytest.mark.parametrize("model_kwargs, ck", [
    ({"kind": "other", "status": "ok"}, "ck_cleanup_scans_kind"),
    ({"kind": "saved", "status": "weird"}, "ck_cleanup_scans_status"),
    ({"kind": "saved", "status": "ok", "collections_mode": "nope"}, "ck_cleanup_scans_collections_mode"),
    ({"kind": "saved", "status": "ok", "pages": -1}, "ck_cleanup_scans_pages"),
])
async def test_scan_checks(db, make_session, model_kwargs, ck):
    s = await make_session()
    db.add(CleanupScan(session_id=s.id, **model_kwargs))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert ck in str(e.value)


async def test_scan_modes_accepted(db, make_session):
    s = await make_session()
    for st in ("running", "ok", "partial", "failed", "blocked"):
        await _scan(db, s, status=st, collections_mode="per_collection")


@pytest.mark.parametrize("kw, ck", [
    ({"media_type": "audio"}, "ck_saved_targets_media_type"),
    ({"shortcode": "ab"}, "ck_saved_targets_shortcode"),
    ({"owner_username": "UPPER"}, "ck_saved_targets_owner_username"),
])
async def test_target_checks(db, make_session, kw, ck):
    s = await make_session()
    sc = await _scan(db, s)
    t = _target(s, sc)
    for k, v in kw.items():
        setattr(t, k, v)
    db.add(t)
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert ck in str(e.value)


async def test_target_valid_media_types_and_ad(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    for n, mt in enumerate((None, "image", "video", "carousel")):
        db.add(_target(s, sc, media_id=str(100 + n), media_type=mt))
    db.add(_target(s, sc, media_id="200", is_ad=True, owner_username="a.b_c"))
    await db.commit()


async def test_item_status_includes_protected_and_rejects_unknown(db, make_session):
    s = await make_session()
    b = await _batch(db, s)
    for n, st in enumerate(("pending", "done", "already", "not_found", "protected", "failed", "cancelled")):
        db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref=str(n), label="l", status=st))
    await db.commit()
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="77", label="l", status="bogus"))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert "ck_cleanup_items_status" in str(e.value)


async def test_item_attempts_range(db, make_session):
    s = await make_session()
    b = await _batch(db, s)
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="1", label="l", status="pending", attempts=4))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert "ck_cleanup_items_attempts" in str(e.value)


async def test_batch_checks(db, make_session):
    s = await make_session()
    sid = s.id
    db.add(CleanupBatch(session_id=sid, kind="saved", status="nope", item_count=0, max_items_at_preview=1, expires_at=NOW))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert "ck_cleanup_batches_status" in str(e.value)
    await db.rollback()
    db.add(CleanupBatch(session_id=sid, kind="saved", status="draft", item_count=501, max_items_at_preview=1, expires_at=NOW))
    with pytest.raises(IntegrityError) as e:
        await db.commit()
    assert "ck_cleanup_batches_item_count" in str(e.value)


# ---- benzersizlik ve kısmi indeksler -----------------------------------------------------------

async def test_unique_scan_media_id(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    db.add_all([_target(s, sc, media_id="5"), _target(s, sc, media_id="5")])
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_unique_collection_per_session(db, make_session):
    s = await make_session()
    db.add_all([SavedCollection(session_id=s.id, collection_id="5", name="a"),
                SavedCollection(session_id=s.id, collection_id="5", name="b")])
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_partial_unique_one_draft_per_profile(db, make_session):
    s = await make_session()
    await _batch(db, s, "draft")
    await _batch(db, s, "cancelled")
    await _batch(db, s, "expired")
    db.add(CleanupBatch(session_id=s.id, kind="saved", status="draft", item_count=0, max_items_at_preview=1, expires_at=NOW))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.parametrize("first, second", [("confirmed", "running"), ("running", "stopped"), ("stopped", "confirmed")])
async def test_partial_unique_one_active_per_profile(db, make_session, first, second):
    s = await make_session()
    await _batch(db, s, first)
    db.add(CleanupBatch(session_id=s.id, kind="saved", status=second, item_count=0, max_items_at_preview=1, expires_at=NOW))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_draft_and_active_and_other_profile_coexist(db, make_session):
    s1, s2 = await make_session(username="a"), await make_session(username="b")
    await _batch(db, s1, "draft")
    await _batch(db, s1, "running")
    await _batch(db, s1, "done")
    await _batch(db, s2, "running")


async def test_partial_unique_pending_item_per_ref(db, make_session):
    s = await make_session()
    b = await _batch(db, s)
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="9", label="l", status="done"))
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="9", label="l", status="pending"))
    await db.commit()
    db.add(CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="9", label="l", status="pending"))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_partial_index_predicates_in_db(db_engine):
    async with db_engine.connect() as c:
        rows = (await c.execute(text(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('cleanup_batches','cleanup_items')"))).all()
    defs = " | ".join(r[1] for r in rows)
    assert "status" in defs and "WHERE" in defs
    uniq = [r for r in rows if "UNIQUE" in r[1] and "WHERE" in r[1]]
    assert len(uniq) == 3


# ---- kod kolonu genişliği (R7 M2) ---------------------------------------------------------------

async def test_long_codes_fit(db, make_session):
    s = await make_session()
    b = await _batch(db, s, last_stop_reason="mutation_unrecognised", stopped_ext_version="1.2.3-beta.10")
    sc = await _scan(db, s, note_code="collections_unavailable")
    assert b.last_stop_reason == "mutation_unrecognised" and sc.note_code == "collections_unavailable"
    db.add(ActionLog(session_id=s.id, ig_user_id=None, action_type="collection_protection", status="success",
                     target_ref="12345", target_label="x"))
    await db.commit()


async def test_column_widths(db_engine):
    async def widths():
        async with db_engine.connect() as c:
            rows = (await c.execute(text(
                "SELECT table_name, column_name, character_maximum_length FROM information_schema.columns "
                "WHERE character_maximum_length IS NOT NULL"))).all()
        return {(t, col): n for t, col, n in rows}
    w = await widths()
    assert w[("cleanup_batches", "last_stop_reason")] == 30
    assert w[("cleanup_scans", "note_code")] >= 23
    assert w[("cleanup_items", "note_code")] >= 23
    assert w[("action_log", "action_type")] >= len("collection_protection")
    assert w[("action_log", "target_ref")] == 64 and w[("action_log", "target_label")] == 200
    assert w[("saved_targets", "media_id")] == 25 and w[("cleanup_items", "ref")] == 25
    assert w[("saved_collections", "collection_id")] == 25 and w[("saved_collections", "name")] == 100
    assert w[("cleanup_scans", "collections_mode")] >= len("per_collection")
    assert w[("cleanup_batches", "stopped_ext_version")] == 20
    assert w[("sessions", "cleanup_paused_reason")] == 200


async def test_action_log_ig_user_id_nullable(db_engine):
    async with db_engine.connect() as c:
        cols = await c.run_sync(lambda sc: {x["name"]: x for x in inspect(sc).get_columns("action_log")})
    assert cols["ig_user_id"]["nullable"] is True
    assert "target_ref" in cols and "target_label" in cols


# ---- cascade (AC-C20, C22; S20, S22) ------------------------------------------------------------

async def test_purge_cascades_to_all_new_tables(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    b = await _batch(db, s, "running", scan_id=sc.id)
    t = _target(s, sc)
    col = SavedCollection(session_id=s.id, collection_id="1", name="n", first_seen_scan_id=sc.id, last_seen_scan_id=sc.id)
    it = CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="1", label="l", status="pending")
    db.add_all([t, col, it])
    await db.commit()
    db.add(CleanupWriteGrant(session_id=s.id, item_id=it.id, granted_at=NOW))
    db.add(ActionLog(session_id=s.id, ig_user_id=None, action_type="unsave", status="success"))
    await db.commit()
    sid = s.id
    await db.execute(text("DELETE FROM sessions WHERE id = :i"), {"i": sid})
    await db.commit()
    for tbl in ("cleanup_scans", "saved_targets", "saved_collections", "cleanup_batches", "cleanup_items",
                "cleanup_write_grants", "action_log"):
        n = (await db.execute(text(f"SELECT count(*) FROM {tbl}"))).scalar()
        assert n == 0, tbl


async def test_scan_delete_cascades_targets_and_sets_null(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    b = await _batch(db, s, scan_id=sc.id)
    col = SavedCollection(session_id=s.id, collection_id="1", name="n", first_seen_scan_id=sc.id, last_seen_scan_id=sc.id)
    db.add_all([_target(s, sc), col])
    await db.commit()
    bid, scid = b.id, sc.id
    await db.execute(text("DELETE FROM cleanup_scans WHERE id = :i"), {"i": scid})
    await db.commit()
    db.expire_all()
    assert (await db.execute(text("SELECT count(*) FROM saved_targets"))).scalar() == 0
    assert (await db.execute(select(CleanupBatch.scan_id).where(CleanupBatch.id == bid))).scalar() is None
    row = (await db.execute(select(SavedCollection.first_seen_scan_id, SavedCollection.last_seen_scan_id))).one()
    assert row == (None, None)


async def test_item_delete_cascades_grants_and_batch_delete_cascades_items(db, make_session):
    s = await make_session()
    b = await _batch(db, s)
    it = CleanupItem(session_id=s.id, batch_id=b.id, action="unsave", ref="1", label="l", status="pending")
    db.add(it)
    await db.commit()
    db.add(CleanupWriteGrant(session_id=s.id, item_id=it.id, granted_at=NOW))
    await db.commit()
    await db.execute(text("DELETE FROM cleanup_batches WHERE id = :i"), {"i": b.id})
    await db.commit()
    assert (await db.execute(text("SELECT count(*) FROM cleanup_items"))).scalar() == 0
    assert (await db.execute(text("SELECT count(*) FROM cleanup_write_grants"))).scalar() == 0


async def test_write_grant_columns_and_index(db_engine):
    async with db_engine.connect() as c:
        idx = await c.run_sync(lambda sc: inspect(sc).get_indexes("cleanup_write_grants"))
        cols = await c.run_sync(lambda sc: {x["name"]: x for x in inspect(sc).get_columns("cleanup_write_grants")})
    assert any(i["column_names"] == ["session_id", "granted_at"] for i in idx)
    assert cols["granted_at"]["nullable"] is False and cols["item_id"]["nullable"] is False


async def test_targets_filter_index(db_engine):
    async with db_engine.connect() as c:
        idx = await c.run_sync(lambda sc: inspect(sc).get_indexes("saved_targets"))
    assert any(i["column_names"] == ["scan_id", "owner_username"] for i in idx)


# ---- v1.6 ek kolonlar (main session kararı): koleksiyon hakkı ve "bu taramada listelendi" işareti ----------

async def test_scan_collections_received_at_and_listed_scan_id(db, make_session):
    s = await make_session()
    sc = await _scan(db, s)
    assert sc.collections_received_at is None
    c = SavedCollection(session_id=s.id, collection_id="21", name="x", listed_scan_id=sc.id)
    db.add(c)
    await db.commit()
    assert c.listed_scan_id == sc.id and c.last_seen_scan_id is None
    await db.delete(sc)                                          # ON DELETE SET NULL
    await db.commit()
    await db.refresh(c)
    assert c.listed_scan_id is None
