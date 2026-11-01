import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import pytest
from sqlalchemy import select

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.relationship import Relationship
from app.services import bridge
from app.services.user_ids import placeholder_id

NOW = datetime.now(timezone.utc)
BIG_PK = 3412345678901234567          # JS sayısına sığmaz; ham metinden doğru okunmalı
GQL = "https://www.instagram.com/graphql/query"


class FakeKV:
    def __init__(self):
        self.d, self.lists = {}, {}

    async def get(self, k): return self.d.get(k)
    async def set(self, k, v, ex=None): self.d[k] = str(v)
    async def delete(self, *keys):
        for k in keys: self.d.pop(k, None)
    async def lpush(self, k, *v): self.lists.setdefault(k, [])[:0] = list(v)
    async def ltrim(self, k, a, b): self.lists[k] = self.lists.get(k, [])[a:b + 1]
    async def lrange(self, k, a, b): return self.lists.get(k, [])[a:b + 1]
    async def expire(self, k, s): pass


def timeline_text(owner="me", owner_pk=1001):
    """Profil ızgarası (GraphQL biçimi): biri eski biri yeni iki gönderi."""
    old = int((NOW - timedelta(days=10)).timestamp())
    young = int((NOW - timedelta(days=1)).timestamp())
    return (
        '{"data":{"xdt_api__v1__feed__user_timeline_graphql_connection":{"edges":['
        f'{{"node":{{"id":"{BIG_PK}_{owner_pk}","pk":"{BIG_PK}","code":"OLD1","taken_at":{old},"media_type":8,'
        f'"like_count":2,"comment_count":1,"caption":{{"text":"eski"}},"user":{{"pk":"{owner_pk}","username":"{owner}"}},'
        '"carousel_media":[{"image_versions2":{"candidates":[{"url":"big"},{"url":"small"}]}}]}},'
        f'{{"node":{{"id":"77_{owner_pk}","pk":"77","code":"NEW1","taken_at":{young},"media_type":1,"like_count":5,'
        f'"comment_count":0,"user":{{"pk":"{owner_pk}","username":"{owner}"}}}}}}'
        '],"page_info":{"has_next_page":false}}},"status":"ok"}'
    )


def likers_req(media_id):
    return urlencode({"fb_api_req_friendly_name": "PolarisPostLikersQuery",
                      "variables": json.dumps({"media_id": str(media_id)}), "doc_id": "123"})


async def _obs(db, kv, s, url, body, page="https://www.instagram.com/me/", req="", status=200, now=NOW):
    return await bridge.observe(db, kv, s, url=url, page_url=page, req_body=req, status=status, text=body, now=now)


# ── ayrıştırma ───────────────────────────────────────────────────────────────

def test_find_media_keeps_big_ids_thumbs_and_owner():
    media = bridge.find_media(bridge.parse_body(timeline_text()))
    assert [m["id"] for m in media] == [BIG_PK, 77]
    assert media[0]["media_type"] == "ALBUM" and media[0]["thumbnail_url"] == "small"
    assert media[0]["caption"] == "eski" and media[0]["owner"] == "me" and media[0]["like_count"] == 2


def test_find_media_understands_old_graphql_names():
    body = {"data": {"user": {"edge_owner_to_timeline_media": {"edges": [{"node": {
        "id": "55", "shortcode": "ABC", "taken_at_timestamp": 1700000000, "owner": {"id": "1", "username": "me"},
        "edge_liked_by": {"count": 9}, "edge_media_to_comment": {"count": 2}, "display_url": "u"}}]}}}}
    [m] = bridge.find_media(body)
    assert (m["id"], m["shortcode"], m["like_count"], m["comment_count"], m["thumbnail_url"]) == (55, "ABC", 9, 2, "u")


