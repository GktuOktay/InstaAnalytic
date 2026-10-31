import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.security import encrypt, decrypt
from app.db.base import get_db
from app.models.session import Session
from app.models.ig_user import IgUser
from app.schemas.session import (
    SessionCreate, SessionResponse, SessionVerifyResponse,
    SessionPreviewRequest, SessionPreviewResponse,
    BrowserListResponse, BrowserScanRequest, BrowserScanResponse, BrowserCandidate,
    BrowserConfirmRequest, ZipOnlyCreate, ActionsToggle,
)
from app.services import instagram

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _agent_headers() -> dict:
    """Host agent isteklerine secret token ekle."""
    h = {"Content-Type": "application/json"}
    if settings.host_agent_secret:
        h["X-Agent-Secret"] = settings.host_agent_secret
    return h


# ── Yardımcı ─────────────────────────────────────────────────────────────────

async def _upsert_ig_user(db: AsyncSession, ig_user_id: int, username: str, user: dict) -> IgUser:
    ig_user = await db.get(IgUser, ig_user_id)
    if not ig_user:
        ig_user = IgUser(
            id=ig_user_id,
            username=username,
            full_name=user.get("full_name"),
            profile_pic_url=user.get("profile_pic_url"),
            is_private=bool(user.get("is_private", False)),
            is_verified=bool(user.get("is_verified", False)),
            follower_count=user.get("follower_count"),
            following_count=user.get("following_count"),
            post_count=user.get("media_count"),
        )
        db.add(ig_user)
    return ig_user


