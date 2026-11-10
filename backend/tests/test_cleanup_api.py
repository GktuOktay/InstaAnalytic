"""SPEC-001 T-5: /cleanup uç noktaları (HTTP düzeyi). AC: C2..C4, C27, C37, C38, C41, C53, C57, L5, S22.
Sahte saat: `get_now` bağımlılığı geçersiz kılınır. Redis: fakeredis. Sınırlar: `get_cleanup_limits`."""
from datetime import datetime, timedelta, timezone
from types import MappingProxyType, SimpleNamespace

import fakeredis.aioredis
import pytest
import pytest_asyncio
from sqlalchemy import select, update

from app.models.action_log import ActionLog
from app.models.cleanup import CleanupBatch, CleanupItem, CleanupScan, SavedCollection, SavedTarget
from app.models.notification import Notification
from app.models.session import Session
from app.services import cleanup_batch as cb
from app.services import cleanup_gate as cg
from app.services import cleanup_limits as cl

T0 = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)      # İstanbul 15:00
SEC, MIN, H, DAY = timedelta(seconds=1), timedelta(minutes=1), timedelta(hours=1), timedelta(days=1)
EXT = "2.9.0"


def mk_limits(**ov):
    v = dict(cl.DEFAULTS)
    v.update(ov)
    return cl.Limits(MappingProxyType(v), (), "file", None, None, 0.0, 0.0, "config/limits.toml")


L = mk_limits()


def ref(i):
    return str(3500000000000000000 + i)


@pytest_asyncio.fixture
async def api(client):
    from app.main import app
    from app.routers import bridge as rb
    from app.routers import cleanup as rc
    st = SimpleNamespace(now=T0, limits=L, kv=fakeredis.aioredis.FakeRedis())
    app.dependency_overrides[rc.get_now] = lambda: st.now
    app.dependency_overrides[rc.get_cleanup_limits] = lambda: st.limits
    app.dependency_overrides[rb.get_kv] = lambda: st.kv
    st.c = client
    return st


def base(s):
    return f"/api/sessions/{s.id}/cleanup"


def saved(s):
    return base(s) + "/saved"


def vid(s):
    return str(s.ig_user_id)


async def mk_profile(make_session, **kw):
    kw.setdefault("allow_unsave", True)
    kw.setdefault("unsave_enabled_at", T0 - 30 * DAY)
    return await make_session(**kw)


async def mk_inventory(db, s, n, collections=None, rows=None):
    w = collections is not None
    scan = CleanupScan(session_id=s.id, kind="saved", status="ok", started_at=T0 - H, finished_at=T0 - H + MIN,
                       items=n, pages=1, collections_mode="per_collection" if w else "all_protected",
                       collections_received_at=(T0 - H) if w else None)
    db.add(scan)
    await db.flush()
    for cid, name, prot in collections or []:
        db.add(SavedCollection(session_id=s.id, collection_id=cid, name=name, protected=prot,
                               first_seen_scan_id=scan.id, last_seen_scan_id=scan.id, listed_scan_id=scan.id))
    for i in range(1, n + 1):
        d = dict(session_id=s.id, scan_id=scan.id, position=i - 1, media_id=ref(i), shortcode=f"Cabc{i:06d}",
                 owner_username=f"user{i}", media_type="image")
        d.update((rows or {}).get(i, {}))
        db.add(SavedTarget(**d))
    await db.commit()
    return scan


async def mk_run(db, make_session, n=3, running=True, **kw):
    s = await mk_profile(make_session, **kw)
    scan = await mk_inventory(db, s, n)
    r = await cb.preview(db, s, {"scan_id": scan.id, "select": "refs", "refs": [ref(i) for i in range(1, n + 1)]}, T0,
                         limits=L)
    await db.commit()
    await cb.confirm(db, s, r.batch_id, r.item_count, T0, limits=L)
    await db.commit()
    seq = 0
    if running:
        seq = (await cb.start_batch(db, s, r.batch_id, None, T0, limits=L)).run_seq
        await db.commit()
    b = await db.get(CleanupBatch, r.batch_id)
    await db.refresh(b)
    items = list((await db.execute(select(CleanupItem).where(CleanupItem.batch_id == b.id)
                                   .order_by(CleanupItem.id))).scalars())
    return s, b, seq, items


