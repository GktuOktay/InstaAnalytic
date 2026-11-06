from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.services import notifications as svc

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n) -> dict:
    return {"id": n.id, "session_id": str(n.session_id) if n.session_id else None, "kind": n.kind, "level": n.level,
            "params": n.params or {}, "link": n.link, "created_at": n.created_at.isoformat() if n.created_at else None,
            "read": n.read_at is not None}


@router.get("")
async def list_notifications(limit: int = 30, unread_only: bool = False, db: AsyncSession = Depends(get_db)):
    return {"unread": await svc.unread_count(db), "items": [_out(n) for n in await svc.listing(db, limit, unread_only)]}


@router.get("/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db)):
    return {"unread": await svc.unread_count(db)}


@router.post("/read-all")
async def read_all(db: AsyncSession = Depends(get_db)):
    return {"updated": await svc.mark_all_read(db)}


@router.post("/{nid}/read")
async def read_one(nid: int, db: AsyncSession = Depends(get_db)):
    if nid < 1:
        raise HTTPException(404, "Bildirim bulunamadı")
    await svc.mark_read(db, nid)
    return {"ok": True}


@router.delete("")
async def clear_all(db: AsyncSession = Depends(get_db)):
    return {"removed": await svc.clear(db)}