async def _create_and_save_session(
    db: AsyncSession,
    ig_username: str,
    session_id_cookie: str,
    extra_cookies: dict | None,
    user: dict,
) -> Session:
    """Session kaydeder. Zaten varsa günceller."""
    ig_user_id = int(user.get("pk", 0))
    if not ig_user_id:
        raise HTTPException(422, "Kullanıcı ID alınamadı")

    resolved_username = ig_username or str(user.get("username", "")) or f"user_{ig_user_id}"

    # Duplicate kontrolü (username veya user_id bazlı)
    existing = await db.execute(
        select(Session).where(
            (Session.ig_username == resolved_username) |
            (Session.ig_user_id == ig_user_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"'{resolved_username}' zaten kayıtlı")

    await _upsert_ig_user(db, ig_user_id, resolved_username, user)

    all_cookies: dict[str, Any] = {"sessionid": session_id_cookie}
    if extra_cookies:
        all_cookies.update(extra_cookies)

    session = Session(
        ig_user_id=ig_user_id,
        ig_username=resolved_username,
        session_data=encrypt(json.dumps({"cookies": all_cookies})),
        last_verified_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


# ── Endpoint'ler ──────────────────────────────────────────────────────────────

@router.post("/preview", response_model=SessionPreviewResponse)
async def preview_session(body: SessionPreviewRequest):
    """sessionid cookie'den kullanıcı bilgisini çek, kayıt etme."""
    try:
        user = instagram._web_account_info(body.session_id_cookie, body.extra_cookies)
    except Exception as e:
        raise HTTPException(422, f"Session geçersiz: {e}")
    return SessionPreviewResponse(
        ig_username=str(user.get("username", "")),
        ig_user_id=int(user.get("pk", 0)),
        full_name=user.get("full_name"),
    )


@router.get("/host-agent-status")
async def host_agent_status():
    """Host agent'ın çalışıp çalışmadığını kontrol et."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{settings.host_agent_url}/health")
            if r.status_code == 200:
                data = r.json()
                return {"connected": True, "platform": data.get("platform", "unknown")}
    except Exception:
        pass
    return {"connected": False, "platform": None}


_CAND_TTL = 300  # sn — onaylanmayan adaylar 5 dakikada silinir


def _redis():
    import redis.asyncio as aioredis
    return aioredis.from_url(settings.redis_url)


async def _require_agent_v2() -> None:
    """Eski host agent tüm tarayıcıları sormadan tarar; güncel olmayanı kullanma."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.host_agent_url}/health")
            ver = r.json().get("api_version", 1) if r.status_code == 200 else 0
    except Exception:
        raise HTTPException(503, "Host agent çalışmıyor. Başlatmak için: bash start.sh")
    if ver < 2:
        raise HTTPException(409, "Host agent eski sürüm. Güvenlik için güncelleyin: bash start.sh")


async def _agent_get(path: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.host_agent_url}{path}", headers=_agent_headers())
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Host agent çalışmıyor. Başlatmak için: bash start.sh")
    except Exception:
        raise HTTPException(502, "Host agent yanıt vermedi")


@router.get("/browsers", response_model=BrowserListResponse)
async def list_browsers():
    """Desteklenen tarayıcılar. Cookie OKUNMAZ; yalnızca adlar döner."""
    await _require_agent_v2()
    return BrowserListResponse(browsers=(await _agent_get("/browsers")).get("browsers", []))


@router.post("/scan-browser", response_model=BrowserScanResponse)
async def scan_browser(body: BrowserScanRequest, db: AsyncSession = Depends(get_db)):
    """
    Yalnızca kullanıcının seçtiği tarayıcılarda oturum ara. HİÇBİR ŞEY KAYDEDİLMEZ:
    bulunan hesaplar kısa süreli (5 dk) şifreli aday olarak tutulur, kullanıcı /confirm ile seçer.
    """
    if not body.browsers:
        raise HTTPException(422, "En az bir tarayıcı seçin")
    await _require_agent_v2()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.host_agent_url}/scan", headers=_agent_headers(), json={"browsers": body.browsers}
            )
            if resp.status_code == 400:
                raise HTTPException(422, "Geçersiz tarayıcı seçimi")
            resp.raise_for_status()
            data = resp.json()
    except HTTPException:
        raise
    except httpx.ConnectError:
        raise HTTPException(503, "Host agent çalışmıyor. Başlatmak için: bash start.sh")
    except Exception:
        raise HTTPException(502, "Tarama başarısız oldu")

    existing = {s.ig_user_id for s in (await db.execute(select(Session))).scalars().all()}
    candidates: list[BrowserCandidate] = []
    errors: list[str] = list(data.get("errors", []))
    r = _redis()
    try:
        for raw in data.get("sessions", []):
            sid, extra = raw["session_id_cookie"], raw.get("extra_cookies", {})
            try:
                user = instagram._web_account_info(sid, extra)
            except Exception:
                errors.append(f"{raw.get('browser', '?')}: oturum doğrulanamadı (süresi dolmuş olabilir)")
                continue
            uname = user.get("username") or raw.get("username") or f"user_{user.get('pk', '')}"
            cid = uuid.uuid4().hex
            payload = {"sid": sid, "extra": extra, "user": user, "username": uname}
            await r.set(f"cand:{cid}", encrypt(json.dumps(payload)), ex=_CAND_TTL)
            candidates.append(BrowserCandidate(
                candidate_id=cid, browser=raw.get("browser", "?"), ig_username=uname,
                full_name=user.get("full_name"), already_saved=int(user.get("pk", 0)) in existing,
            ))
    finally:
        await r.aclose()
    return BrowserScanResponse(candidates=candidates, errors=errors)


@router.post("/scan-browser/confirm", response_model=list[SessionResponse], status_code=201)
async def confirm_browser_sessions(body: BrowserConfirmRequest, db: AsyncSession = Depends(get_db)):
    """Kullanıcının seçtiği adayları kaydet. Seçilmeyenler hiç saklanmaz."""
    saved: list[Session] = []
    r = _redis()
    try:
        for cid in body.candidate_ids:
            raw = await r.getdel(f"cand:{cid}")
            if not raw:
                continue
            p = json.loads(decrypt(raw.decode() if isinstance(raw, bytes) else raw))
            try:
                saved.append(await _create_and_save_session(db, p["username"], p["sid"], p["extra"], p["user"]))
            except HTTPException as e:
                if e.status_code != 400:  # 400 = zaten kayıtlı, sessizce atla
                    raise
    finally:
        await r.aclose()
    if not saved:
        raise HTTPException(404, "Seçilen aday bulunamadı veya süresi doldu. Taramayı tekrar çalıştırın.")
    return saved


