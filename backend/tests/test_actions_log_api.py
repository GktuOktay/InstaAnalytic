"""SPEC-001 AC-C17 (T-7a): Aksiyon Geçmişi ig_user_id=null kayıtlarını hatasız listeler."""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.action_log import ActionLog

pytestmark = pytest.mark.asyncio


async def test_every_outcome_is_audited_list_null_ig_user_id(client, db, make_session):
    """AC-C17: unsave kayıtları ig_user_id=null ile listelenir; target_ref/target_label döner."""
    s = await make_session()
    now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    db.add(ActionLog(session_id=s.id, ig_user_id=None, action_type="unsave", status="success",
                     target_ref="3141592653589793", target_label="abc123", created_at=now))
    db.add(ActionLog(session_id=s.id, ig_user_id=s.ig_user_id, action_type="follow", status="success",
                     created_at=now - timedelta(minutes=1)))
    await db.commit()

    r = await client.get(f"/api/sessions/{s.id}/actions/log")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    unsave, follow = rows
    assert unsave["ig_user_id"] is None and unsave["ig_username"] is None
    assert unsave["action_type"] == "unsave"
    assert unsave["target_ref"] == "3141592653589793"
    assert unsave["target_label"] == "abc123"
    assert follow["ig_user_id"] == s.ig_user_id and follow["ig_username"] == "me"
    assert follow["target_ref"] is None and follow["target_label"] is None


async def test_collection_protection_row_lists(client, db, make_session):
    """§7.8: collection_protection kaydı (kullanıcı yok, ad yok) hatasız listelenir."""
    s = await make_session()
    db.add(ActionLog(session_id=s.id, ig_user_id=None, action_type="collection_protection", status="success",
                     target_ref="17900000000000001", target_label="unprotected"))
    await db.commit()
    r = await client.get(f"/api/sessions/{s.id}/actions/log")
    assert r.status_code == 200 and r.json()[0]["target_label"] == "unprotected"


async def test_log_is_scoped_to_session(client, db, make_session):
    a, b = await make_session(username="a"), await make_session(username="b")
    db.add(ActionLog(session_id=a.id, ig_user_id=None, action_type="unsave", status="success", target_ref="1"))
    await db.commit()
    assert (await client.get(f"/api/sessions/{b.id}/actions/log")).json() == []