def nxt_body(s, b, seq, **kw):
    d = dict(batch_id=b.id, run_seq=seq, viewer_id=vid(s), ext_version=EXT, limit=5)
    d.update(kw)
    return d


# ── Hata zarfı, 415, IDOR ───────────────────────────────────────────────────────

async def test_error_envelope_and_no_input_echo(api, make_session):
    s = await mk_profile(make_session)
    r = await api.c.put(base(s) + "/settings", json={"saved_enabled": "SECRET-VALUE-123", "zzz_secret_name": 1})
    assert r.status_code == 422
    d = r.json()["detail"]
    assert d["code"] == "invalid" and isinstance(d["fields"], list)
    assert "SECRET-VALUE-123" not in r.text and "zzz_secret_name" not in r.text
    r2 = await api.c.get("/api/sessions/not-a-uuid/bridge/status")          # başka router: biçim değişmez
    assert r2.status_code == 422 and isinstance(r2.json()["detail"], list)


async def test_unknown_or_malformed_session_is_404_envelope(api):
    for sid in ("00000000-0000-4000-8000-0000000000aa", "zzz"):
        r = await api.c.get(f"/api/sessions/{sid}/cleanup/status")
        assert r.status_code == 404 and r.json() == {"detail": {"code": "session_not_found"}}


POSTS = [
    ("POST", "/saved/scan/start"), ("POST", "/saved/scan/1/page"), ("POST", "/saved/scan/1/finish"),
    ("POST", "/saved/scan/1/collections"), ("POST", "/saved/preview"), ("POST", "/batches/1/confirm"),
    ("POST", "/batches/1/start"), ("POST", "/batches/1/stop"), ("POST", "/batches/1/cancel"),
    ("POST", "/saved/next"), ("POST", "/items/1/precheck"), ("POST", "/items/1/result"),
    ("PUT", "/settings"), ("PUT", "/saved/collections/11"),
]


@pytest.mark.parametrize("method,path", POSTS)
async def test_state_changing_endpoints_require_json(api, make_session, method, path):
    s = await mk_profile(make_session)
    for hdrs in ({"Content-Type": "text/plain"}, {}):
        r = await api.c.request(method, base(s) + path, content=b'{"a":1}', headers=hdrs)
        assert r.status_code == 415 and r.json() == {"detail": {"code": "unsupported_media_type"}}, (path, hdrs)


async def test_415_after_auth_and_json_charset_accepted(api, make_session):
    import httpx
    from app.main import app
    s = await mk_profile(make_session)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as raw:
        r = await raw.put(base(s) + "/settings", content=b"{}", headers={"Content-Type": "text/plain"})
        assert r.status_code == 401
    r = await api.c.put(base(s) + "/settings", content=b'{"saved_enabled": false}',
                        headers={"Content-Type": "application/json; charset=utf-8"})
    assert r.status_code == 200


async def test_cross_profile_ids_are_404(api, db, make_session):
    a, b, seq, its = await mk_run(db, make_session, 3)
    o = await mk_profile(make_session, username="other")
    sc = (await db.execute(select(CleanupScan.id).where(CleanupScan.session_id == a.id))).scalar_one()
    before = (b.status, its[0].status)
    ids = lambda **x: x
    calls = [
        ("GET", f"/batches/{b.id}/items", None), ("POST", f"/batches/{b.id}/confirm", {"confirm_count": 3}),
        ("POST", f"/batches/{b.id}/start", {}), ("POST", f"/batches/{b.id}/stop", {"reason": "user_stop"}),
        ("POST", f"/batches/{b.id}/cancel", {}),
        ("POST", "/saved/next", nxt_body(o, b, seq)),
        ("POST", f"/items/{its[0].id}/precheck",
         {"viewer_id": vid(o), "ext_version": EXT, "run_seq": seq, "collection_ids": []}),
        ("POST", f"/items/{its[0].id}/result", {"viewer_id": vid(o), "run_seq": seq, "outcome": "done"}),
        ("POST", f"/saved/scan/{sc}/page", {"viewer_id": vid(o), "page_no": 1, "items": []}),
        ("POST", f"/saved/scan/{sc}/finish", {"viewer_id": vid(o), "outcome": "ok"}),
        ("POST", f"/saved/scan/{sc}/collections", {"viewer_id": vid(o), "available": False}),
        ("PUT", "/saved/collections/999", {"protected": True}),
    ]
    for m, p, body in calls:
        r = await api.c.request(m, base(o) + p, json=body)
        assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found", (m, p, r.text)
    await db.refresh(b)
    await db.refresh(its[0])
    assert (b.status, its[0].status) == before


