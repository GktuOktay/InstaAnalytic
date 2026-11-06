import json
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.notification import Notification
from app.models.sync_job import SyncJob
from app.services import notifications

pytestmark = pytest.mark.asyncio


async def test_bridge_job_report_creates_a_notification_with_params_not_text(client, make_session, db):
    s = await make_session(source="zip")
    body = {"session_id": str(s.id), "kind": "likers", "outcome": "partial", "total": 10, "done": 10, "ok": 7, "saved": 640,
            "message": "x", "results": [], "started_at": "2026-11-05T10:00:00Z", "finished_at": "2026-11-05T10:20:00Z"}
    assert (await client.post("/api/bridge/jobs", json=body)).status_code == 201
    r = (await client.get("/api/notifications")).json()
    assert r["unread"] == 1
    [n] = r["items"]
    assert n["kind"] == "job_partial" and n["level"] == "warning" and n["link"] == "/monitor"
    assert n["params"] == {"job": "likers", "done": 10, "total": 10, "ok": 7, "saved": 640}
    assert n["read"] is False


async def test_read_one_read_all_and_clear(client, db):
    for k in ("job_ok", "job_failed", "ig_warning"):
        await notifications.add(db, kind=k, level="info")
    ids = [n["id"] for n in (await client.get("/api/notifications")).json()["items"]]
    assert (await client.post(f"/api/notifications/{ids[0]}/read")).json() == {"ok": True}
    assert (await client.get("/api/notifications/unread-count")).json() == {"unread": 2}
    assert (await client.get("/api/notifications?unread_only=true")).json()["items"].__len__() == 2
    assert (await client.post("/api/notifications/read-all")).json() == {"updated": 2}
    assert (await client.get("/api/notifications/unread-count")).json() == {"unread": 0}
    assert (await client.delete("/api/notifications")).json() == {"removed": 3}
    assert (await client.get("/api/notifications")).json() == {"unread": 0, "items": []}


async def test_same_unread_warning_is_not_repeated_within_the_hour(db, make_session):
    s = await make_session()
    for _ in range(3):
        await notifications.add(db, session_id=s.id, kind="ig_warning", level="error", dedupe=True)
    assert len((await db.execute(select(Notification))).scalars().all()) == 1


async def test_sync_job_results_become_notifications_but_a_running_job_does_not(db, make_session):
    s = await make_session()
    job = SyncJob(session_id=s.id, job_type="followers", status="completed", processed_items=120)
    db.add(job)
    await db.commit()
    # Celery tarafı eşzamanlı oturum kullanır; burada aynı mantığı async oturumla çağırıyoruz
    level = notifications.SYNC_LEVEL.get(job.status)
    await notifications.add(db, session_id=s.id, kind=f"sync_{job.status}", level=level, params={"job_type": job.job_type, "items": 120})
    [n] = (await db.execute(select(Notification))).scalars().all()
    assert (n.kind, n.level, n.params["items"]) == ("sync_completed", "success", 120)
    assert notifications.SYNC_LEVEL.get("running") is None


async def test_trim_keeps_only_the_newest(db):
    for i in range(notifications.KEEP + 15):
        db.add(Notification(kind="job_ok", level="success", params={"i": i}))
    await db.commit()
    await notifications.trim(db)
    rows = (await db.execute(select(Notification))).scalars().all()
    assert len(rows) == notifications.KEEP
