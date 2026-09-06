import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/proxy", tags=["proxy"])

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.instagram.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

_ALLOWED_HOSTS = {"instagram.fsaw", "cdninstagram.com", "fbcdn.net", "scontent"}


@router.get("/image")
async def proxy_image(url: str = Query(...)):
    # Sadece Instagram CDN URL'lerine izin ver
    if not any(h in url for h in _ALLOWED_HOSTS):
        raise HTTPException(400, "İzin verilmeyen kaynak")

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(url, headers=_HEADERS)
            if r.status_code != 200:
                raise HTTPException(502, f"CDN {r.status_code}")
            content_type = r.headers.get("content-type", "image/jpeg")
            return Response(content=r.content, media_type=content_type)
    except httpx.TimeoutException:
        raise HTTPException(504, "CDN zaman aşımı")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, str(e))