def test_find_likers_in_graphql_and_rest_shapes():
    gql = {"data": {"xdt_api__v1__media__likers": {"users": [{"pk": "5", "username": "a"}, {"pk": "6", "username": "b"}]}}}
    assert [u["username"] for u in bridge.find_likers(gql, GQL)] == ["a", "b"]
    edges = {"data": {"shortcode_media": {"edge_liked_by": {"edges": [{"node": {"id": "7", "username": "c"}}]}}}}
    assert [u["id"] for u in bridge.find_likers(edges, GQL)] == [7]
    rest = {"users": [{"pk": 8, "username": "d"}], "status": "ok"}
    assert bridge.find_likers(rest, "https://www.instagram.com/api/v1/media/42/likers/")[0]["id"] == 8
    assert bridge.find_likers({"data": {"user": {"username": "x"}}}, GQL) is None
    assert bridge.find_likers({"data": {"likers": {"users": []}}}, GQL) == []


def test_find_comments_and_request_variables():
    body = {"data": {"xdt_api__v1__media__media_id__comments__connection": {"edges": [
        {"node": {"text": "süper", "created_at": 1700000000, "user": {"pk": "9", "username": "ali"}}}]}}}
    [c] = bridge.find_comments(body, GQL)
    assert c["user"]["username"] == "ali" and c["text"] == "süper"
    friendly, variables = bridge.parse_request(likers_req(BIG_PK), GQL)
    assert friendly == "PolarisPostLikersQuery" and variables["media_id"] == str(BIG_PK)


def test_risk_signals():
    assert bridge.is_risk(429, None)
    assert bridge.is_risk(400, {"message": "feedback_required", "spam": True})
    assert bridge.is_risk(200, {"errors": [{"message": "Rate limit exceeded", "code": 1}]})
    assert not bridge.is_risk(200, {"data": {}})
    assert not bridge.is_risk(404, None)


def test_shape_has_no_values():
    s = json.dumps(bridge.shape({"data": {"users": [{"username": "gizli", "pk": 5}]}}))
    assert "gizli" not in s and "username" in s


# ── akış ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_browsing_own_profile_then_likers_and_comments(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    ph = placeholder_id("ayse")                       # ZIP'ten gelmiş, ID'si bilinmeyen takipçi
    db.add(IgUser(id=ph, username="ayse"))
    await db.flush()
    db.add(Relationship(session_id=s.id, ig_user_id=ph, we_follow=False, they_follow=True))
    await db.commit()

    r = await _obs(db, kv, s, GQL, timeline_text())
    assert r["posts"] == 2

    likers = '{"data":{"xdt_api__v1__media__likers":{"users":[{"pk":"555","username":"ayse"},{"pk":"1001","username":"me"}]}}}'
    r = await _obs(db, kv, s, GQL, likers, page="https://www.instagram.com/p/OLD1/liked_by/", req=likers_req(BIG_PK))
    assert r["likers"] == 1                                            # kendi beğenisi sayılmaz

    comments = ('{"data":{"xdt_api__v1__media__media_id__comments__connection":{"edges":[{"node":'
                '{"text":"süper","created_at":1700000000,"user":{"pk":"556","username":"ali"}}}]}}}')
    r = await _obs(db, kv, s, GQL, comments, page="https://www.instagram.com/p/OLD1/")
    assert r["comments"] == 1

    post = await db.get(Post, BIG_PK)
    await db.refresh(post)
    assert post.likers_synced_at and post.comments_synced_at and post.shortcode == "OLD1"
    kinds = {(i.ig_user_id, i.interaction_type) for i in (await db.execute(select(Interaction))).scalars()}
    assert kinds == {(555, "like"), (556, "comment")}
    assert await db.get(IgUser, ph) is None                            # yer tutucu gerçek ID'ye bağlandı
    assert (await db.get(Relationship, (s.id, 555))).they_follow

    st = await bridge.status(db, kv, s, now=NOW)
    assert st["posts"] == 2 and st["likers_done"] == 1 and st["today_posts"] == 1 and st["today_people"] == 1
    assert st["connected"] and st["last_saved"]
    assert [t["shortcode"] for t in await bridge.todo(db, s)] == ["NEW1"]


