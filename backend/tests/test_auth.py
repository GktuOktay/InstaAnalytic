import pytest
from fastapi import HTTPException

from app.core.auth import require_api_token
from app.core.config import settings


@pytest.mark.asyncio
async def test_accepts_matching_token(monkeypatch):
    monkeypatch.setattr(settings, "api_token", "s3cret")
    assert await require_api_token("s3cret") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("given", ["", "wrong", "s3cre", "s3cret "])
async def test_rejects_wrong_token(monkeypatch, given):
    monkeypatch.setattr(settings, "api_token", "s3cret")
    with pytest.raises(HTTPException) as e:
        await require_api_token(given)
    assert e.value.status_code == 401


@pytest.mark.asyncio
async def test_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "api_token", "")
    with pytest.raises(HTTPException) as e:
        await require_api_token("")
    assert e.value.status_code == 503


@pytest.mark.asyncio
async def test_unauthenticated_upload_rejected_before_body_is_parsed(monkeypatch):
    """SPEC-003: kimliksiz multipart yükleme gövde ayrıştırılmadan 401 alır (diske akıtılmaz)."""
    import httpx
    from app.main import app
    from app.core.config import settings
    monkeypatch.setattr(settings, "api_token", "secret-token")
    parsed = []
    from starlette import formparsers
    orig = formparsers.MultiPartParser.parse
    async def spy(self):
        parsed.append(1)
        return await orig(self)
    monkeypatch.setattr(formparsers.MultiPartParser, "parse", spy)
    sid = "00000000-0000-0000-0000-000000000000"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(f"/api/sessions/{sid}/import/zip", files={"files": ("a.zip", b"x" * 1000)})
        assert r.status_code == 401 and r.json()["detail"] == "Geçersiz veya eksik API token"
        assert parsed == []
        ok = await c.get("/api/health")
        assert ok.status_code == 200
        pre = await c.options("/api/sessions", headers={"Origin": "http://localhost:3002", "Access-Control-Request-Method": "GET"})
        assert pre.status_code == 200
