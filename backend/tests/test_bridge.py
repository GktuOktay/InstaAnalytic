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


async def _obs(db, kv, s, url, body, page="https://www.instagram.com/me/", req="", status=200, now=NOW, kinds=None):
    return await bridge.observe(db, kv, s, url=url, page_url=page, req_body=req, status=status, text=body, now=now,
                                kinds=kinds)


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
async def test_instagram_warning_warns_but_never_blocks(db, make_session):
    """Uyarı var, sınırlama yok: uyarıdan sonra da kayıt sürer, profil duraklatılmaz."""
    s = await make_session(username="me")
    kv = FakeKV()
    r = await _obs(db, kv, s, GQL, '{"message":"Please wait a few minutes","status":"fail"}', status=429, req=likers_req(1))
    assert r["warning"] and r["warning_kind"] == "rate_limit" and "çok sık" in r["message"]
    assert abs((datetime.fromisoformat(r["warning_until"]) - NOW).total_seconds() - 24 * 3600) < 5
    await db.refresh(s)
    assert s.paused_until is None                          # takip/çıkış ya da başka hiçbir şey durmaz

    r = await _obs(db, kv, s, GQL, timeline_text())        # uyarı sürerken de kaydeder
    assert r["posts"] == 2 and r["warning_until"]

    r = await _obs(db, kv, s, GQL, '{"message":"feedback_required","spam":true}', status=400,
                   req=urlencode({"fb_api_req_friendly_name": "PolarisPostCommentsQuery"}))
    assert abs((datetime.fromisoformat(r["warning_until"]) - NOW).total_seconds() - 72 * 3600) < 5


@pytest.mark.asyncio
async def test_old_bridge_pause_becomes_a_warning(db, make_session):
    s = await make_session(username="me")
    s.paused_until = NOW + timedelta(hours=5)
    s.paused_reason = f"{bridge.PAUSE_PREFIX} Instagram uyarı verdi (HTTP 429)"
    await db.commit()
    st = await bridge.status(db, FakeKV(), s, now=NOW)
    await db.refresh(s)
    assert s.paused_until is None and st["warning_until"] and "çok sık" in st["warning_message"]


