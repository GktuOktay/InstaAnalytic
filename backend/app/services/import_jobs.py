"""ZIP içe aktarma işi: diske akıtılan dosyayı arka planda işler, ilerlemeyi Redis'e yazar (canlı sayaç)."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid

import redis

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.services.import_service import apply_export
from app.services.ig_export import ExportError, parse_export_inputs

log = logging.getLogger(__name__)

JOB_TTL_S = 3600
_tasks: set[asyncio.Task] = set()         # GC'ye karşı referans tut


def _r():
    return redis.from_url(settings.redis_url, decode_responses=True)


def _key(job_id: str) -> str:
    return f"import:job:{job_id}"


def _active_key(session_id) -> str:
    return f"import:active:{session_id}"


def active_job(session_id) -> str | None:
    return _r().get(_active_key(session_id))


def get_job(job_id: str) -> dict | None:
    raw = _r().hgetall(_key(job_id))
    if not raw:
        return None
    raw["result"] = json.loads(raw["result"]) if raw.get("result") else None
    for k in ("scanned", "total", "followers_found", "following_found", "bytes_total"):
        raw[k] = int(raw.get(k) or 0)
    raw["started_at"] = float(raw.get("started_at") or 0)
    raw["elapsed_s"] = round((float(raw.get("finished_at") or 0) or time.time()) - raw["started_at"], 1)
    return raw


def create_job(session_id, bytes_total: int) -> str:
    job_id = uuid.uuid4().hex
    r = _r()
    r.hset(_key(job_id), mapping={
        "session_id": str(session_id), "stage": "reading", "scanned": 0, "total": 0,
        "followers_found": 0, "following_found": 0, "bytes_total": bytes_total,
        "started_at": time.time(), "error": "", "result": "",
    })
    r.expire(_key(job_id), JOB_TTL_S)
    r.set(_active_key(session_id), job_id, ex=JOB_TTL_S)
    return job_id


def start(session_id, job_id: str, inputs: list[tuple[str, str]]) -> None:
    """inputs: (özgün ad, geçici disk yolu)"""
    task = asyncio.create_task(_run(session_id, job_id, inputs))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _run(session_id, job_id: str, inputs: list[tuple[str, str]]) -> None:
    r = _r()
    key = _key(job_id)

    def on_parse(scanned: int, total: int, fo: int, fi: int) -> None:
        r.hset(key, mapping={"scanned": scanned, "total": total, "followers_found": fo, "following_found": fi})

    try:
        data = await asyncio.to_thread(parse_export_inputs, inputs, on_parse)
        r.hset(key, mapping={"stage": "saving", "followers_found": len(data.followers),
                             "following_found": len(data.following)})
        async with AsyncSessionLocal() as db:
            try:
                result = await apply_export(db, session_id, data, on_step=lambda s: r.hset(key, "stage", f"saving:{s}"))
            except ExportError:
                await db.rollback()
                raise
        r.hset(key, mapping={"stage": "done", "result": json.dumps(result), "finished_at": time.time()})
    except ExportError as e:
        r.hset(key, mapping={"stage": "error", "error": str(e), "finished_at": time.time()})
    except Exception:
        log.exception("ZIP içe aktarma başarısız")
        r.hset(key, mapping={"stage": "error", "error": "İşlenirken beklenmeyen bir hata oluştu.",
                             "finished_at": time.time()})
    finally:
        r.delete(_active_key(session_id))
        for _, path in inputs:
            try:
                os.unlink(path)
            except OSError:
                pass
