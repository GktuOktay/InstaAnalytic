import logging
import secrets

from fastapi import Header, HTTPException

from app.core.config import settings

log = logging.getLogger(__name__)


async def require_api_token(x_api_token: str = Header(default="")) -> None:
    """Tüm /api uçlarını korur. Token yapılandırılmamışsa istekleri reddeder (fail-closed)."""
    expected = settings.api_token
    if not expected:
        log.error("API_TOKEN tanımlı değil — `python3 scripts/init_env.py` çalıştırın.")
        raise HTTPException(503, "API_TOKEN yapılandırılmamış")
    if not secrets.compare_digest(x_api_token.encode(), expected.encode()):
        raise HTTPException(401, "Geçersiz veya eksik API token")


_PUBLIC = {"/api/health"}


class EarlyTokenGate:
    """SPEC-003: token'ı gövde okunmadan ÖNCE denetler. FastAPI multipart/form gövdesini bağımlılıklardan
    (require_api_token) önce ayrıştırır; kimliksiz istemci bu yüzden diske dosya akıtabilirdi.
    Yanıt gövdesi `require_api_token` ile aynıdır; o bağımlılık savunma derinliği olarak kalır."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] == "OPTIONS" or not scope["path"].startswith("/api/") \
                or scope["path"] in _PUBLIC:
            return await self.app(scope, receive, send)
        expected = settings.api_token
        given = next((v for k, v in scope["headers"] if k == b"x-api-token"), b"")
        if not expected:
            status, detail = 503, "API_TOKEN yapılandırılmamış"
        elif not secrets.compare_digest(given, expected.encode()):
            status, detail = 401, "Geçersiz veya eksik API token"
        else:
            return await self.app(scope, receive, send)
        from fastapi.responses import JSONResponse
        await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
