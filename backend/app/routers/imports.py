import asyncio
import os
from datetime import datetime
import tempfile
import uuid

import redis
from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.import_snapshot import ImportSnapshot
from app.models.relationship import Relationship
from app.models.sync_job import SyncJob
from app.models.session import Session
from app.services import import_jobs
from app.services.risk_profiles import PROFILES, get_profile
from app.services.scan_governor import ScanGovernor

router = APIRouter(prefix="/sessions/{session_id}", tags=["import"])

# Sınır yalnızca disk koruması. Arayüz ZIP'i tarayıcıda açıp yalnızca JSON gönderdiği için normalde KB–MB düzeyinde gelir;
# tarayıcı açamazsa tam paket de (diske akıtılarak) kabul edilir. Asıl güvenlik sınırı ig_export.MAX_*_BYTES (açılmış JSON).
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024
MAX_FILES = 50


def get_governor(session: Session) -> ScanGovernor:
    return ScanGovernor(redis.from_url(settings.redis_url), str(session.id), get_profile(session.risk_profile).scan)


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


def _spool_to_disk(src, limit: int) -> tuple[str, int]:
    """Yüklenen dosyayı belleğe almadan diske kopyalar. (yol, bayt) döner; limit aşılırsa ValueError."""
    fd, path = tempfile.mkstemp(prefix="igimp_")
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := src.read(4 * 1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ValueError
                out.write(chunk)
    except BaseException:
        os.unlink(path)
        raise
    return path, size


@router.post("/import/zip", status_code=202)
async def import_zip(session_id: uuid.UUID, files: list[UploadFile] = File(...), db: AsyncSession = Depends(get_db)):
    """Instagram verisini yükle: ZIP (parçalı paketler dahil) ve/veya tek tek followers_*.json / following.json.
    Instagram'a istek ATMAZ.

    Dosyalar diske akıtılır, işleme arka planda yapılır; ilerleme GET /import/jobs/{job_id} ile izlenir.
    """
    await _get_session(session_id, db)
    if not files or len(files) > MAX_FILES:
        raise HTTPException(422, f"1–{MAX_FILES} dosya yükleyebilirsin")
    if await asyncio.to_thread(import_jobs.active_job, session_id):
        raise HTTPException(409, "Bu profil için bir içe aktarma zaten sürüyor")
    inputs: list[tuple[str, str]] = []
    remaining = MAX_UPLOAD_BYTES
    try:
        for f in files:
            path, size = await asyncio.to_thread(_spool_to_disk, f.file, remaining)
            inputs.append((os.path.basename((f.filename or "").replace("\\", "/")), path))
            remaining -= size
    except ValueError:
        for _, p in inputs:
            os.unlink(p)
        raise HTTPException(413, "Dosyalar çok büyük. ZIP'in tamamı yerine arayüzün otomatik ayıkladığı JSON'ları ya da yalnızca followers/following dosyalarını yükle.")
    job_id = import_jobs.create_job(session_id, MAX_UPLOAD_BYTES - remaining)
    import_jobs.start(session_id, job_id, inputs)
    return {"job_id": job_id}


@router.get("/import/jobs/{job_id}")
async def import_job_status(session_id: uuid.UUID, job_id: str, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    job = await asyncio.to_thread(import_jobs.get_job, job_id)
    if not job or job["session_id"] != str(session_id):
        raise HTTPException(404, "İş bulunamadı")
    job.pop("session_id")
    return job


@router.get("/import/active")
async def import_active(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Sayfa yenilense bile süren işi bulmak için."""
    await _get_session(session_id, db)
    return {"job_id": await asyncio.to_thread(import_jobs.active_job, session_id)}


@router.get("/data-status")
async def data_status(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Elimizdeki verinin özeti: kaç kayıt, hangi tarih aralığı, en son ne zaman güncellendi.
    Dosyadaki sayılar Instagram'daki sayılarla uyuşmuyorsa nedenini görmek için (ör. kısıtlı tarih aralığı)."""
    session = await _get_session(session_id, db)

    async def dim(flag, since):
        row = (await db.execute(
            select(func.count(), func.min(since), func.max(since), func.count(since))
            .where(Relationship.session_id == session_id, flag.is_(True))
        )).one()
        return {"count": row[0], "oldest": row[1].isoformat() if row[1] else None,
                "newest": row[2].isoformat() if row[2] else None, "dated": row[3]}

    followers = await dim(Relationship.they_follow, Relationship.they_follow_since)
    following = await dim(Relationship.we_follow, Relationship.we_follow_since)
    last_import = (await db.execute(
        select(func.max(ImportSnapshot.created_at)).where(ImportSnapshot.session_id == session_id))).scalar()
    last_scan = (await db.execute(
        select(func.max(func.coalesce(SyncJob.finished_at, SyncJob.started_at))).where(SyncJob.session_id == session_id, SyncJob.status == "completed")
    )).scalar()
    snapshots = (await db.execute(
        select(func.count()).select_from(ImportSnapshot).where(ImportSnapshot.session_id == session_id))).scalar()

    warnings: list[str] = []
    if followers["oldest"] and following["oldest"] and followers["count"] and following["count"]:
        gap_days = (datetime.fromisoformat(followers["oldest"]) - datetime.fromisoformat(following["oldest"])).days
        if gap_days > 365 * 2:
            warnings.append("followers_range_short")      # takipçi dosyası takip dosyasından yıllarca "daha genç"
    if session.source == "zip" and snapshots and not followers["count"]:
        warnings.append("no_followers")
    return {
        "source": session.source, "followers": followers, "following": following,
        "last_import_at": last_import.isoformat() if last_import else None,
        "last_scan_at": last_scan.isoformat() if last_scan else None,
        "imports": snapshots, "warnings": warnings,
    }


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