# ── Sürüm / hesap (409) ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("ext", [None, "2.8.9", "2.8"])
async def test_extension_outdated_409_stops_running_batch_persistently(api, db, make_session, ext):
    s, b, seq, its = await mk_run(db, make_session, 2)
    r = await api.c.post(saved(s) + "/next", json=nxt_body(s, b, seq, ext_version=ext))
    assert r.status_code == 409 and r.json() == {"detail": {"code": "extension_outdated"}}
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "extension_outdated")


async def test_extension_outdated_on_precheck_and_scan_start_and_version_compare(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    r = await api.c.post(saved(s) + "/scan/start", json={"viewer_id": vid(s), "ext_version": "2.8.0"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "extension_outdated"
    await db.refresh(b)
    assert b.last_stop_reason == "extension_outdated"
    r = await api.c.post(saved(s) + "/scan/start", json={"viewer_id": vid(s)})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "extension_outdated"
    r = await api.c.post(saved(s) + "/scan/start", json={"viewer_id": vid(s), "ext_version": "bad!"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid"
    for ok in ("2.9", "2.10.0"):
        s2 = await mk_profile(make_session, username=f"u{ok}")
        r = await api.c.post(saved(s2) + "/scan/start", json={"viewer_id": vid(s2), "ext_version": ok})
        assert r.status_code == 200, ok
        assert set(r.json()) == {"scan_id", "max_pages", "page_delay", "warn_after_ms", "stale_after_ms",
                                 "collection_choice"}
    s3, b3, seq3, its3 = await mk_run(db, make_session, 2, username="p3")
    r = await api.c.post(base(s3) + f"/items/{its3[0].id}/precheck",
                         json={"viewer_id": vid(s3), "ext_version": None, "run_seq": seq3, "collection_ids": []})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "extension_outdated"


async def test_result_and_stop_exempt_from_ext_version(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    p = await api.c.post(base(s) + f"/items/{its[0].id}/precheck",
                         json={"viewer_id": vid(s), "ext_version": EXT, "run_seq": seq, "collection_ids": []})
    assert p.json() == {"allow": True, "item_id": its[0].id}
    r = await api.c.post(base(s) + f"/items/{its[0].id}/result", json={"viewer_id": vid(s), "run_seq": seq,
                                                                         "outcome": "done"})
    assert r.status_code == 200 and r.json()["status"] == "done" and r.json()["ok"] is True
    r = await api.c.post(base(s) + f"/batches/{b.id}/stop", json={"reason": "user_stop"})
    assert r.status_code == 200 and r.json()["applied"] is True


async def test_account_mismatch_persists_stop_and_anomaly(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    r = await api.c.post(base(s) + f"/items/{its[0].id}/result",
                         json={"viewer_id": "999", "run_seq": seq, "outcome": "done"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "account_mismatch"
    await db.refresh(b)
    await db.refresh(its[0])
    assert (b.status, b.last_stop_reason, its[0].status) == ("stopped", "account_mismatch", "pending")
    n = list((await db.execute(select(Notification).where(Notification.session_id == s.id,
                                                          Notification.kind == "cleanup_anomaly"))).scalars())
    assert len(n) == 1


async def test_account_mismatch_on_scan_endpoints_stops_batch_and_viewer_unknown(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    r = await api.c.post(saved(s) + "/scan/9/finish", json={"viewer_id": "999", "outcome": "ok"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "account_mismatch"
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "account_mismatch")
    s2 = await mk_profile(make_session, username="unk")
    await db.execute(update(Session).where(Session.id == s2.id).values(ig_user_id=-5))
    await db.commit()
    r = await api.c.post(saved(s2) + "/scan/start", json={"viewer_id": "5", "ext_version": EXT})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "viewer_unknown"


# ── ext_version hatırlama (AC-C57) ──────────────────────────────────────────────

async def test_result_passes_remembered_ext_version_for_mutation_unrecognised(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 3)
    r = await api.c.post(saved(s) + "/next", json=nxt_body(s, b, seq))
    assert r.status_code == 200 and [i["id"] for i in r.json()["items"]] == [i.id for i in its]
    assert (await api.kv.get(f"bridge:{s.id}:ext_version")) == b"2.9.0"
    await api.c.post(base(s) + f"/items/{its[0].id}/precheck",
                     json={"viewer_id": vid(s), "ext_version": EXT, "run_seq": seq, "collection_ids": []})
    r = await api.c.post(base(s) + f"/items/{its[0].id}/result",
                         json={"viewer_id": vid(s), "run_seq": seq, "outcome": "failed",
                               "note_code": "mutation_unrecognised", "http_status": 200, "fields": ["data"]})
    assert r.status_code == 200 and r.json()["stopped"] is True
    await db.refresh(b)
    assert (b.last_stop_reason, b.stopped_ext_version) == ("mutation_unrecognised", "2.9.0")
    r = await api.c.post(base(s) + f"/batches/{b.id}/start", json={"ext_version": "2.9.0"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "extension_update_required"
    st = (await api.c.get(base(s) + "/status")).json()
    assert st["saved"]["active_batch"]["requires_ext_above"] == "2.9.0"
    r = await api.c.post(base(s) + f"/batches/{b.id}/start", json={"ext_version": "2.9.1"})
    assert r.status_code == 200 and r.json()["status"] == "running" and r.json()["run_seq"] == seq + 1


async def test_next_with_old_ext_after_mutation_stop_409_persists(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    await db.execute(update(CleanupBatch).where(CleanupBatch.id == b.id).values(stopped_ext_version="2.9.0"))
    await db.commit()
    r = await api.c.post(saved(s) + "/next", json=nxt_body(s, b, seq))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "extension_update_required"
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "mutation_unrecognised")


async def test_start_persists_stale_stop_before_not_now(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    api.now = T0 + 700 * SEC
    await db.execute(update(Session).where(Session.id == s.id).values(cleanup_paused_until=api.now + 2 * H))
    await db.commit()
    r = await api.c.post(base(s) + f"/batches/{b.id}/start", json={})
    d = r.json()["detail"]
    assert r.status_code == 409 and d["code"] == "not_now" and d["reason"] == "paused"
    await db.refresh(b)
    assert (b.status, b.last_stop_reason) == ("stopped", "stale")


# ── Özellik kapalı (AC-C2) ──────────────────────────────────────────────────────

async def test_endpoint_behaviour_while_off(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 2)
    await api.c.post(base(s) + f"/items/{its[0].id}/precheck",
                     json={"viewer_id": vid(s), "ext_version": EXT, "run_seq": seq, "collection_ids": []})
    await db.execute(update(Session).where(Session.id == s.id).values(allow_unsave=False))
    await db.commit()
    c = api.c
    for p, body in (("/saved/scan/start", {"viewer_id": vid(s), "ext_version": EXT}),
                    ("/saved/scan/1/page", {"viewer_id": vid(s), "page_no": 1, "items": []}),
                    ("/saved/scan/1/collections", {"viewer_id": vid(s), "available": False}),
                    ("/saved/preview", {"scan_id": 1, "select": "refs", "refs": []}),
                    (f"/batches/{b.id}/confirm", {"confirm_count": 1}), (f"/batches/{b.id}/start", {})):
        r = await c.post(base(s) + p, json=body)
        assert r.status_code == 403 and r.json()["detail"]["code"] == "feature_off", p
    r = await c.post(saved(s) + "/next", json=nxt_body(s, b, seq))
    assert r.status_code == 200 and r.json()["reason"] == "off"
    r = await c.post(base(s) + f"/items/{its[1].id}/precheck",
                     json={"viewer_id": vid(s), "ext_version": EXT, "run_seq": seq, "collection_ids": []})
    assert r.status_code == 200 and r.json()["allow"] is False and r.json()["reason"] == "off"
    r = await c.post(base(s) + f"/items/{its[0].id}/result", json={"viewer_id": vid(s), "run_seq": seq,
                                                                     "outcome": "done"})
    assert r.status_code == 200
    for m, p, body in (("GET", "/settings", None), ("GET", "/status", None), ("GET", "/history", None),
                       ("GET", "/saved/inventory", None), ("GET", f"/batches/{b.id}/items", None),
                       ("GET", "/saved/collections", None), ("POST", f"/batches/{b.id}/stop", {"reason": "user_stop"}),
                       ("POST", f"/batches/{b.id}/cancel", {})):
        r = await c.request(m, base(s) + p, json=body)
        assert r.status_code == 200, (p, r.text)
    assert (await c.get("/api/cleanup/limits")).status_code == 200


# ── Ayarlar, sınırlar ───────────────────────────────────────────────────────────

async def test_settings_toggle_ack_audit_and_not_available(api, db, make_session):
    s = await make_session()
    g = (await api.c.get(base(s) + "/settings")).json()
    assert g["saved"]["enabled"] is False and g["dm"] is None
    assert g["saved"]["collection_choice_available"] is True
    assert g["account"]["worst_case"] == {"hourly": 95, "daily": 460}
    assert set(g["budget"]) == {"hourly", "daily", "delay", "ramp_factor", "hourly_cap", "daily_cap"}
    r = await api.c.put(base(s) + "/settings", json={"saved_enabled": True})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ack_required"
    for extra in ({"dm_enabled": True}, {"rules": []}):
        r = await api.c.put(base(s) + "/settings", json={"saved_enabled": False, **extra})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "not_available"
    r = await api.c.put(base(s) + "/settings", json={"saved_enabled": True, "ack_irreversible": True})
    assert r.status_code == 200 and r.json()["saved"]["enabled"] is True
    log = list((await db.execute(select(ActionLog).where(ActionLog.session_id == s.id,
                                                         ActionLog.action_type == "cleanup_setting"))).scalars())
    assert len(log) == 1


async def test_limits_not_settable_via_api_and_limits_shape(api, make_session):
    s = await make_session()
    for body in ({"saved_enabled": False, "hourly": 80}, {"saved_enabled": False, "profiles": {"safe": {}}}):
        r = await api.c.put(base(s) + "/settings", json=body)
        assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid"
    d = (await api.c.get("/api/cleanup/limits")).json()
    assert d["follow_limits_managed_here"] is False and d["path"] == "config/limits.toml"
    assert {"source", "loaded_at", "changed_at", "sha256", "version", "warnings", "hard_caps", "effective"} <= set(d)
    assert {"account", "batch", "ramp", "scan", "profiles"} <= set(d["effective"])
    assert "safe" in d["effective"]["profiles"]


# ── Akış: tarama → önizleme → onay → başlat ────────────────────────────────────

async def test_scan_preview_confirm_start_flow_shapes(api, db, make_session):
    s = await mk_profile(make_session)
    c = api.c
    st = (await c.post(saved(s) + "/scan/start", json={"viewer_id": vid(s), "ext_version": EXT})).json()
    sid = st["scan_id"]
    r = await c.post(saved(s) + "/scan/start", json={"viewer_id": vid(s), "ext_version": EXT})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "scan_running"
    r = await c.post(saved(s) + f"/scan/{sid}/collections",
                     json={"viewer_id": vid(s), "available": True, "collections": [{"collection_id": "11", "name": "A"}]})
    assert r.json() == {"mode": "per_collection", "new_count": 1}
    items = [{"media_id": ref(i), "shortcode": f"Cabc{i:06d}", "owner_username": f"user{i}", "media_type": "image"}
             for i in (1, 2, 3)]
    r = await c.post(saved(s) + f"/scan/{sid}/page", json={"viewer_id": vid(s), "page_no": 1, "items": items})
    assert r.json() == {"accepted": 3, "duplicates": 0, "total": 3, "continue": True}
    r = await c.post(saved(s) + f"/scan/{sid}/page", json={"viewer_id": vid(s), "page_no": 1, "items": items})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "page_out_of_order"
    r = await c.post(saved(s) + f"/scan/{sid}/collections", json={"viewer_id": vid(s), "available": False})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "collections_closed"
    r = await c.post(saved(s) + f"/scan/{sid}/page", json={"viewer_id": vid(s), "page_no": 2,
                                                            "items": [{"media_id": "1", "shortcode": "Cabc000001",
                                                                       "free_text": "x"}]})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid"
    r = await c.post(saved(s) + f"/scan/{sid}/finish", json={"viewer_id": vid(s), "outcome": "ok"})
    assert r.json() == {"status": "ok", "items": 3}
    inv = (await c.get(saved(s) + "/inventory?limit=2")).json()
    assert inv["total"] == 3 and len(inv["items"]) == 2 and inv["scan"]["id"] == sid
    assert (await c.get(saved(s) + "/inventory?limit=abc")).status_code == 422
    assert (await c.get(saved(s) + "/inventory?collection_id=11")).json()["detail"]["code"] == "not_available"
    pv = (await c.post(saved(s) + "/preview", json={"scan_id": sid, "select": "refs", "refs": [ref(1), ref(2)]})).json()
    assert pv["item_count"] == 2 and pv["batch_id"] and set(pv["estimate"]) == {"hourly", "daily", "days", "starts"}
    bid = pv["batch_id"]
    it = (await c.get(base(s) + f"/batches/{bid}/items")).json()
    assert it["total"] == 2
    r = await c.post(base(s) + f"/batches/{bid}/confirm", json={"confirm_count": 3})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "count_mismatch"
    r = await c.post(base(s) + f"/batches/{bid}/confirm", json={"confirm_count": 2})
    assert r.json() == {"batch_id": bid, "status": "confirmed", "queued": 2}
    r = await c.post(base(s) + f"/batches/{bid}/start", json={})
    assert r.status_code == 200 and r.json()["status"] == "running" and r.json()["run_seq"] == 1
    h = (await c.get(base(s) + "/history")).json()
    assert h["counts"]["pending"] == 2 and len(h["items"]) == 2
    assert (await c.get(base(s) + "/history?state=bogus")).status_code == 422
    assert len((await c.get(base(s) + "/history?state=done")).json()["items"]) == 0


async def test_scan_too_soon_429_has_retry_after_and_blocked_pauses(api, make_session):
    s = await mk_profile(make_session)
    body = {"viewer_id": vid(s), "ext_version": EXT}
    ids = []
    for _ in range(2):
        r = await api.c.post(saved(s) + "/scan/start", json=body)
        ids.append(r.json()["scan_id"])
        await api.c.post(saved(s) + f"/scan/{ids[-1]}/finish", json={"viewer_id": vid(s), "outcome": "blocked"})
    r = await api.c.post(saved(s) + "/scan/start", json=body)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "scan_too_soon"
    assert r.json()["detail"]["retry_after"] >= 1
    st = (await api.c.get(base(s) + "/status")).json()["saved"]
    assert st["run_state"] == "paused" and st["paused_until"] and st["paused_reason"] == "blocked"


# ── Durum ───────────────────────────────────────────────────────────────────────

async def test_status_run_states_and_counts(api, db, make_session):
    s, b, seq, its = await mk_run(db, make_session, 3)
    d = (await api.c.get(base(s) + "/status")).json()
    sv = d["saved"]
    assert d["dm"] is None and sv["enabled"] is True and sv["run_state"] == "ready" and sv["next_allowed_at"] is None
    ab = sv["active_batch"]
    assert (ab["id"], ab["status"], ab["pending"], ab["total"], ab["requires_ext_above"]) == (b.id, "running", 3, 3, None)
    for k in ("quiet_hours", "done_hour", "done_day", "hourly_limit", "daily_limit", "hourly_cap", "daily_cap",
              "account_done_hour", "account_done_day", "account_hourly", "account_daily", "delay", "paused_until",
              "paused_reason", "last_scan", "limits_source"):
        assert k in sv, k
    api.now = datetime(2026, 11, 9, 23, 0, tzinfo=timezone.utc)          # İstanbul 02:00
    assert (await api.c.get(base(s) + "/status")).json()["saved"]["run_state"] == "quiet_hours"
    s2 = await make_session(username="off")
    assert (await api.c.get(base(s2) + "/status")).json()["saved"]["run_state"] == "off"


# ── Koleksiyon API (AC-S22) ─────────────────────────────────────────────────────

async def test_collections_get_put(api, db, make_session):
    s = await mk_profile(make_session)
    assert (await api.c.get(saved(s) + "/collections")).json() == {"mode": None, "scan_id": None, "items": []}
    scan = await mk_inventory(db, s, 3, collections=[("1111", "Seyahat", True), ("2222", "Seyahat", True),
                                                     ("3333", "Tarif", True)],
                              rows={1: {"collection_ids": ["1111"]}, 2: {"collection_ids": ["1111", "3333"]}})
    g = (await api.c.get(saved(s) + "/collections")).json()
    assert g["mode"] == "per_collection" and g["scan_id"] == scan.id
    by = {i["collection_id"]: i for i in g["items"]}
    assert by["1111"]["post_count"] == 2 and by["1111"]["id_suffix"] == "1111" and by["3333"]["id_suffix"] is None
    assert by["1111"]["in_last_scan"] is True and by["1111"]["is_new"] is True and by["1111"]["protected"] is True
    p = saved(s) + "/collections/3333"
    r = await api.c.put(p, json={"protected": False})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ack_required"
    r = await api.c.put(p, json={"protected": False, "ack_shared_risk": True})
    assert r.status_code == 200 and r.json() == {"collection_id": "3333", "protected": False}
    log = list((await db.execute(select(ActionLog).where(ActionLog.action_type == "collection_protection"))).scalars())
    assert [(x.target_ref, x.target_label) for x in log] == [("3333", "unprotected")]
    assert "Tarif" not in repr([(x.error_msg, x.target_label) for x in log])
    assert (await api.c.put(p, json={"protected": True})).status_code == 200
    assert (await api.c.put(saved(s) + "/collections/9999", json={"protected": True})).status_code == 404
    r = await api.c.put(saved(s) + "/collections/abc", json={"protected": True})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid"
    r = await api.c.put(p, json={"protected": True, "x": 1})
    assert r.status_code == 422
    f = await mk_profile(make_session, username="fmode")
    await mk_inventory(db, f, 1)
    db.add(SavedCollection(session_id=f.id, collection_id="77", name="Z", protected=True))
    await db.commit()
    r = await api.c.put(saved(f) + "/collections/77", json={"protected": False, "ack_shared_risk": True})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "collections_unavailable"
    assert (await api.c.put(saved(f) + "/collections/77", json={"protected": True})).status_code == 200


# ── JobReport (AC-C29) ──────────────────────────────────────────────────────────

async def test_job_report_accepts_saved_kinds_counts_only(api, db, make_session):
    s = await make_session()
    base_body = dict(session_id=str(s.id), outcome="ok", total=5, done=5, ok=5, saved=0, message="5",
                     started_at=T0.isoformat(), finished_at=T0.isoformat())
    for kind in ("saved_scan", "saved_unsave"):
        r = await api.c.post("/api/bridge/jobs", json={**base_body, "kind": kind, "results": []})
        assert r.status_code == 201, r.text
    for bad in ({"message": "@someone liked"}, {"results": [{"shortcode": "x"}]}):
        r = await api.c.post("/api/bridge/jobs", json={**base_body, "kind": "saved_unsave", **bad})
        assert r.status_code == 422
    n = list((await db.execute(select(Notification).where(Notification.session_id == s.id))).scalars())
    assert n and all(type(v) in (int, float) for x in n for v in x.params.values())


# ── AC-C53: okuma bütçesi "hazır" kuralında ─────────────────────────────────────

async def test_read_room_gates_ready_and_next_allowed_at(db, make_session):
    lim = mk_limits(**{"reads.status_per_hour": 3})
    s, b, seq, its = await mk_run(db, make_session, 4, running=False)
    old = CleanupBatch(session_id=s.id, kind="saved", status="done", max_items_at_preview=500, expires_at=T0 - DAY)
    db.add(old)
    await db.flush()
    stamps = [T0 + 10 * SEC, T0 + 20 * SEC, T0 + 30 * SEC]
    for k, (st, ts) in enumerate(zip(("already", "not_found", "protected"), stamps)):
        db.add(CleanupItem(session_id=s.id, batch_id=old.id, ref=f"9{k}", label="x", status=st, done_at=ts,
                           created_at=T0))
    await db.commit()
    now = T0 + 40 * SEC
    st = await cg.budget_state(db, s, now, 4, limits=lim)
    assert st.ready is False and st.next_allowed_at == T0 + 10 * SEC + H
    with pytest.raises(cb.CleanupError) as e:
        await cb.start_batch(db, s, b.id, None, now, limits=lim)
    assert (e.value.code, e.value.extra["reason"], e.value.extra["next_allowed_at"]) == (
        "not_now", "limit", (T0 + 10 * SEC + H).isoformat())
    st = await cg.budget_state(db, s, T0 + 10 * SEC + H, 4, limits=lim)
    assert st.ready is True and st.next_allowed_at is None
    assert (await cg.budget_state(db, s, now, 4, limits=L)).ready is True       # varsayılan 120: boş yer var
