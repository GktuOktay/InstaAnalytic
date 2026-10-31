import httpx
import pytest
from sqlalchemy import select

from app.models.session import Session
from app.routers import sessions as sessions_router

pytestmark = pytest.mark.asyncio


async def test_api_requires_token(client):
    r = await client.get("/api/sessions", headers={"X-API-Token": ""})
    assert r.status_code == 401
    assert (await client.get("/api/sessions")).status_code == 200


async def test_health_is_public_and_leaks_no_details(client):
    r = await client.get("/api/health", headers={"X-API-Token": ""})
    assert r.status_code == 200
    assert set(r.json()) == {"status", "postgres", "redis"}


async def test_zip_only_profile_lifecycle(client):
    r = await client.post("/api/sessions/zip-only", json={"ig_username": "@Test.User_1"})
    assert r.status_code == 201
    body = r.json()
    assert body["source"] == "zip" and body["allow_actions"] is False and body["ig_user_id"] < 0
    assert body["ig_username"] == "test.user_1"
    assert (await client.post("/api/sessions/zip-only", json={"ig_username": "test.user_1"})).status_code == 400
    for bad in ("a b", "", "x" * 31, "emoji😀"):
        assert (await client.post("/api/sessions/zip-only", json={"ig_username": bad})).status_code == 422


async def test_actions_are_off_by_default_and_gated(client, make_session):
    s = await make_session()
    assert s.allow_actions is False
    for path in (f"/follow/5", f"/unfollow/5", f"/remove-follower/5"):
        r = await client.post(f"/api/sessions/{s.id}/actions{path}")
        assert r.status_code == 403, path
    r = await client.post(f"/api/sessions/{s.id}/actions/bulk-unfollow", json={"user_ids": [1, 2]})
    assert r.status_code == 403


async def test_zip_profile_can_never_enable_actions(client, make_session):
    s = await make_session(source="zip")
    r = await client.post(f"/api/sessions/{s.id}/allow-actions", json={"allow_actions": True})
    assert r.status_code == 400
    r = await client.post(f"/api/sessions/{s.id}/actions/follow/5")
    assert r.status_code == 400


async def test_enabling_starts_ramp_up_clock_and_disabling_resets(client, make_session):
    s = await make_session()
    r = await client.post(f"/api/sessions/{s.id}/allow-actions", json={"allow_actions": True})
    assert r.status_code == 200 and r.json()["allow_actions"] is True
    r = await client.post(f"/api/sessions/{s.id}/allow-actions", json={"allow_actions": False})
    assert r.json()["allow_actions"] is False


async def test_paused_session_rejects_actions_with_423(client, make_session):
    from datetime import datetime, timedelta, timezone
    s = await make_session(allow_actions=True, paused_until=datetime.now(timezone.utc) + timedelta(hours=3),
                           paused_reason="Instagram uyarısı")
    r = await client.post(f"/api/sessions/{s.id}/actions/follow/5")
    assert r.status_code == 423 and "Instagram uyarısı" in r.json()["detail"]


async def test_bulk_unfollow_preview_queues_nothing(client, make_session, db, monkeypatch):
    s = await make_session(allow_actions=False)   # önizleme için işlem açık olmak zorunda değil
    from app.routers import actions
    called = []
    monkeypatch.setattr(actions.bulk_unfollow, "delay", lambda *a, **k: called.append(1))
    r = await client.post(f"/api/sessions/{s.id}/actions/bulk-unfollow/preview", json={"user_ids": [1, 2, 3]})
    assert r.status_code == 200 and r.json()["count"] == 3 and not called


# ── tarayıcıdan bağlama: önizle → onayla ─────────────────────────────────────

def _fake_agent(monkeypatch, *, version=2, sessions=None, status=200):
    sessions = sessions if sessions is not None else [
        {"session_id_cookie": "123%3Aabc", "extra_cookies": {"ds_user_id": "123"}, "browser": "Chrome"}]
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "api_version": version})
        if request.url.path == "/scan":
            import json
            seen["body"] = json.loads(request.content)
            return httpx.Response(status, json={"sessions": sessions, "errors": []})
        return httpx.Response(404)

    real = httpx.AsyncClient
    monkeypatch.setattr(sessions_router.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **{k: v for k, v in kw.items() if k != "transport"}))
    monkeypatch.setattr(sessions_router.instagram, "_web_account_info",
                        lambda sid, extra=None: {"pk": 123, "username": "real_me", "full_name": "Real Me"})
    return seen


async def test_scan_requires_explicit_browser_choice(client, monkeypatch, fake_redis_async):
    _fake_agent(monkeypatch)
    assert (await client.post("/api/sessions/scan-browser", json={"browsers": []})).status_code == 422


async def test_scan_previews_without_saving_then_confirm_saves_once(client, db, monkeypatch, fake_redis_async):
    seen = _fake_agent(monkeypatch)
    r = await client.post("/api/sessions/scan-browser", json={"browsers": ["Chrome"]})
    assert r.status_code == 200
    assert seen["body"] == {"browsers": ["Chrome"]}          # yalnızca seçilen tarayıcı istendi
    cands = r.json()["candidates"]
    assert len(cands) == 1 and cands[0]["ig_username"] == "real_me"
    assert "session_id_cookie" not in str(r.json())            # çerez arayüze ASLA dönmez
    assert (await db.execute(select(Session))).scalars().all() == []   # onaylanmadan kayıt yok

    cid = cands[0]["candidate_id"]
    r = await client.post("/api/sessions/scan-browser/confirm", json={"candidate_ids": [cid]})
    assert r.status_code == 201 and r.json()[0]["ig_username"] == "real_me"
    assert r.json()[0]["allow_actions"] is False               # yeni bağlanan hesapta işlemler kapalı
    # aday tek kullanımlık
    assert (await client.post("/api/sessions/scan-browser/confirm", json={"candidate_ids": [cid]})).status_code == 404


async def test_unconfirmed_candidates_expire(client, monkeypatch, fake_redis_async):
    _fake_agent(monkeypatch)
    cid = (await client.post("/api/sessions/scan-browser", json={"browsers": ["Chrome"]})).json()["candidates"][0]["candidate_id"]
    ttl = await fake_redis_async.ttl(f"cand:{cid}")
    assert 0 < ttl <= 300
    await fake_redis_async.delete(f"cand:{cid}")                # süre doldu
    assert (await client.post("/api/sessions/scan-browser/confirm", json={"candidate_ids": [cid]})).status_code == 404


async def test_outdated_agent_is_refused(client, monkeypatch, fake_redis_async):
    _fake_agent(monkeypatch, version=1)
    r = await client.post("/api/sessions/scan-browser", json={"browsers": ["Chrome"]})
    assert r.status_code == 409