@pytest.mark.asyncio
async def test_someone_elses_posts_and_likers_are_ignored(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    r = await _obs(db, kv, s, GQL, timeline_text(owner="baskasi", owner_pk=2002))
    assert r["posts"] == 0
    likers = '{"data":{"xdt_api__v1__media__likers":{"users":[{"pk":"5","username":"a"}]}}}'
    r = await _obs(db, kv, s, GQL, likers, page="https://www.instagram.com/p/XYZ/liked_by/", req=likers_req(999))
    assert r["ignored"] and r["likers"] == 0
    assert (await db.execute(select(Post))).first() is None
    assert (await db.execute(select(Interaction))).first() is None


@pytest.mark.asyncio
async def test_instagram_warning_pauses_and_repeat_pauses_longer(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    r = await _obs(db, kv, s, GQL, '{"message":"Please wait a few minutes","status":"fail"}', status=429, req=likers_req(1))
    assert r["warning"] and r["warning_kind"] == "rate_limit" and "çok sık" in r["message"] and r["paused_until"]
    await db.refresh(s)
    assert abs((s.paused_until - NOW).total_seconds() - 24 * 3600) < 5 and s.paused_reason.startswith(bridge.PAUSE_PREFIX)
    s.paused_until = None
    await db.commit()
    await _obs(db, kv, s, GQL, '{"message":"feedback_required","spam":true}', status=400,
               req=urlencode({"fb_api_req_friendly_name": "PolarisPostCommentsQuery"}))
    await db.refresh(s)
    assert abs((s.paused_until - NOW).total_seconds() - 72 * 3600) < 5


@pytest.mark.asyncio
async def test_unrecognised_likers_like_response_is_kept_as_shape_only(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    weird = '{"data":{"something_new":{"people_who_liked":[{"handle":"gizli"}]}}}'
    await _obs(db, kv, s, GQL, weird, req=urlencode({"fb_api_req_friendly_name": "PolarisLikersSheetQuery"}))
    [d] = await bridge.diagnostics(kv, s.id)
    assert d["friendly"] == "PolarisLikersSheetQuery" and "gizli" not in json.dumps(d)


@pytest.mark.asyncio
async def test_zip_profile_learns_its_real_id(db, make_session):
    s = await make_session(username="me", source="zip")
    s.ig_user_id = placeholder_id("me")
    await db.commit()
    await _obs(db, FakeKV(), s, GQL, timeline_text(owner_pk=4242))
    await db.refresh(s)
    assert s.ig_user_id == 4242


# ── API ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_observe_status_todo_and_cleanup(client, db, make_session):
    from app.main import app
    from app.routers.bridge import get_kv
    kv = FakeKV()
    app.dependency_overrides[get_kv] = lambda: kv
    try:
        s = await make_session(username="me")
        h = (await client.get("/api/bridge/hello?viewer_id=1001")).json()
        assert h["matched"] == str(s.id) and h["version"] == 2

        base = {"session_id": str(s.id), "viewer_id": 1001, "status": 200, "page_url": "https://www.instagram.com/me/"}
        bad = await client.post("/api/bridge/observe", json={**base, "url": "https://evil.example/x", "body": "{}"})
        assert bad.status_code == 400
        other = await client.post("/api/bridge/observe", json={**base, "viewer_id": 9, "url": GQL, "body": "{}"})
        assert other.status_code == 409
        r = await client.post("/api/bridge/observe", json={**base, "url": GQL, "body": timeline_text()})
        assert r.status_code == 200 and r.json()["posts"] == 2

        todo = (await client.get(f"/api/sessions/{s.id}/bridge/todo")).json()
        assert {t["shortcode"] for t in todo} == {"OLD1", "NEW1"} and todo[0]["id"] == "77"

        for uid, name, we, they in [(701, "sessiz", True, False), (702, "sadik", False, True)]:
            db.add(IgUser(id=uid, username=name))
            await db.flush()
            db.add(Relationship(session_id=s.id, ig_user_id=uid, we_follow=we, they_follow=they))
        db.add(Interaction(session_id=s.id, ig_user_id=702, post_id=BIG_PK, interaction_type="like"))
        await db.commit()
        c = (await client.get(f"/api/sessions/{s.id}/insights/cleanup")).json()
        assert {r["username"]: r["group"] for r in c["rows"]} == {"sessiz": "one_way_silent", "sadik": "loyal"}
        only = (await client.get(f"/api/sessions/{s.id}/insights/cleanup?group=one_way_silent")).json()
        assert [r["username"] for r in only["rows"]] == ["sessiz"] and only["total_rows"] == 1
        assert "sessiz" in (await client.get(f"/api/sessions/{s.id}/insights/cleanup.csv")).text

        assert (await client.post(f"/api/sessions/{s.id}/bridge/stop")).json()["stopped"]
        r = await client.post("/api/bridge/observe", json={**base, "url": GQL, "body": timeline_text()})
        assert r.json()["stopped"]
        st = (await client.get(f"/api/sessions/{s.id}/bridge/status")).json()
        assert st["stopped"] and st["posts"] == 2
        assert (await client.get(f"/api/sessions/{s.id}/bridge/diagnostics")).json() == []
    finally:
        app.dependency_overrides.pop(get_kv, None)


def test_warning_kind_for_user_language():
    assert bridge.warning_kind(429, None) == "rate_limit"
    assert bridge.warning_kind(400, {"message": "challenge_required"}) == "verify"
    assert bridge.warning_kind(400, {"message": "feedback_required", "spam": True}) == "action_blocked"
    assert bridge.warning_kind(401, {"message": "login_required"}) == "logged_out"


@pytest.mark.asyncio
async def test_unrelated_429_does_not_pause(db, make_session):
    """Instagram'ın arka plandaki önemsiz isteklerindeki 429 kullanıcıyı bekletmez; karar uygulamada."""
    s = await make_session(username="me")
    kv = FakeKV()
    for req in (urlencode({"fb_api_req_friendly_name": "PolarisLoggedOutExperimentQuery"}), ""):
        r = await _obs(db, kv, s, GQL, '{"message":"rate limited"}', status=429, req=req)
        assert not r["warning"]
    await db.refresh(s)
    assert s.paused_until is None
    r = await _obs(db, kv, s, "https://www.instagram.com/api/v1/media/5/likers/", "", status=429)
    assert r["warning"]


@pytest.mark.asyncio
async def test_status_explains_pause_in_user_language(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    await _obs(db, kv, s, GQL, '{"message":"challenge_required"}', status=400, req=likers_req(1))
    st = await bridge.status(db, kv, s)
    assert st["paused_until"] and "doğrulama" in st["paused_message"]


@pytest.mark.asyncio
async def test_extension_reports_its_version(client, make_session):
    from app.main import app
    from app.routers.bridge import get_kv
    kv = FakeKV()
    app.dependency_overrides[get_kv] = lambda: kv
    try:
        s = await make_session(username="me")
        base = {"session_id": str(s.id), "viewer_id": 1001, "status": 200, "url": GQL, "body": "{}"}
        assert (await client.post("/api/bridge/observe", json={**base, "ext_version": "2.1.0"})).status_code == 200
        assert (await client.get(f"/api/sessions/{s.id}/bridge/status")).json()["extension_version"] == "2.1.0"
        bad = await client.post("/api/bridge/observe", json={**base, "ext_version": "<script>"})
        assert bad.status_code == 422
    finally:
        app.dependency_overrides.pop(get_kv, None)
