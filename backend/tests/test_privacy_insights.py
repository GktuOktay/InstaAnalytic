from datetime import datetime, timedelta, timezone

import pytest

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.relationship import Relationship

pytestmark = pytest.mark.asyncio


async def _seed_fans(db, session):
    now = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
    for uid, name in ((11, "superfan"), (12, "warming_fan"), (13, "cooling_fan"), (14, "newbie"), (15, "ghost")):
        db.add(IgUser(id=uid, username=name))
    await db.flush()
    for i in range(10):        # i=0 en yeni
        db.add(Post(id=500 + i, session_id=session.id, shortcode=f"sc{i}", media_type="photo",
                    like_count=10, comment_count=1, taken_at=now - timedelta(days=i)))
    await db.flush()
    inter = lambda uid, pid, kind="like": db.add(Interaction(session_id=session.id, ig_user_id=uid, post_id=500 + pid, interaction_type=kind))
    for p in range(10): inter(11, p)
    inter(11, 0, "comment")
    for p in range(5): inter(12, p)               # yeni gönderilere yoğun ilgi...
    inter(12, 9)                                  # ...eskilere seyrek ilgi => ısınıyor
    for p in range(5, 10): inter(13, p)           # yalnız eski gönderiler
    inter(14, 0)                                  # tek, yeni etkileşim
    for uid in (11, 12, 13, 14, 15):
        db.add(Relationship(session_id=session.id, ig_user_id=uid, they_follow=uid != 14, we_follow=uid == 11))
    await db.commit()


async def test_fan_scores_tiers_and_trends(client, db, make_session):
    s = await make_session()
    await _seed_fans(db, s)
    r = await client.get(f"/api/sessions/{s.id}/insights/fans")
    assert r.status_code == 200
    d = r.json()
    assert d["scanned_posts"] == 10 and d["enough_data"] is True
    by = {f["username"]: f for f in d["fans"]}
    assert "ghost" not in by                                   # hiç etkileşimi olmayan listelenmez
    assert by["superfan"]["score"] == 100 and by["superfan"]["tier"] == "super"
    assert by["superfan"]["engagement_rate"] == 100.0
    assert by["warming_fan"]["trend"] == "warming" and by["cooling_fan"]["trend"] == "cooling"
    assert by["newbie"]["trend"] == "new" and by["newbie"]["tier"] == "occasional"
    assert by["newbie"]["follows_me"] is False and by["superfan"]["follows_me"] is True
    assert d["fans"][0]["username"] == "superfan"              # skora göre sıralı


async def test_fans_without_scanned_interactions_is_graceful(client, make_session):
    s = await make_session()
    d = (await client.get(f"/api/sessions/{s.id}/insights/fans")).json()
    assert d == {"total_posts": 0, "scanned_posts": 0, "enough_data": False, "fans": []}


async def test_fans_csv_neutralises_formula_injection(client, db, make_session):
    s = await make_session()
    await _seed_fans(db, s)
    evil = await db.get(IgUser, 15)
    evil.username = "=HYPERLINK(\"http://x\")"
    db.add(Interaction(session_id=s.id, ig_user_id=15, post_id=500, interaction_type="like"))
    await db.commit()
    r = await client.get(f"/api/sessions/{s.id}/insights/fans.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "'=HYPERLINK" in r.text and "\n=HYPERLINK" not in r.text


async def test_purge_removes_everything_but_keeps_shared_users(client, db, make_session):
    from sqlalchemy import select
    from app.models.session import Session
    a = await make_session("alice")
    b = await make_session("bob")
    db.add_all([IgUser(id=21, username="only_alice"), IgUser(id=22, username="shared")])
    await db.flush()
    db.add_all([Relationship(session_id=a.id, ig_user_id=21, they_follow=True),
                Relationship(session_id=a.id, ig_user_id=22, they_follow=True),
                Relationship(session_id=b.id, ig_user_id=22, they_follow=True)])
    await db.commit()

    r = await client.delete(f"/api/sessions/{a.id}/purge")
    assert r.status_code == 200 and r.json()["purged"] is True
    names = {u.username for u in (await db.execute(select(IgUser))).scalars()}
    assert "only_alice" not in names and "alice" not in names     # yetim kullanıcılar silindi
    assert {"shared", "bob"} <= names                              # başka profilde kullanılanlar kaldı
    assert (await db.execute(select(Session).where(Session.id == a.id))).first() is None
    assert (await client.get(f"/api/sessions/{a.id}")).status_code == 404


async def test_relationship_csv(client, db, make_session):
    s = await make_session()
    db.add(IgUser(id=31, username="mutual_pal"))
    await db.flush()
    db.add(Relationship(session_id=s.id, ig_user_id=31, they_follow=True, we_follow=True))
    await db.commit()
    r = await client.get(f"/api/sessions/{s.id}/export/relationships.csv")
    assert "mutual_pal" in r.text and r.text.startswith("﻿")


async def _posts(db, session, specs):
    for i, (hour_utc, likes, comments, kind) in enumerate(specs):
        db.add(Post(id=9000 + i, session_id=session.id, shortcode=f"g{i}", media_type=kind, like_count=likes,
                    comment_count=comments, taken_at=datetime(2026, 9, 1, hour_utc, 5, tzinfo=timezone.utc) + timedelta(weeks=i)))   # hep aynı haftanın günü
    await db.commit()


async def test_golden_hour_confidence_lift_and_data_threshold(client, db, make_session):
    s = await make_session()
    # 6 gönderi aynı saatte (12:05 UTC = 15:05 İstanbul), 1 gönderi başka saatte
    await _posts(db, s, [(12, 100, 0, "photo")] * 6 + [(3, 5, 0, "photo")])
    d = (await client.get(f"/api/sessions/{s.id}/analysis/golden-hour")).json()
    assert d["total_posts"] == 7 and d["enough_data"] is False
    best = max(d["slots"], key=lambda x: x["avg_engagement"])
    assert best["hour"] == 15 and best["post_count"] == 6 and best["confidence"] == "high" and best["lift"] > 1
    lone = min(d["slots"], key=lambda x: x["avg_engagement"])
    assert lone["post_count"] == 1 and lone["confidence"] == "low" and lone["lift"] < 1
    assert {h["hour"] for h in d["hours"]} == {15, 6}


async def test_golden_hour_filters_media_type_and_flags_enough_data(client, db, make_session):
    s = await make_session()
    await _posts(db, s, [(10, 50, 0, "reel")] * 15 + [(11, 1, 0, "photo")] * 2)
    assert (await client.get(f"/api/sessions/{s.id}/analysis/golden-hour")).json()["enough_data"] is True
    only_photo = (await client.get(f"/api/sessions/{s.id}/analysis/golden-hour?media_type=photo")).json()
    assert only_photo["total_posts"] == 2 and only_photo["enough_data"] is False
    assert set((await client.get(f"/api/sessions/{s.id}/analysis/golden-hour")).json()["media_types"]) == {"reel", "photo"}
