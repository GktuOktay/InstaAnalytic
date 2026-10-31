import json
import random
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.relationship import Relationship
from app.services import bridge
from app.services.user_ids import placeholder_id

NOW = datetime.now(timezone.utc)
BIG_PK = 3412345678901234567          # JS sayısına sığmaz; ham metinden doğru okunmalı


class FakeKV:
    def __init__(self):
        self.d = {}

    async def get(self, k): return self.d.get(k)
    async def set(self, k, v, ex=None): self.d[k] = str(v)
    async def delete(self, *keys):
        for k in keys: self.d.pop(k, None)

    def unpace(self, sid):
        self.d.pop(f"bridge:{sid}:next_at", None)


def feed_text(owner="me", owner_pk=1001):
    old = int((NOW - timedelta(days=10)).timestamp())
    young = int((NOW - timedelta(days=1)).timestamp())
    return (
        '{"items":['
        f'{{"id":"{BIG_PK}_{owner_pk}","pk":{BIG_PK},"code":"OLD1","taken_at":{old},"media_type":8,'
        f'"like_count":2,"comment_count":1,"caption":{{"text":"eski"}},"user":{{"pk":{owner_pk},"username":"{owner}"}},'
        '"carousel_media":[{"image_versions2":{"candidates":[{"url":"big"},{"url":"small"}]}}]},'
        f'{{"id":"77_{owner_pk}","pk":77,"code":"NEW1","taken_at":{young},"media_type":1,"like_count":5,'
        f'"comment_count":0,"user":{{"pk":{owner_pk},"username":"{owner}"}}}}'
        '],"more_available":false,"status":"ok"}'
    )


# ── ayrıştırma ───────────────────────────────────────────────────────────────

def test_parse_feed_keeps_big_ids_and_owner():
    posts, owner, nxt = bridge.parse_feed(bridge.parse_body(feed_text()))
    assert [p["id"] for p in posts] == [BIG_PK, 77]
    assert posts[0]["media_type"] == "ALBUM" and posts[0]["thumbnail_url"] == "small"
    assert posts[0]["caption"] == "eski"
    assert owner == {"pk": 1001, "username": "me"} and nxt is None


def test_parse_comments_encodes_object_cursor():
    body = {"comments": [{"user": {"pk": 5, "username": "a"}, "text": "güzel", "created_at": 1700000000}],
            "has_more_comments": True, "next_min_id": {"cached_comments_cursor": "x", "bifilter_token": "y"}}
    comments, nxt = bridge.parse_comments(body)
    assert comments[0]["user"]["username"] == "a" and json.loads(nxt)["bifilter_token"] == "y"
    path = bridge._with_cursor(bridge.COMMENTS_PATH.format(pid=1), "min_id", nxt)
    assert bridge.ALLOWED_PATH.match(path)


def test_risk_signals():
    assert bridge.is_risk(429, {})
    assert bridge.is_risk(200, None)                                   # HTML giriş sayfası
    assert bridge.is_risk(400, {"message": "challenge_required"})
    assert bridge.is_risk(400, {"message": "feedback_required", "spam": True})
    assert not bridge.is_risk(200, {"users": []})
    assert not bridge.is_risk(500, None)


def test_allowed_paths_reject_anything_else():
    ok = ["/api/v1/feed/user/1001/?count=12", "/api/v1/feed/user/1/?count=12&max_id=3412_1001",
          "/api/v1/media/5/likers/", bridge.COMMENTS_PATH.format(pid=9)]
    bad = ["/api/v1/friendships/create/5/", "/api/v1/media/5/like/", "https://evil/api/v1/media/5/likers/",
           "/api/v1/media/5/likers/?max_id=1&x=2"]
    assert all(bridge.ALLOWED_PATH.match(p) for p in ok)
    assert not any(bridge.ALLOWED_PATH.match(p) for p in bad)


# ── akış ─────────────────────────────────────────────────────────────────────

async def _report(db, kv, s, job, status, text):
    return await bridge.handle_report(db, kv, s, job["path"], status, text, now=NOW, rng=random.Random(1))


