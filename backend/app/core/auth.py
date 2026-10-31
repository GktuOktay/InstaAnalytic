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