@router.post("/zip-only", response_model=SessionResponse, status_code=201)
async def create_zip_only_session(body: ZipOnlyCreate, db: AsyncSession = Depends(get_db)):
    """
    Cookie'siz, yalnızca ZIP verisiyle çalışan profil. Instagram'a HİÇ istek atılmaz: en güvenli mod.
    """
    import hashlib
    username = body.ig_username.strip().lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9._]{1,30}", username):
        raise HTTPException(422, "Geçerli bir Instagram kullanıcı adı girin")
    fake_id = -int(hashlib.sha256(username.encode()).hexdigest()[:12], 16)  # negatif = geçici kimlik
    dup = await db.execute(select(Session).where((Session.ig_username == username) | (Session.ig_user_id == fake_id)))
    if dup.scalar_one_or_none():
        raise HTTPException(400, f"'{username}' zaten kayıtlı")
    await _upsert_ig_user(db, fake_id, username, {})
    session = Session(
        ig_user_id=fake_id, ig_username=username, source="zip",
        session_data=encrypt(json.dumps({"cookies": {}})),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/{session_id}/allow-actions", response_model=SessionResponse)
async def set_allow_actions(session_id: uuid.UUID, body: ActionsToggle, db: AsyncSession = Depends(get_db)):
    """Takip / takipten çıkma gibi yazma işlemlerini aç/kapat (varsayılan kapalı)."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    if body.allow_actions and session.source == "zip":
        raise HTTPException(400, "ZIP profili Instagram'a bağlı değil; işlem yapılamaz. Önce tarayıcıdan hesap bağlayın.")
    session.allow_actions = body.allow_actions
    if body.allow_actions and not session.actions_enabled_at:
        session.actions_enabled_at = datetime.now(timezone.utc)   # ısınma süresi buradan başlar
    if not body.allow_actions:
        session.actions_enabled_at = None
        session.paused_until, session.paused_reason = None, None
    await db.commit()
    await db.refresh(session)
    return session


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    try:
        user = instagram._web_account_info(body.session_id_cookie, body.extra_cookies)
    except Exception as e:
        raise HTTPException(422, f"Instagram session geçersiz: {e}")
    return await _create_and_save_session(db, body.ig_username, body.session_id_cookie, body.extra_cookies, user)


@router.get("", response_model=list[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).order_by(Session.created_at.desc()))
    return result.scalars().all()


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


@router.patch("/{session_id}/username", response_model=SessionResponse)
async def update_username(session_id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    """Session ve ilgili IgUser'ın kullanıcı adını güncelle."""
    new_username = (body.get("ig_username") or "").strip()
    if not new_username:
        raise HTTPException(400, "Kullanıcı adı boş olamaz")

    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")

    # Duplicate kontrolü (kendisi hariç)
    dup = await db.execute(
        select(Session).where(Session.ig_username == new_username, Session.id != session_id)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(400, f"'{new_username}' başka bir session'da kullanılıyor")

    ig_user = await db.get(IgUser, session.ig_user_id)
    if ig_user:
        ig_user.username = new_username

    session.ig_username = new_username
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    await db.delete(session)
    await db.commit()


@router.post("/{session_id}/verify", response_model=SessionVerifyResponse)
async def verify_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")

    session_json = decrypt(session.session_data)
    valid, error = instagram.verify_client(session_json)

    session.last_verified_at = datetime.now(timezone.utc)
    if valid:
        session.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return SessionVerifyResponse(valid=valid, ig_username=session.ig_username, error=error)


@router.post("/{session_id}/toggle-plan-b", response_model=SessionResponse)
async def toggle_plan_b(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Plan B (Playwright) modunu aç/kapat."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    session.plan_b_active = not session.plan_b_active
    await db.commit()
    await db.refresh(session)
    return session
