"""Hayalet kontrolü iş durumu (Redis). Arayüzdeki canlı sayaç buradan beslenir."""
from __future__ import annotations

import time

JOB_TTL_S = 7 * 24 * 3600
LOCK_KEY = "ghost:lock"           # IP tek olduğu için aynı anda tek dilim çalışır


def job_key(session_id) -> str:
    return f"ghost:job:{session_id}"


def stop_key(session_id) -> str:
    return f"ghost:stop:{session_id}"


def _dec(v):
    return v.decode() if isinstance(v, bytes) else v


def read(r, session_id) -> dict:
    h = {_dec(k): _dec(v) for k, v in r.hgetall(job_key(session_id)).items()}
    if not h:
        return {"state": "idle", "total": 0, "done": 0, "ok": 0, "unreachable": 0, "unknown": 0, "message": "",
                "resume_at": None, "started_at": None, "updated_at": None}
    return {
        "state": h.get("state", "idle"),
        **{k: int(h.get(k, 0)) for k in ("total", "done", "ok", "unreachable", "unknown")},
        "message": h.get("message", ""),
        "resume_at": float(h["resume_at"]) if h.get("resume_at") else None,
        "started_at": float(h["started_at"]) if h.get("started_at") else None,
        "updated_at": float(h["updated_at"]) if h.get("updated_at") else None,
    }


def write(r, session_id, **fields) -> None:
    fields["updated_at"] = time.time()
    r.hset(job_key(session_id), mapping={k: ("" if v is None else str(v)) for k, v in fields.items()})
    r.expire(job_key(session_id), JOB_TTL_S)


def start(r, session_id, total: int) -> None:
    r.delete(job_key(session_id), stop_key(session_id))
    write(r, session_id, state="running", total=total, done=0, ok=0, unreachable=0, unknown=0,
          message="", resume_at="", started_at=time.time())


def request_stop(r, session_id) -> None:
    r.set(stop_key(session_id), "1", ex=3600)


def stop_requested(r, session_id) -> bool:
    return bool(r.get(stop_key(session_id)))


ACTIVE_STATES = ("running", "cooldown")
