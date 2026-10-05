import uuid

import redis
from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.import_snapshot import ImportSnapshot
from app.models.session import Session
from app.services.import_service import apply_export
from app.services.ig_export import ExportError, parse_export_zip
from app.services.risk_profiles import PROFILES, get_profile
from app.services.scan_governor import ScanGovernor

router = APIRouter(prefix="/sessions/{session_id}", tags=["import"])

MAX_UPLOAD_BYTES = 100 * 1024 * 1024


def get_governor(session: Session) -> ScanGovernor:
    return ScanGovernor(redis.from_url(settings.redis_url), str(session.id), get_profile(session.risk_profile).scan)


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


@router.post("/import/zip")
async def import_zip(session_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Instagram 'Download your information' ZIP'ini (JSON) yükle. Instagram'a istek ATMAZ."""
    await _get_session(session_id, db)
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Dosya çok büyük (en fazla 100 MB)")
        chunks.append(chunk)
    try:
        data = parse_export_zip(b"".join(chunks))
        return await apply_export(db, session_id, data)
    except ExportError as e:
        await db.rollback()
        raise HTTPException(422, str(e))


@router.get("/import/snapshots")
async def list_snapshots(session_id: uuid.UUID, limit: int = 20, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    rows = (await db.execute(
        select(ImportSnapshot).where(ImportSnapshot.session_id == session_id)
        .order_by(desc(ImportSnapshot.created_at)).limit(min(limit, 100))
    )).scalars().all()
    return [{
        "id": str(r.id), "source": r.source, "created_at": r.created_at.isoformat(),
        "followers_count": r.followers_count, "following_count": r.following_count,
        "followers_gained": r.followers_gained, "followers_lost": r.followers_lost,
        "following_gained": r.following_gained, "following_lost": r.following_lost,
    } for r in rows]


@router.get("/scan/status")
async def scan_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await _get_session(session_id, db)
    return get_governor(session).status()


@router.delete("/scan/{kind}/progress", status_code=204)
async def reset_scan_progress(session_id: uuid.UUID, kind: str, db: AsyncSession = Depends(get_db)):
    """Duraklatılmış taramanın cursor'ını sil (baştan başlamak için)."""
    if kind not in ("followers", "following"):
        raise HTTPException(404, "Bilinmeyen tür")
    session = await _get_session(session_id, db)
    get_governor(session).clear_scan(kind)


# ── Risk profili ──────────────────────────────────────────────────────────────

class RiskProfileUpdate(BaseModel):
    profile: str
    acknowledge: bool = False     # agresif profil için risklerin okunduğunun onayı


@router.get("/risk-profile")
async def get_risk_profile(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await _get_session(session_id, db)
    return {"profile": get_profile(session.risk_profile).key, "profiles": [p.public() for p in PROFILES.values()]}


@router.put("/risk-profile")
async def set_risk_profile(session_id: uuid.UUID, body: RiskProfileUpdate, db: AsyncSession = Depends(get_db)):
    session = await _get_session(session_id, db)
    if body.profile not in PROFILES:
        raise HTTPException(422, "Bilinmeyen profil")
    if body.profile == "aggressive" and not body.acknowledge:
        raise HTTPException(422, "Agresif profil için riskleri onaylaman gerekiyor")
    session.risk_profile = body.profile
    await db.commit()
    return {"profile": body.profile}