@pytest.mark.asyncio
async def test_full_cycle_feed_likers_comments_and_heals_zip_names(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    # ZIP'ten gelmiş, ID'si bilinmeyen takipçi
    ph = placeholder_id("ayse")
    db.add(IgUser(id=ph, username="ayse"))
    await db.flush()
    db.add(Relationship(session_id=s.id, ig_user_id=ph, we_follow=False, they_follow=True))
    await db.commit()

    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    assert job["kind"] == "feed" and job["path"] == "/api/v1/feed/user/1001/?count=12"
    r = await _report(db, kv, s, job, 200, feed_text())
    assert r["posts"] == 2 and r["wait_s"] >= bridge.FEED_PAGE_S[0]

    assert (await bridge.plan_next(db, kv, s, 1001, now=NOW))["reason"] == "pacing"
    kv.unpace(s.id)

    # En yeni (1 günlük) gönderi beklemeden hemen okunur
    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    assert job["kind"] == "likers" and job["post_id"] == 77
    await _report(db, kv, s, job, 200, '{"users":[{"pk":557,"username":"veli"}]}')
    kv.unpace(s.id)

    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    assert job == {"action": "fetch", "kind": "likers", "path": f"/api/v1/media/{BIG_PK}/likers/", "post_id": BIG_PK}
    likers = '{"users":[{"pk":555,"username":"ayse","full_name":"Ayşe"},{"pk":1001,"username":"me"}],"status":"ok"}'
    r = await _report(db, kv, s, job, 200, likers)
    assert r["saved"] == 1                                            # kendi beğenisi sayılmaz
    assert r["wait_s"] <= bridge.WITHIN_POST_S[1] * 1.6               # yorum listesine geçiyor
    kv.unpace(s.id)

    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    assert job["kind"] == "comments" and job["post_id"] == BIG_PK
    comments = '{"comments":[{"user":{"pk":556,"username":"ali"},"text":"süper","created_at":1700000000}],"has_more_comments":false}'
    await _report(db, kv, s, job, 200, comments)
    kv.unpace(s.id)

    assert (await bridge.plan_next(db, kv, s, 1001, now=NOW))["reason"] == "up_to_date"

    post = await db.get(Post, BIG_PK)
    await db.refresh(post)
    assert post.likers_synced_at and post.comments_synced_at and post.shortcode == "OLD1"
    kinds = {(i.ig_user_id, i.interaction_type) for i in (await db.execute(select(Interaction))).scalars()}
    assert kinds == {(555, "like"), (556, "comment"), (557, "like")}
    assert await db.get(IgUser, ph) is None                            # yer tutucu gerçek ID'ye bağlandı
    rel = await db.get(Relationship, (s.id, 555))
    assert rel and rel.they_follow

    st = await bridge.status(db, kv, s, now=NOW)
    assert st["posts"] == 2 and st["likers_done"] == 2 and st["refresh_pending"] == 1 and st["connected"]

    # 3 günü dolunca geç gelen beğeniler için bir kez daha okunur, sonra bir daha istenmez
    later = NOW + timedelta(days=3)
    await db.execute(update(Post).values(last_synced_at=later))      # gönderi listesi taze
    await db.commit()
    job = await bridge.plan_next(db, kv, s, 1001, now=later)
    assert job["kind"] == "likers" and job["post_id"] == 77
    await bridge.handle_report(db, kv, s, job["path"], 200, '{"users":[{"pk":558,"username":"geç"}]}',
                               now=later, rng=random.Random(1))
    kv.unpace(s.id)
    assert (await bridge.plan_next(db, kv, s, 1001, now=later))["reason"] == "up_to_date"
    assert (await bridge.status(db, kv, s, now=later))["refresh_pending"] == 0


@pytest.mark.asyncio
async def test_risk_signal_pauses_everything_and_repeat_pauses_longer(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    r = await _report(db, kv, s, job, 429, '{"message":"Please wait a few minutes","status":"fail"}')
    assert r["reason"] == "paused" and abs(r["wait_s"] - 24 * 3600) < 5
    await db.refresh(s)
    assert s.paused_reason.startswith(bridge.PAUSE_PREFIX)
    assert (await bridge.plan_next(db, kv, s, 1001, now=NOW))["reason"] == "paused"

    s.paused_until = None
    await db.commit()
    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    r = await _report(db, kv, s, job, 200, "<html>login</html>")
    assert abs(r["wait_s"] - 72 * 3600) < 5


@pytest.mark.asyncio
async def test_wrong_account_is_refused(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    assert (await bridge.plan_next(db, kv, s, 99999, now=NOW))["reason"] == "wrong_account"
    job = await bridge.plan_next(db, kv, s, 1001, now=NOW)
    with pytest.raises(bridge.ReportError):
        await _report(db, kv, s, job, 200, feed_text(owner="baskasi"))
    assert (await bridge.plan_next(db, kv, s, 1001, now=NOW))["reason"] == "wrong_account"
    assert (await db.execute(select(Post))).first() is None


@pytest.mark.asyncio
async def test_report_must_match_pending_job(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    with pytest.raises(bridge.ReportError):
        await bridge.handle_report(db, kv, s, "/api/v1/media/5/likers/", 200, "{}", now=NOW)


@pytest.mark.asyncio
async def test_zip_profile_adopts_real_id_from_feed(db, make_session):
    s = await make_session(username="me", source="zip")
    s.ig_user_id = placeholder_id("me")
    await db.commit()
    kv = FakeKV()
    job = await bridge.plan_next(db, kv, s, 4242, now=NOW)
    assert job["path"] == "/api/v1/feed/user/4242/?count=12"
    await _report(db, kv, s, job, 200, feed_text(owner_pk=4242))
    await db.refresh(s)
    assert s.ig_user_id == 4242


@pytest.mark.asyncio
async def test_daily_cap_stops_reading_more_posts(db, make_session):
    s = await make_session(username="me")
    kv = FakeKV()
    for i in range(bridge.daily_cap("safe")):
        db.add(Post(id=10 + i, session_id=s.id, shortcode=f"c{i}", like_count=1, comment_count=0,
                    taken_at=NOW - timedelta(days=30), last_synced_at=NOW,
                    likers_synced_at=NOW - timedelta(hours=1), comments_synced_at=NOW))
    db.add(Post(id=99, session_id=s.id, shortcode="todo", like_count=3, taken_at=NOW - timedelta(days=40), last_synced_at=NOW))
    await db.commit()
    assert (await bridge.plan_next(db, kv, s, 1001, now=NOW))["reason"] == "daily_cap"


@pytest.mark.asyncio
async def test_break_cadence_inserts_long_pause():
    kv = FakeKV()
    rng = random.Random(3)
    waits = [await bridge._post_done(kv, "s", rng) for _ in range(30)]
    assert sum(w >= bridge.BREAK_S[0] for w in waits) >= 3
    assert all(w >= bridge.BETWEEN_POSTS_S[0] for w in waits)


# ── API ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_hello_next_report_and_cleanup(client, db, make_session):
    from app.main import app
    from app.routers.bridge import get_kv
    kv = FakeKV()
    app.dependency_overrides[get_kv] = lambda: kv
    try:
        s = await make_session(username="me")
        h = (await client.get("/api/bridge/hello?viewer_id=1001")).json()
        assert h["matched"] == str(s.id)

        job = (await client.post("/api/bridge/next", json={"session_id": str(s.id), "viewer_id": 1001})).json()
        assert job["kind"] == "feed"
        bad = await client.post("/api/bridge/report", json={"session_id": str(s.id), "viewer_id": 1001,
                                                             "path": "/api/v1/friendships/create/1/", "status": 200, "body": "{}"})
        assert bad.status_code == 400
        r = await client.post("/api/bridge/report", json={"session_id": str(s.id), "viewer_id": 1001,
                                                           "path": job["path"], "status": 200, "body": feed_text()})
        assert r.status_code == 200 and r.json()["posts"] == 2

        # takip ettiğim ama beni takip etmeyen ve hiç beğenmeyen biri + beğenen bir takipçi
        for uid, name, we, they in [(701, "sessiz", True, False), (702, "sadik", False, True)]:
            db.add(IgUser(id=uid, username=name))
            await db.flush()
            db.add(Relationship(session_id=s.id, ig_user_id=uid, we_follow=we, they_follow=they))
        db.add(Interaction(session_id=s.id, ig_user_id=702, post_id=BIG_PK, interaction_type="like"))
        await db.commit()

        c = (await client.get(f"/api/sessions/{s.id}/insights/cleanup")).json()
        groups = {r["username"]: r["group"] for r in c["rows"]}
        assert groups == {"sessiz": "one_way_silent", "sadik": "loyal"}
        assert c["enough_data"] is False and c["counts"]["one_way_silent"] == 1
        only = (await client.get(f"/api/sessions/{s.id}/insights/cleanup?group=one_way_silent")).json()
        assert [r["username"] for r in only["rows"]] == ["sessiz"] and only["total_rows"] == 1
        csv = await client.get(f"/api/sessions/{s.id}/insights/cleanup.csv")
        assert "sessiz" in csv.text

        assert (await client.post(f"/api/sessions/{s.id}/bridge/stop")).json()["stopped"]
        st = (await client.get(f"/api/sessions/{s.id}/bridge/status")).json()
        assert st["stopped"] and st["posts"] == 2
    finally:
        app.dependency_overrides.pop(get_kv, None)
