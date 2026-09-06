import json
import logging
import urllib.parse
import httpx
from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    PleaseWaitFewMinutes,
    RateLimitError,
)

logger = logging.getLogger(__name__)

PLAN_B_EXCEPTIONS = (ChallengeRequired, PleaseWaitFewMinutes, RateLimitError)

_WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-IG-App-ID": "936619743392459",
    "X-IG-WWW-Claim": "0",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
}

_MOBILE_HEADERS = {
    "User-Agent": "Instagram 269.0.0.18.75 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; 6T Dev; devitron; qcom; en_US; 314665256)",
    "Accept": "*/*",
    "Accept-Language": "en-US",
    "X-IG-App-ID": "567067343352427",
    "X-IG-Capabilities": "3brTvw==",
    "X-IG-Connection-Type": "WIFI",
}


def _parse_user_id_from_sessionid(sessionid: str) -> int | None:
    """sessionid = '{user_id}%3A{token}%3A{hash}' ya da '{user_id}:{token}:{hash}'"""
    try:
        decoded = urllib.parse.unquote(sessionid)
        parts = decoded.split(":")
        if parts and parts[0].isdigit():
            return int(parts[0])
    except Exception:
        pass
    return None


def _fetch_user_info_by_id(user_id: int, cookies: dict) -> dict | None:
    """user_id'den username çek — birden fazla endpoint dene."""
    endpoints = [
        f"https://i.instagram.com/api/v1/users/{user_id}/info/",
        f"https://www.instagram.com/api/v1/users/{user_id}/info/",
    ]
    for url in endpoints:
        try:
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                resp = client.get(
                    url,
                    headers={
                        **_MOBILE_HEADERS,
                        "Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items()),
                    },
                    cookies=cookies,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    user = data.get("user", {})
                    if user and user.get("username"):
                        return user
        except Exception as e:
            logger.debug("user info by id failed (%s): %s", url, e)
    return None


def _fetch_current_user(cookies: dict) -> dict | None:
    """Mevcut kullanıcıyı web API ile çek — birden fazla endpoint dene."""
    csrf = cookies.get("csrftoken", "")
    referer = "https://www.instagram.com/"
    endpoints = [
        "https://www.instagram.com/api/v1/accounts/current_user/",
        "https://www.instagram.com/api/v1/accounts/current_user/?edit=true",
        "https://i.instagram.com/api/v1/accounts/current_user/",
    ]
    for url in endpoints:
        try:
            headers = {
                **_WEB_HEADERS,
                "X-CSRFToken": csrf,
                "Referer": referer,
            }
            if "i.instagram.com" in url:
                headers = {**_MOBILE_HEADERS, "X-CSRFToken": csrf}
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                resp = client.get(url, headers=headers, cookies=cookies)
                if resp.status_code in (301, 302, 303, 400, 401, 403):
                    logger.debug("current_user %s → %d", url, resp.status_code)
                    continue
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        user = data.get("user", {})
                        if user and user.get("username"):
                            return user
                    except Exception:
                        continue
        except Exception as e:
            logger.debug("current_user failed (%s): %s", url, e)
    return None


def _web_account_info(sessionid: str, extra_cookies: dict | None = None) -> dict:
    """
    Tüm yollarla Instagram kullanıcı bilgisini çek.
    Hiçbir yol çalışmazsa en azından pk döndür — username asla boş kalmaz:
    fallback olarak 'user_{pk}' kullanılır.
    """
    cookies: dict[str, str] = {"sessionid": sessionid}
    if extra_cookies:
        cookies.update({k: str(v) for k, v in extra_cookies.items()})

    # 1. Mevcut kullanıcı endpoint'leri
    user = _fetch_current_user(cookies)
    if user:
        return user

    # 2. ds_user_id veya sessionid'den user_id al, sonra user/info endpoint'i dene
    user_id = None
    if cookies.get("ds_user_id", "").isdigit():
        user_id = int(cookies["ds_user_id"])
    else:
        user_id = _parse_user_id_from_sessionid(sessionid)

    if user_id:
        user = _fetch_user_info_by_id(user_id, cookies)
        if user:
            return user
        # user_id var ama username alınamadı → placeholder
        return {
            "pk": user_id,
            "username": f"user_{user_id}",
            "full_name": None,
            "_username_is_placeholder": True,
        }

    raise ValueError(
        "Instagram session geçersiz veya süresi dolmuş. "
        "Tarayıcıda instagram.com'a giriş yap ve tekrar dene."
    )


def login_by_sessionid(sessionid: str):
    user = _web_account_info(sessionid)
    cl = Client()
    cl.set_settings({"cookies": {"sessionid": sessionid}})
    cl.user_id = str(user["pk"])
    raw = cl.get_settings()
    session_data = raw if isinstance(raw, dict) else json.loads(raw)
    return cl, session_data, user


def build_client(session_json: str) -> Client:
    cl = Client()
    cl.load_settings(json.loads(session_json))
    return cl


def verify_client(session_json: str) -> tuple[bool, str | None]:
    """Returns (is_valid, error_message)."""
    try:
        settings = json.loads(session_json)
        sessionid = settings.get("cookies", {}).get("sessionid", "")
        if not sessionid:
            return False, "Session cookie bulunamadı"
        extra = {k: v for k, v in settings.get("cookies", {}).items() if k != "sessionid"}
        info = _web_account_info(sessionid, extra or None)
        # Placeholder username = session ID çalışıyor ama username doğrulanamadı
        if info.get("_username_is_placeholder"):
            return True, None
        return True, None
    except Exception as e:
        logger.warning("Session verify failed: %s", e)
        return False, str(e)