@pytest.mark.asyncio
async def test_unrecognised_likers_like_response_is_kept_as_shape_only(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    weird = '{"data":{"something_new":{"people_who_liked":[{"handle":"gizli"}]}}}'
    await _obs(db, kv, s, GQL, weird, req=urlencode({"fb_api_req_friendly_name": "PolarisLikersSheetQuery"}))
    [d] = await bridge.diagnostics(kv, s.id)
    assert d["friendly"] == "PolarisLikersSheetQuery" and "gizli" not in json.dumps(d)


@pytest.mark.asyncio
async def test_unrecognised_post_grid_response_is_kept_for_the_posts_tool(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    weird = '{"data":{"grid_v9":{"tiles":[{"slug":"ABCDE","author":"me"}]}}}'
    await _obs(db, kv, s, GQL, weird, req=urlencode({"fb_api_req_friendly_name": "PolarisProfilePostsQuery"}), kinds={"posts"})
    [d] = await bridge.diagnostics(kv, s.id)
    assert d["friendly"] == "PolarisProfilePostsQuery" and "ABCDE" not in json.dumps(d)


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
    assert st["warning_until"] and "doğrulama" in st["warning_message"]


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


@pytest.mark.asyncio
async def test_only_the_tools_the_user_turned_on_are_saved(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    r = await bridge.observe(db, kv, s, url=GQL, page_url="https://www.instagram.com/me/", req_body="",
                             status=200, text=timeline_text(), now=NOW, kinds={"likers"})
    assert r["posts"] == 0                                   # gönderi listesi kapalı
    await bridge.observe(db, kv, s, url=GQL, page_url="https://www.instagram.com/me/", req_body="",
                         status=200, text=timeline_text(), now=NOW, kinds={"posts"})
    likers = '{"data":{"xdt_api__v1__media__likers":{"users":[{"pk":"555","username":"a"}]}}}'
    r = await bridge.observe(db, kv, s, url=GQL, page_url="https://www.instagram.com/p/OLD1/", req_body=likers_req(BIG_PK),
                             status=200, text=likers, now=NOW, kinds={"posts", "comments"})
    assert r["likers"] == 0 and (await db.execute(select(Interaction))).first() is None
    r = await bridge.observe(db, kv, s, url=GQL, page_url="https://www.instagram.com/p/OLD1/", req_body=likers_req(BIG_PK),
                             status=200, text=likers, now=NOW, kinds={"likers"})
    assert r["likers"] == 1



@pytest.mark.asyncio
async def test_comments_todo_is_separate(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    await _obs(db, kv, s, GQL, timeline_text())
    assert [t["shortcode"] for t in await bridge.todo(db, s, kind="comments")] == ["OLD1"]   # yalnızca yorumu olan
    assert {t["shortcode"] for t in await bridge.todo(db, s, kind="likers")} == {"OLD1", "NEW1"}



@pytest.mark.asyncio
async def test_extension_job_result_is_recorded(client, db, make_session):
    from app.models.sync_job import SyncJob
    s = await make_session(username="me")
    body = {"session_id": str(s.id), "kind": "likers", "outcome": "partial", "total": 3, "done": 3, "ok": 2, "saved": 57,
            "message": "Beğenenler: 3 gönderi açıldı, 2 tanesinden toplam 57 beğenen kaydedildi.\n• CCCCC: Beğenme sayısı sayfada bulunamadı.",
            "results": [{"shortcode": "AAAAA", "saved": 40, "seen": 40, "ok": True},
                        {"shortcode": "CCCCC", "saved": 0, "seen": 0, "ok": False, "note": "Beğenme sayısı sayfada bulunamadı."}],
            "started_at": "2026-11-01T10:00:00Z", "finished_at": "2026-11-01T10:05:00Z"}
    r = await client.post("/api/bridge/jobs", json=body)
    assert r.status_code == 201
    job = (await db.execute(select(SyncJob))).scalar()
    assert job.job_type == "bridge_likers" and job.status == "partial" and job.processed_items == 3
    assert "57 beğenen" in job.error_msg
    jobs = (await client.get("/api/tasks/jobs")).json()
    assert any(j["job_type"] == "bridge_likers" for j in (jobs if isinstance(jobs, list) else jobs.get("jobs", [])))
    assert (await client.post("/api/bridge/jobs", json={**body, "kind": "takip"})).status_code == 422


# ── 39 karakterlik uzun `code` ────────────────────────────────────────────────
# Instagram `code` alanına 28 karakterlik son ek ekleyebiliyor; gerçek kısa kod ilk 11 karakter.

LONG_PK = 3989028458000674667
LONG_CODE = "Ddb4D9uDe9r9EsiO3g53RZOrMdbKjihbFHB4ww0"
SHORT_CODE = "Ddb4D9uDe9r"


def long_code_timeline(owner="me"):
    node = {"id": f"{LONG_PK}_1001", "pk": str(LONG_PK), "code": LONG_CODE, "taken_at": 1700000000, "media_type": 1,
            "like_count": 140, "user": {"pk": "1001", "username": owner}}
    return json.dumps({"data": {"xdt_api__v1__feed__user_timeline_graphql_connection": {"edges": [{"node": node}]}}})


def test_short_code_matches_the_post_id():
    assert bridge.short_code(LONG_CODE, LONG_PK) == SHORT_CODE
    assert bridge.short_code(LONG_CODE, None) == SHORT_CODE          # kimlik yoksa ilk 11 karakter
    assert bridge.short_code("OLD1", BIG_PK) == "OLD1"               # kısa kodlara dokunulmaz
    assert bridge.find_media(bridge.parse_body(long_code_timeline()))[0]["shortcode"] == SHORT_CODE


@pytest.mark.asyncio
async def test_long_code_post_gets_its_likers_from_either_page_address(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    assert (await _obs(db, kv, s, GQL, long_code_timeline()))["posts"] == 1
    assert (await db.get(Post, LONG_PK)).shortcode == SHORT_CODE

    likers = '{"data":{"xdt_api__v1__media__likers":{"users":[{"pk":"555","username":"ayse"},{"pk":"556","username":"ali"}]}}}'
    for page in (f"https://www.instagram.com/p/{SHORT_CODE}/liked_by/", f"https://www.instagram.com/p/{LONG_CODE}/liked_by/"):
        r = await _obs(db, kv, s, GQL, likers, page=page, req="")        # kimlik yok: yalnızca sayfa adresiyle eşleşmeli
        assert r["likers"] == 2 and not r["ignored"]


@pytest.mark.asyncio
async def test_likers_connection_nodes_shape_is_saved(db, make_session):
    """Instagram'ın PolarisPostLikedByListDialogQuery yanıtı: data.fetch__XDTMediaDict.likers_connection.nodes"""
    s = await make_session(username="me")
    kv = FakeKV()
    await _obs(db, kv, s, GQL, long_code_timeline())
    body = json.dumps({"data": {"fetch__XDTMediaDict": {"likers_connection": {"fb_like_count": None, "nodes": [
        {"pk": "555", "username": "ayse", "full_name": "Ayşe"}, {"pk": "556", "username": "ali"},
        {"pk": "1001", "username": "me"}]}, "id": "x"}}})
    assert bridge.find_likers(bridge.parse_body(body), "https://www.instagram.com/api/graphql")[0]["username"] == "ayse"
    req = urlencode({"fb_api_req_friendly_name": "PolarisPostLikedByListDialogQuery", "variables": "{}"})
    r = await _obs(db, kv, s, "https://www.instagram.com/api/graphql", body,
                   page=f"https://www.instagram.com/p/{SHORT_CODE}/", req=req)
    assert r["likers"] == 2 and not r["ignored"]                       # kendi beğenisi sayılmaz


@pytest.mark.asyncio
async def test_missing_likers_scope_and_counts(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    await _obs(db, kv, s, GQL, long_code_timeline())              # 140 beğenili gönderi
    assert [p["shortcode"] for p in await bridge.todo(db, s, 10, "likers", "missing")] == [SHORT_CODE]

    body = json.dumps({"data": {"fetch__XDTMediaDict": {"likers_connection": {"nodes": [
        {"pk": str(5000 + i), "username": f"u{i}"} for i in range(99)]}}}})
    req = urlencode({"fb_api_req_friendly_name": "PolarisPostLikedByListDialogQuery", "variables": "{}"})
    await _obs(db, kv, s, "https://www.instagram.com/api/graphql", body, page=f"https://www.instagram.com/p/{SHORT_CODE}/", req=req)
    assert await bridge.todo(db, s, 10, "likers", "new") == []            # okundu sayılır
    assert [p["shortcode"] for p in await bridge.todo(db, s, 10, "likers", "missing")] == [SHORT_CODE]   # 99 / 140 eksik
    st = await bridge.status(db, kv, s)
    assert st["likers_saved"] == 99 and st["likers_incomplete"] == 1

    more = json.dumps({"data": {"fetch__XDTMediaDict": {"likers_connection": {"nodes": [
        {"pk": str(6000 + i), "username": f"v{i}"} for i in range(38)]}}}})
    await _obs(db, kv, s, "https://www.instagram.com/api/graphql", more, page=f"https://www.instagram.com/p/{SHORT_CODE}/liked_by/", req=req)
    assert await bridge.todo(db, s, 10, "likers", "missing") == []        # 137 / 140: tolerans içinde
    assert (await bridge.status(db, kv, s))["likers_incomplete"] == 0


def test_short_code_of_old_posts_is_ten_characters():
    pk = 998476951541358790                                 # 2015 tarihli gönderi: kısa kodu 10 karakter
    long = "3bTX9NCaDG" + "elynp5p90Hwoo9t9qRlVtUdeWD40"
    assert len(long) == 38
    assert bridge.short_code(long, pk) == "3bTX9NCaDG"
    assert bridge.short_code(long, None) == "3bTX9NCaDG"    # kimlik yoksa sondaki 28 karakter atılır


# ── Eklentinin yaptığı takip / takipten çıkma kuyruğu ───────────────────────────

from app.models.relationship import Relationship  # noqa: E402
from app.services import bridge_actions  # noqa: E402

DAY = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)      # 15:00 İstanbul: sessiz saat değil


async def _pool_user(db, s, uid, name, we_follow=True, they_follow=False):
    db.add(IgUser(id=uid, username=name))
    await db.flush()
    db.add(Relationship(session_id=s.id, ig_user_id=uid, we_follow=we_follow, they_follow=they_follow))
    await db.commit()


@pytest.mark.asyncio
async def test_actions_queue_enqueue_dedupe_and_order(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 701, "ali")
    await _pool_user(db, s, 702, "veli", we_follow=False)
    r = await bridge_actions.enqueue(db, s, "unfollow", [701, 702, 701])
    assert r == {"added": 1, "duplicate": 0, "skipped": 1}                 # veli zaten takip edilmiyor
    assert (await bridge_actions.enqueue(db, s, "unfollow", [701]))["duplicate"] == 1
    st = await bridge_actions.status(db, s, DAY)
    assert st["pending_count"] == 1 and st["pending"][0]["username"] == "ali" and st["enabled"]


@pytest.mark.asyncio
async def test_actions_next_respects_gates_budget_and_batch_size(db, make_session):
    s = await make_session(source="zip", allow_actions=False)
    await _pool_user(db, s, 711, "a")
    await bridge_actions.enqueue(db, s, "unfollow", [711])
    assert (await bridge_actions.next_batch(db, s, 10, DAY))["reason"] == "off"          # işlemler kapalı
    s.allow_actions = True
    await db.commit()
    quiet = datetime(2026, 11, 3, 0, 30, tzinfo=timezone.utc)                             # 03:30 İstanbul
    assert (await bridge_actions.next_batch(db, s, 10, quiet))["reason"] == "quiet_hours"
    b = await bridge_actions.next_batch(db, s, 10, DAY)
    assert [i["username"] for i in b["items"]] == ["a"] and b["delay"][0] >= 60            # en az 60 sn bekleme
    for i in range(2, 14):
        await _pool_user(db, s, 710 + i, f"u{i}")
    await bridge_actions.enqueue(db, s, "unfollow", list(range(712, 724)))
    assert len((await bridge_actions.next_batch(db, s, 50, DAY))["items"]) <= bridge_actions.MAX_BATCH


@pytest.mark.asyncio
async def test_actions_report_updates_relationship_log_and_limits(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 721, "ali")
    await bridge_actions.enqueue(db, s, "unfollow", [721])
    [item] = (await bridge_actions.next_batch(db, s, 1, DAY))["items"]
    assert (await bridge_actions.report(db, s, item["id"], "done", None, DAY))["status"] == "done"
    rel = (await db.execute(select(Relationship).where(Relationship.ig_user_id == 721))).scalar_one()
    await db.refresh(rel)
    assert rel.we_follow is False
    assert (await bridge_actions.report(db, s, item["id"], "done", None, DAY))["status"] == "done"   # çift bildirim zararsız
    st = await bridge_actions.status(db, s, DAY)
    assert st["pending_count"] == 0 and st["done_day"] == 1


@pytest.mark.asyncio
async def test_actions_hourly_limit_and_block_pause(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    hourly = bridge_actions.limits(s, DAY)[0]
    for i in range(hourly + 3):
        await _pool_user(db, s, 730 + i, f"h{i}")
    await bridge_actions.enqueue(db, s, "unfollow", [730 + i for i in range(hourly + 3)])
    for _ in range(hourly):
        [it] = (await bridge_actions.next_batch(db, s, 1, DAY))["items"]
        await bridge_actions.report(db, s, it["id"], "done", None, DAY)
    assert (await bridge_actions.next_batch(db, s, 5, DAY))["reason"] == "limit"        # saatlik tavan doldu
    later = DAY + timedelta(hours=2)
    [it] = (await bridge_actions.next_batch(db, s, 1, later))["items"]
    r = await bridge_actions.report(db, s, it["id"], "blocked", "Action Blocked", later)
    assert r["status"] == "pending" and r["paused_until"]
    assert (await bridge_actions.next_batch(db, s, 5, later + timedelta(hours=1)))["reason"] == "paused"


@pytest.mark.asyncio
async def test_queueing_is_always_accepted_and_nothing_is_lost_while_actions_are_off(client, make_session, db):
    s = await make_session(source="zip", allow_actions=False)
    await _pool_user(db, s, 741, "x")
    r = await client.post(f"/api/sessions/{s.id}/bridge/actions", json={"action": "unfollow", "user_ids": [741]})
    assert r.status_code == 200 and r.json()["added"] == 1                     # kapalıyken de kuyruğa girer
    nxt = (await client.get(f"/api/sessions/{s.id}/bridge/actions/next")).json()
    assert nxt["items"] == [] and nxt["reason"] == "off"                       # ama eklenti çağırınca verilmez
    assert (await client.get(f"/api/sessions/{s.id}/bridge/actions")).json()["pending_count"] == 1   # kayıp yok
    s.allow_actions = True
    await db.commit()
    nxt = (await client.get(f"/api/sessions/{s.id}/bridge/actions/next")).json()
    assert [i["username"] for i in nxt["items"]] == ["x"]                      # açılınca aynı kayıt gelir
    assert (await client.get(f"/api/sessions/{s.id}/bridge/actions")).json()["pending_count"] == 1
    assert (await client.delete(f"/api/sessions/{s.id}/bridge/actions")).json() == {"removed": 1}


@pytest.mark.asyncio
async def test_queued_people_can_be_taken_back_without_touching_done_ones(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    for i, n in ((751, "a"), (752, "b"), (753, "c")):
        await _pool_user(db, s, i, n)
    await bridge_actions.enqueue(db, s, "unfollow", [751, 752, 753])
    [first] = (await bridge_actions.next_batch(db, s, 1, DAY))["items"]
    await bridge_actions.report(db, s, first["id"], "done", None, DAY)            # a yapıldı
    assert await bridge_actions.cancel(db, s, [751, 752]) == 1                    # yalnızca bekleyen b geri alındı
    st = await bridge_actions.status(db, s, DAY)
    assert [p["username"] for p in st["pending"]] == ["c"] and st["done_day"] == 1
    assert await bridge_actions.cancel(db, s, []) == 0


@pytest.mark.asyncio
async def test_cancel_endpoint(client, make_session, db):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 761, "z")
    await client.post(f"/api/sessions/{s.id}/bridge/actions", json={"action": "unfollow", "user_ids": [761]})
    r = await client.post(f"/api/sessions/{s.id}/bridge/actions/cancel", json={"user_ids": [761]})
    assert r.json() == {"removed": 1}
    assert (await client.get(f"/api/sessions/{s.id}/bridge/actions")).json()["pending_count"] == 0


@pytest.mark.asyncio
async def test_failed_actions_are_retried_up_to_three_times_then_given_up(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 771, "ali")
    await _pool_user(db, s, 772, "veli")
    await bridge_actions.enqueue(db, s, "unfollow", [771, 772])
    first = (await bridge_actions.next_batch(db, s, 10, DAY))["items"]
    ali = next(i for i in first if i["username"] == "ali")
    r = await bridge_actions.report(db, s, ali["id"], "failed", "düğme yok", DAY)
    assert r == {"ok": True, "status": "pending", "attempts": 1, "retry": True}          # 1. başarısızlık: kuyrukta kalır
    nxt = (await bridge_actions.next_batch(db, s, 10, DAY))["items"]
    assert [i["username"] for i in nxt] == ["veli", "ali"]                              # yeni işler önce, tekrar deneme sonda
    assert (await bridge_actions.report(db, s, ali["id"], "failed", "düğme yok", DAY))["attempts"] == 2
    last = await bridge_actions.report(db, s, ali["id"], "failed", "düğme yok", DAY)
    assert last == {"ok": True, "status": "failed"}                                     # 3. başarısızlıktan sonra vazgeçilir
    st = await bridge_actions.status(db, s, DAY)
    assert [p["username"] for p in st["pending"]] == ["veli"] and st["done_day"] == 0


@pytest.mark.asyncio
async def test_missing_account_is_not_retried(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 781, "yok")
    await bridge_actions.enqueue(db, s, "unfollow", [781])
    [it] = (await bridge_actions.next_batch(db, s, 1, DAY))["items"]
    assert (await bridge_actions.report(db, s, it["id"], "not_found", "silinmiş", DAY))["status"] == "failed"


@pytest.mark.asyncio
async def test_a_retry_that_succeeds_counts_as_done(db, make_session):
    s = await make_session(source="zip", allow_actions=True)
    await _pool_user(db, s, 791, "ali")
    await bridge_actions.enqueue(db, s, "unfollow", [791])
    [it] = (await bridge_actions.next_batch(db, s, 1, DAY))["items"]
    await bridge_actions.report(db, s, it["id"], "failed", "geçici", DAY)
    assert (await bridge_actions.report(db, s, it["id"], "done", None, DAY))["status"] == "done"
    assert (await bridge_actions.status(db, s, DAY))["done_day"] == 1


@pytest.mark.asyncio
async def test_queue_history_is_kept_and_lists_everything_that_finished(client, make_session, db):
    s = await make_session(source="zip", allow_actions=True)
    for i, n in ((801, "a"), (802, "b"), (803, "c"), (804, "d")):
        await _pool_user(db, s, i, n)
    await bridge_actions.enqueue(db, s, "unfollow", [801, 802, 803, 804])
    items = {i["username"]: i["id"] for i in (await bridge_actions.next_batch(db, s, 10, DAY))["items"]}
    await bridge_actions.report(db, s, items["a"], "done", None, DAY)
    await bridge_actions.report(db, s, items["b"], "already", "Zaten takip etmiyorsunuz.", DAY)
    await bridge_actions.report(db, s, items["c"], "not_found", "Hesap bulunamadı", DAY)
    h = (await client.get(f"/api/sessions/{s.id}/bridge/actions/history")).json()
    assert h["counts"] == {"pending": 1, "done": 1, "skipped": 1, "failed": 1}
    assert {i["username"]: i["status"] for i in h["items"]} == {"a": "done", "b": "skipped", "c": "failed"}   # bekleyen d burada yok
    assert (await client.get(f"/api/sessions/{s.id}/bridge/actions/history?state=failed")).json()["items"][0]["note"] == "Hesap bulunamadı"
    # Hiçbir kayıt kendiliğinden silinmez: bekleyenleri temizlemek geçmişe dokunmaz
    await client.delete(f"/api/sessions/{s.id}/bridge/actions")
    assert (await client.get(f"/api/sessions/{s.id}/bridge/actions/history")).json()["counts"] == {"pending": 0, "done": 1, "skipped": 1, "failed": 1}


@pytest.mark.asyncio
async def test_a_users_own_click_is_done_first_and_at_human_pace(client, make_session, db):
    s = await make_session(source="zip", allow_actions=True)
    for i, n in ((811, "toplu1"), (812, "toplu2"), (813, "tikladim")):
        await _pool_user(db, s, i, n)
    await bridge_actions.enqueue(db, s, "unfollow", [811, 812])                       # toplu: yavaş
    r = await client.post(f"/api/sessions/{s.id}/bridge/actions", json={"action": "unfollow", "user_ids": [813], "manual": True})
    assert r.json()["added"] == 1
    nxt = await bridge_actions.next_batch(db, s, 10, DAY)
    assert [i["username"] for i in nxt["items"]] == ["tikladim", "toplu1", "toplu2"]      # tıklanan önce
    assert [i["manual"] for i in nxt["items"]] == [True, False, False]
    assert nxt["manual_delay"] == [15, 35] and nxt["delay"][0] >= 60                      # toplu hız aynı kalır
    assert nxt["api_delay"] == [3, 5]                                                     # doğrudan API: 3-5 sn
    assert all(isinstance(i["ig_user_id"], int) for i in nxt["items"])                    # eklenti kimliği buradan alır
    # sıradaki bir kişiye sonradan tek tek tıklayınca öne alınır
    await client.post(f"/api/sessions/{s.id}/bridge/actions", json={"action": "unfollow", "user_ids": [812], "manual": True})
    items = (await bridge_actions.next_batch(db, s, 10, DAY))["items"]
    assert [(i["username"], i["manual"]) for i in items] == [("toplu2", True), ("tikladim", True), ("toplu1", False)]


@pytest.mark.asyncio
async def test_bulk_selections_are_never_manual_so_they_stay_slow(client, make_session, db):
    s = await make_session(source="zip", allow_actions=True)
    for i in range(821, 826):
        await _pool_user(db, s, i, f"k{i}")
    await client.post(f"/api/sessions/{s.id}/bridge/actions", json={"action": "unfollow", "user_ids": list(range(821, 826)), "manual": True})
    assert not any(i["manual"] for i in (await bridge_actions.next_batch(db, s, 10, DAY))["items"])   # 4+ kişi = toplu, insan hızı sayılmaz
