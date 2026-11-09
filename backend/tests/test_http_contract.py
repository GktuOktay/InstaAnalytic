"""SPEC-002 PB-5: kimlik doğrulama, CORS ve ayrıştırma sırası (HTTP düzeyi karakterizasyon).

Bu testler bugünkü davranışı korur; PB-5 d bir güvenlik garantisi DEĞİLDİR (SPEC-002 §12, S-01):
token'sız istek gövdesi yetki denetiminden önce ayrıştırılır. Form-ayrıştırma sertleştirmesi işi
bu testi bilinçli olarak değiştirecektir. Veritabanı gerekmez (yetki bağımlılığı önce reddeder).
"""
import httpx
import pytest
import pytest_asyncio

from app.core.config import settings
from app.main import app

SID = "00000000-0000-4000-8000-000000000001"
GOOD = "contract-token"
# T-1'de eski sürümle (starlette 0.37.2) gözlenen durum kodları; bugünkü davranışı sabitler.
PREFLIGHT_OK_STATUS = 200
PREFLIGHT_EVIL_STATUS = 400
TOO_MANY_FILES_STATUS = 400
PATHS = [
    ("GET", "/api/sessions"),
    ("GET", f"/api/sessions/{SID}/actions/queue"),
    ("GET", "/api/bridge/hello"),
]


@pytest_asyncio.fixture
async def raw(monkeypatch):
    """Başlıksız (token'sız) istemci; DB geçersiz kılınmaz."""
    monkeypatch.setattr(settings, "api_token", GOOD)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.parametrize("method,path", PATHS)
async def test_pb5a_missing_and_wrong_token_get_401(raw, method, path):
    assert (await raw.request(method, path)).status_code == 401
    assert (await raw.request(method, path, headers={"X-API-Token": "wrong"})).status_code == 401


@pytest.mark.parametrize("method,path", PATHS)
async def test_pb5a_unconfigured_token_fails_closed_503(raw, monkeypatch, method, path):
    monkeypatch.setattr(settings, "api_token", "")
    assert (await raw.request(method, path)).status_code == 503
    assert (await raw.request(method, path, headers={"X-API-Token": ""})).status_code == 503


def _lower(h):
    return {k.lower(): v for k, v in h.items()}


async def test_pb5b_preflight_allowed_origin(raw):
    r = await raw.options("/api/sessions", headers={
        "Origin": "http://localhost:3002",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-api-token",
    })
    h = _lower(r.headers)
    assert r.status_code == PREFLIGHT_OK_STATUS
    assert h["access-control-allow-origin"].lower() == "http://localhost:3002"
    assert "x-api-token" in h["access-control-allow-headers"].lower()


async def test_pb5c_preflight_disallowed_origin(raw):
    r = await raw.options("/api/sessions", headers={
        "Origin": "http://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-api-token",
    })
    assert r.status_code == PREFLIGHT_EVIL_STATUS
    assert "access-control-allow-origin" not in _lower(r.headers)


def _many_files(n):
    return [("files", (f"f{i}.json", b"[]", "application/json")) for i in range(n)]


async def test_pb5d_parsing_happens_before_auth_today(raw):
    """Kayıt: token'sız, yabancı Origin'li 1001 parça -> ayrıştırıcı sınırı yetkiden önce çalışır."""
    url = f"/api/sessions/{SID}/import/zip"
    evil = {"Origin": "http://evil.example"}
    many = await raw.post(url, files=_many_files(1001), headers=evil)
    assert many.status_code == TOO_MANY_FILES_STATUS
    one = await raw.post(url, files=_many_files(1), headers=evil)
    assert one.status_code == 401
