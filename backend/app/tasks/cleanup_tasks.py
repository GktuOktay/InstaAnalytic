"""Kaydedilenleri temizleme zamanlanmış görevleri (SPEC-001 §7.4, AC-C32; T-4a).

- `cleanup_stale` (60 sn, `expires=55`): `T_eff`'i aşan `running` partiler -> `stopped(stale)`; takılma eşiğini aşan
  `running` taramalar -> `failed`. Güncellemeler koşulludur (I-6). Aynı çalıştırmada süresi dolan taslaklar
  `expired` olur (§6.8, T-4c: `cleanup_batch.expire_drafts`); sonuç sözlüğü değişmez, sayı yalnız log'a yazılır.
- `cleanup_retention` (günde bir): 7 gün kuralı, eski taslaklar, tür başına son 20 tarama, 48 saatten eski yazma izinleri.

Servisler async'tir (`services/cleanup_scan.py`); Celery görevi senkrondur. Her çalıştırma kendi olay döngüsünde
(`asyncio.run`) ve havuzsuz (`NullPool`) yeni bir motorla çalışır: havuzlu bağlantılar başka bir döngüye ait olduğundan
paylaşılan `AsyncSessionLocal` burada kullanılmaz. Saat yalnız burada okunur; servisler `now` alır.
`next`, `precheck` ve `result` bu görevlerden bağımsızdır ve hiçbir silme sorgusu çalıştırmaz.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services import cleanup_batch, cleanup_scan
from app.tasks.celery_app import celery_app

log = logging.getLogger("cleanup_tasks")


def make_engine():
    return create_async_engine(settings.database_url, poolclass=NullPool)


async def _run(work):
    engine = make_engine()
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            out = await work(db, datetime.now(timezone.utc))
            await db.commit()
            return out
    finally:
        await engine.dispose()


@celery_app.task(name="cleanup_stale")
def cleanup_stale() -> dict:
    async def work(db, now):
        out = {"scans_failed": await cleanup_scan.fail_stale_scans(db, now),
               "batches_stopped": await cleanup_scan.stop_stale_batches(db, now)}
        drafts = await cleanup_batch.expire_drafts(db, now)
        if drafts:
            log.info("cleanup_stale drafts_expired=%s", drafts)
        return out

    out = asyncio.run(_run(work))
    if out["scans_failed"] or out["batches_stopped"]:
        log.info("cleanup_stale scans_failed=%s batches_stopped=%s", out["scans_failed"], out["batches_stopped"])
    return out


@celery_app.task(name="cleanup_retention")
def cleanup_retention() -> dict:
    async def work(db, now):
        return await cleanup_scan.run_retention(db, now)

    out = asyncio.run(_run(work))
    log.info("cleanup_retention %s", out)
    return out
