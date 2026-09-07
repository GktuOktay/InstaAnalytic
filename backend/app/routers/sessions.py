import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
)
from app.services import instagram

router = APIRouter(prefix="/sessions", tags=["sessions"])


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
                return {"connected": True}
    except Exception:
        pass
    return {"connected": False}


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _do_scan_stream(db: AsyncSession) -> AsyncGenerator[str, None]:
    """SSE generator — her adımı canlı olarak akıt."""
    yield _sse("log", {"msg": "Host agent bağlantısı kontrol ediliyor…"})
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            h = await client.get(f"{settings.host_agent_url}/health")
            if h.status_code != 200:
                yield _sse("error", {"msg": "Host agent yanıt vermiyor."})
                return
    except httpx.ConnectError:
        yield _sse("error", {
            "msg": "Host agent çalışmıyor. Başlatmak için: bash start.sh"
        })
        return

    yield _sse("log", {"msg": "✓ Host agent bağlı."})
    yield _sse("log", {"msg": "Tarayıcı cookie'leri taranıyor…"})

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{settings.host_agent_url}/scan")
            resp.raise_for_status()
            raw_sessions: list[dict] = resp.json().get("sessions", [])
    except Exception as e:
        yield _sse("error", {"msg": f"Tarama hatası: {e}"})
        return

    scan_errors: list = resp.json().get("errors", [])
    if scan_errors:
        for err in scan_errors:
            yield _sse("log", {"msg": f"  ⚠ {err}"})

    if not raw_sessions:
        if scan_errors:
            yield _sse("error", {"msg": "Tarayıcı cookie'leri okunamadı. Yukarıdaki uyarıya bakın."})
        else:
            yield _sse("error", {"msg": "Tarayıcılarda Instagram session bulunamadı. instagram.com'da oturum aç ve tekrar dene."})
        return

    yield _sse("log", {"msg": f"✓ {len(raw_sessions)} tarayıcı session'ı bulundu."})

    saved_sessions = []
    for i, raw in enumerate(raw_sessions, 1):
        sid = raw["session_id_cookie"]
        extra = raw.get("extra_cookies", {})
        browser = raw.get("browser", "?")
        uid = extra.get("ds_user_id", "?")
        yield _sse("log", {"msg": f"[{i}/{len(raw_sessions)}] {browser} — uid={uid} doğrulanıyor…"})

        try:
            user = instagram._web_account_info(sid, extra)
            uname = user.get("username") or f"user_{user.get('pk', uid)}"
            yield _sse("log", {"msg": f"  ✓ Kullanıcı: @{uname}"})
            session = await _create_and_save_session(db, uname, sid, extra, user)
            saved_sessions.append(session)
            yield _sse("log", {"msg": f"  ✓ Session kaydedildi."})
        except HTTPException as e:
            if e.status_code == 400:
                yield _sse("log", {"msg": f"  → Zaten kayıtlı, atlandı."})
            else:
                yield _sse("log", {"msg": f"  ✗ Hata: {e.detail}"})
        except Exception as e:
            yield _sse("log", {"msg": f"  ✗ Hata: {e}"})

    total = len(saved_sessions)
    if total:
        yield _sse("log", {"msg": f"✓ {total} session başarıyla kaydedildi."})
    else:
        yield _sse("log", {"msg": "Tüm session'lar zaten kayıtlı."})

    # Kaydedilen session listesini döndür
    result = await db.execute(select(Session).order_by(Session.created_at.desc()))
    all_sessions = result.scalars().all()
    yield _sse("done", {
        "sessions": [
            {
                "id": str(s.id),
                "ig_username": s.ig_username,
                "ig_user_id": s.ig_user_id,
                "plan_b_active": s.plan_b_active,
                "created_at": s.created_at.isoformat(),
                "last_used_at": s.last_used_at.isoformat() if s.last_used_at else None,
                "last_verified_at": s.last_verified_at.isoformat() if s.last_verified_at else None,
            }
            for s in all_sessions
        ]
    })


@router.get("/scan-browser/stream")
async def scan_browser_stream(db: AsyncSession = Depends(get_db)):
    """SSE akışı — tarama adımlarını canlı gönderir."""
    return StreamingResponse(
        _do_scan_stream(db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/scan-browser", response_model=list[SessionResponse], status_code=207)
async def scan_browser_sessions(db: AsyncSession = Depends(get_db)):
    """
    Host agent'ı çağırarak tarayıcı cookie'lerini tara,
    bulunan session'ları otomatik kaydet.
    """
    # 1. Host agent erişim kontrolü
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            health = await client.get(f"{settings.host_agent_url}/health")
            if health.status_code != 200:
                raise HTTPException(503, "Host agent çalışmıyor")
    except httpx.ConnectError:
        raise HTTPException(503, "Host agent çalışmıyor. Başlatmak için: python3 scripts/host_agent.py &")

    # 2. Cookie'leri tara
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{settings.host_agent_url}/scan")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(502, f"Tarama hatası: {e}")

    raw_sessions: list[dict] = data.get("sessions", [])
    if not raw_sessions:
        raise HTTPException(404, "Tarayıcılarda aktif Instagram session bulunamadı. instagram.com'da oturum aç.")

    # 3. Her session'ı validate + kaydet
    saved: list[Session] = []
    errors: list[str] = []

    for raw in raw_sessions:
        sid = raw["session_id_cookie"]
        extra = raw.get("extra_cookies", {})
        user_info: dict = {}
        try:
            # Host agent zaten username'i çözmüş olabilir
            host_username = raw.get("username") or ""
            user_info = instagram._web_account_info(sid, extra)
            uname = user_info.get("username") or host_username or ""
            session = await _create_and_save_session(db, uname, sid, extra, user_info)
            saved.append(session)
        except HTTPException as e:
            if e.status_code == 400:  # zaten kayıtlı — mevcut session'ı döndür ve username güncelle
                uid = user_info.get("pk") or user_info.get("id") or instagram._parse_user_id_from_sessionid(sid)
                if uid:
                    res = await db.execute(select(Session).where(Session.ig_user_id == int(uid)))
                    existing = res.scalar_one_or_none()
                    if existing:
                        # Host agent'tan gelen gerçek username varsa güncelle
                        real_uname = host_username or user_info.get("username", "")
                        if real_uname and not real_uname.startswith("user_"):
                            existing.ig_username = real_uname
                            ig_user = await db.get(IgUser, int(uid))
                            if ig_user:
                                ig_user.username = real_uname
                            await db.commit()
                            await db.refresh(existing)
                        saved.append(existing)
            else:
                errors.append(str(e.detail))
        except Exception as e:
            errors.append(str(e))

    if not saved and errors:
        raise HTTPException(422, "; ".join(errors))

    return saved


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
