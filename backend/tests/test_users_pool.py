import pytest

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.relationship import Relationship

pytestmark = pytest.mark.asyncio


async def _user(db, s, uid, name, we=False, they=False, likes=0):
    db.add(IgUser(id=uid, username=name))
    await db.flush()
    db.add(Relationship(session_id=s.id, ig_user_id=uid, we_follow=we, they_follow=they))
    for i in range(likes):
        db.add(Interaction(session_id=s.id, ig_user_id=uid, post_id=9000 + i, interaction_type="like"))


async def test_people_I_unfollowed_leave_my_list_unless_they_still_follow_me_or_engage(client, make_session, db):
    s = await make_session(source="zip")
    for i in range(3):
        db.add(Post(id=9000 + i, session_id=s.id, shortcode=f"P{i}", like_count=1, comment_count=0))
    await db.flush()
    await _user(db, s, 701, "takipte", we=True)
    await _user(db, s, 702, "cikardim", we=False, they=False)                    # takipten çıktım, ilişki kalmadı, etkileşim yok
    await _user(db, s, 703, "cikardim_ama_o_takipte", we=False, they=True)        # çıktım ama o beni takip ediyor
    await _user(db, s, 704, "cikardim_ama_begenir", we=False, they=False, likes=2)
    await db.commit()
    r = (await client.get(f"/api/sessions/{s.id}/users?limit=100")).json()
    names = {u["username"] for u in r["items"]}
    assert names == {"takipte", "cikardim_ama_o_takipte", "cikardim_ama_begenir"}   # "cikardim" düştü
    assert r["total"] == 3


async def test_unfollow_done_by_the_extension_removes_the_person_from_the_list(client, make_session, db):
    from app.services import bridge_actions
    s = await make_session(source="zip", allow_actions=True)
    await _user(db, s, 711, "gidecek", we=True)
    await db.commit()
    await bridge_actions.enqueue(db, s, "unfollow", [711])
    [it] = (await bridge_actions.next_batch(db, s, 1))["items"]
    assert [u["username"] for u in (await client.get(f"/api/sessions/{s.id}/users")).json()["items"]] == ["gidecek"]
    await bridge_actions.report(db, s, it["id"], "done", None)
    assert (await client.get(f"/api/sessions/{s.id}/users")).json()["items"] == []
