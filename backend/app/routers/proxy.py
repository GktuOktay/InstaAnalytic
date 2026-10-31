from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/proxy", tags=["proxy"])

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.instagram.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

# Yalnızca bu alan adı sonekleri (tam eşleşme veya alt alan adı)
_ALLOWED_SUFFIXES = ("cdninstagram.com", "fbcdn.net")
_MAX_BYTES = 5 * 1024 * 1024


def is_allowed_image_url(url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    if u.scheme != "https" or not u.hostname or u.username or u.password or u.port not in (None, 443):
        return False
    host = u.hostname.lower().rstrip(".")
    return any(host == s or host.endswith("." + s) for s in _ALLOWED_SUFFIXES)


@router.get("/image")
async def proxy_image(url: str = Query(..., max_length=2048)):
    if not is_allowed_image_url(url):
        raise HTTPException(400, "İzin verilmeyen kaynak")

    try:
        # Yönlendirme takip edilmez: izinli host'tan başka yere (SSRF) gidilemesin
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            async with client.stream("GET", url, headers=_HEADERS) as r:
                if r.status_code != 200:
                    raise HTTPException(502, f"CDN {r.status_code}")
                content_type = r.headers.get("content-type", "")
                if not content_type.startswith("image/"):
                    raise HTTPException(502, "Görsel değil")
                body = bytearray()
                async for chunk in r.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > _MAX_BYTES:
                        raise HTTPException(502, "Görsel çok büyük")
        return Response(content=bytes(body), media_type=content_type,
                        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
    except httpx.TimeoutException:
        raise HTTPException(504, "CDN zaman aşımı")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, "CDN hatası")
