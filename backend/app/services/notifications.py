"""
Uygulama içi bildirimler (üst çubuktaki zil).

Sunucu metin üretmez: tür (kind) ve parametre kaydeder; arayüz seçili dilde gösterir. Bildirim yazılamasa bile
asıl iş (tarama, eklenti işi) asla bozulmaz.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

log = logging.getLogger(__name__)
KEEP = 200                          # bundan eskiler silinir
DEDUPE = timedelta(hours=1)         # aynı türden okunmamış bildirim bu süre içinde tekrar yazılmaz (yalnızca dedupe=True)

# Eklenti işi sonucu → seviye
JOB_LEVEL = {"ok": "success", "partial": "warning", "failed": "error", "stopped": "warning"}
SYNC_LEVEL = {"completed": "success", "failed": "error", "paused": "warning"}


def _new(session_id, kind: str, level: str, params: dict | None, link: str | None) -> Notification:
    return Notification(session_id=session_id, kind=kind, level=level, params=params or {}, link=link)


async def add(db: AsyncSession, *, session_id=None, kind: str, level: str = "info", params: dict | None = None,
              link: str | None = None, dedupe: bool = False, commit: bool = True) -> None:
    try:
        if dedupe:
            since = datetime.now(timezone.utc) - DEDUPE
            exists = (await db.execute(select(Notification.id).where(
                Notification.kind == kind, Notification.session_id == session_id,
                Notification.read_at.is_(None), Notification.created_at >= since).limit(1))).first()
            if exists:
                return
        db.add(_new(session_id, kind, level, params, link))
        if commit:
            await db.commit()
    except Exception:                                  # bildirim asıl işi bozmasın
        log.exception("bildirim yazılamadı: %s", kind)
        await db.rollback()


def add_sync(db, *, session_id=None, kind: str, level: str = "info", params: dict | None = None, link: str | None = None) -> None:
    """Celery görevleri için (eşzamanlı oturum)."""
    try:
        db.add(_new(session_id, kind, level, params, link))
        db.commit()
    except Exception:
        log.exception("bildirim yazılamadı: %s", kind)
        db.rollback()


def notify_sync_job(db, job) -> None:
    """Bir tarama / senkronizasyon işi bitince ya da durunca (Celery tarafı)."""
    level = SYNC_LEVEL.get(job.status)
    if level is None:
        return
    add_sync(db, session_id=job.session_id, kind=f"sync_{job.status}", level=level,
             params={"job_type": job.job_type, "items": job.processed_items or 0}, link="/monitor")


async def listing(db: AsyncSession, limit: int = 30, unread_only: bool = False) -> list[Notification]:
    q = select(Notification).order_by(Notification.id.desc()).limit(max(1, min(limit, 100)))
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    return list((await db.execute(q)).scalars())


async def unread_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count(Notification.id)).where(Notification.read_at.is_(None)))).scalar() or 0


async def mark_read(db: AsyncSession, nid: int) -> None:
    await db.execute(update(Notification).where(Notification.id == nid, Notification.read_at.is_(None))
                     .values(read_at=datetime.now(timezone.utc)))
    await db.commit()


async def mark_all_read(db: AsyncSession) -> int:
    res = await db.execute(update(Notification).where(Notification.read_at.is_(None)).values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return res.rowcount or 0


async def clear(db: AsyncSession) -> int:
    res = await db.execute(delete(Notification))
    await db.commit()
    return res.rowcount or 0


async def trim(db: AsyncSession) -> None:
    """Eski bildirimleri temizler: en yeni KEEP kadarı kalır."""
    cutoff = (await db.execute(select(Notification.id).order_by(Notification.id.desc()).offset(KEEP).limit(1))).scalar()
    if cutoff:
        await db.execute(delete(Notification).where(Notification.id <= cutoff))
        await db.commit()
