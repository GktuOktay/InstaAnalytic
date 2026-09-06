"""
Plan B — Playwright tabanlı Instagram kazıyıcı.
Celery worker (sync) içinde çalışır; asyncio loop çakışmasını önlemek için
tüm Playwright işlemleri ayrı bir thread'de yürütülür.
"""

import json
import logging
import queue
import threading
import time
import random
from typing import Generator

logger = logging.getLogger(__name__)

_IG_API  = "https://www.instagram.com/api/v1"
_IG_HOME = "https://www.instagram.com"

_FETCH_JS = """
async (url) => {
    const r = await fetch(url, {
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
    });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch(e) { body = { _raw: text.slice(0, 200) }; }
    return { status: r.status, body: body };
}
"""

_POST_JS = """
async ([url, uid]) => {
    const csrf = document.cookie.split('; ')
        .find(c => c.startsWith('csrftoken='))?.split('=')[1] ?? '';
    const r = await fetch(url, {
        method: 'POST',
        headers: {
            'X-IG-App-ID': '936619743392459',
            'X-CSRFToken': csrf,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `user_id=${uid}`,
    });
    return r.status;
}
"""


def _run_in_thread(fn, *args, **kwargs):
    """fn'i ayrı bir thread'de çalıştır, sonucu döndür (Celery/asyncio uyumu)."""
    result_box = [None]
    exc_box    = [None]

    def target():
        try:
            result_box[0] = fn(*args, **kwargs)
        except Exception as e:
            exc_box[0] = e

    t = threading.Thread(target=target, daemon=True)
    t.start()
    t.join()
    if exc_box[0]:
        raise exc_box[0]
    return result_box[0]


def _make_ctx(cookies: dict):
    """Chromium context'i cookie'lerle hazırla (thread içinde çağrılmalı)."""
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    )
    ctx = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        locale="tr-TR",
        viewport={"width": 1280, "height": 800},
    )
    ctx.add_cookies([
        {
            "name": name,
            "value": str(value),
            "domain": ".instagram.com",
            "path": "/",
            "secure": True,
            "sameSite": "Lax",
        }
        for name, value in cookies.items()
    ])
    return pw, browser, ctx


# ── validate_session ──────────────────────────────────────────────────────────

def _validate_session_thread(cookies: dict) -> dict:
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        resp = page.evaluate(
            """async () => {
                const r = await fetch('https://www.instagram.com/api/v1/accounts/current_user/', {
                    headers: {'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest'},
                    credentials: 'include',
                });
                return { status: r.status, body: await r.json() };
            }"""
        )
        if resp["status"] != 200:
            raise ValueError(f"Session geçersiz (HTTP {resp['status']})")
        user = resp["body"].get("user", {})
        if not user:
            raise ValueError("Kullanıcı verisi boş")
        return user
    finally:
        page.close()
        browser.close()
        pw.stop()


def validate_session(cookies: dict) -> dict:
    return _run_in_thread(_validate_session_thread, cookies)


# ── get_followers ─────────────────────────────────────────────────────────────

def _fetch_paginated_thread(cookies: dict, endpoint_template: str, max_count: int, result_q: queue.Queue):
    """Sayfalı endpoint'i thread içinde çek, sonuçları queue'ya koy."""
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        max_id    = None
        collected = 0
        while True:
            url = endpoint_template
            if max_id:
                sep = "&" if "?" in url else "?"
                url += f"{sep}max_id={max_id}"

            resp = page.evaluate(_FETCH_JS, url)
            if resp["status"] != 200:
                logger.warning("Plan B paginate HTTP %s for %s", resp["status"], url)
                break

            body  = resp["body"]
            users = body.get("users", [])
            if not users:
                break

            result_q.put(users)
            collected += len(users)

            next_max = body.get("next_max_id")
            if not next_max or (max_count and collected >= max_count):
                break
            max_id = next_max
            time.sleep(random.uniform(1.5, 3.0))
    except Exception as e:
        result_q.put(e)
    finally:
        result_q.put(None)  # sentinel
        page.close()
        browser.close()
        pw.stop()


def _paginated_generator(cookies: dict, endpoint_template: str, max_count: int = 0) -> Generator[list[dict], None, None]:
    """Thread'de çalışan fetch'in sonuçlarını ana thread'e generator olarak akıt."""
    q: queue.Queue = queue.Queue(maxsize=4)
    t = threading.Thread(
        target=_fetch_paginated_thread,
        args=(cookies, endpoint_template, max_count, q),
        daemon=True,
    )
    t.start()
    while True:
        item = q.get()
        if item is None:           # sentinel — bitti
            break
        if isinstance(item, Exception):
            raise item
        yield item
    t.join()


def get_followers(cookies: dict, user_id: str, max_count: int = 0) -> Generator[list[dict], None, None]:
    url = f"{_IG_API}/friendships/{user_id}/followers/?count=50"
    return _paginated_generator(cookies, url, max_count)


def get_following(cookies: dict, user_id: str, max_count: int = 0) -> Generator[list[dict], None, None]:
    url = f"{_IG_API}/friendships/{user_id}/following/?count=50"
    return _paginated_generator(cookies, url, max_count)


# ── follow / unfollow ─────────────────────────────────────────────────────────

def _follow_action_thread(cookies: dict, target_user_id: int, action: str) -> bool:
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        url  = f"https://www.instagram.com/api/v1/friendships/{action}/{target_user_id}/"
        code = page.evaluate(_POST_JS, [url, target_user_id])
        return code == 200
    finally:
        page.close()
        browser.close()
        pw.stop()


def follow_user(cookies: dict, target_user_id: int) -> bool:
    return _run_in_thread(_follow_action_thread, cookies, target_user_id, "create")


def unfollow_user(cookies: dict, target_user_id: int) -> bool:
    return _run_in_thread(_follow_action_thread, cookies, target_user_id, "destroy")


def _remove_follower_thread(cookies: dict, target_user_id: int) -> bool:
    """Bizi takip eden birini takipçilerimizden çıkart."""
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        url = f"https://www.instagram.com/api/v1/friendships/remove_follower/{target_user_id}/"
        code = page.evaluate(_POST_JS, [url, target_user_id])
        return code == 200
    finally:
        page.close()
        browser.close()
        pw.stop()


def remove_follower(cookies: dict, target_user_id: int) -> bool:
    return _run_in_thread(_remove_follower_thread, cookies, target_user_id)


# ── get_posts ─────────────────────────────────────────────────────────────────

def _extract_items_from_body(body: dict) -> tuple[list[dict], int]:
    """GraphQL/API body'den (items, total_count) çıkar."""
    items: list[dict] = []
    total = 0

    # /api/v1/feed/user/ format
    items = body.get("items", [])
    if items:
        return items, total

    # graphql xdt format
    try:
        conn = (body.get("data", {})
                .get("xdt_api__v1__feed__user_timeline_graphql_connection", {}))
        edges = conn.get("edges", [])
        if edges:
            items = [e["node"] for e in edges if "node" in e]
            return items, total
    except Exception:
        pass

    # graphql legacy format
    try:
        media_node = (body.get("data", {})
                      .get("user", {})
                      .get("edge_owner_to_timeline_media", {}))
        total = media_node.get("count", 0)
        edges = media_node.get("edges", [])
        if edges:
            items = [e["node"] for e in edges if "node" in e]
            return items, total
    except Exception:
        pass

    return items, total


def _fetch_posts_thread(cookies: dict, user_id: str, username: str, max_count: int, result_q: queue.Queue):
    """
    Profil sayfasını aç, Instagram'ın GraphQL çağrılarını intercept et.
    Toplam gönderi sayısını profilden okuyup hepsi gelene kadar scroll yap.
    """
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    captured: list[dict] = []
    profile_total: list[int] = [0]  # mutable container for closure

    def on_response(resp):
        try:
            url = resp.url
            ct = resp.headers.get("content-type", "")
            if "instagram.com" not in url or "json" not in ct:
                return
            try:
                body = resp.json()
            except Exception:
                return
            items, total = _extract_items_from_body(body)
            if total and not profile_total[0]:
                profile_total[0] = total
                logger.info("get_posts profile total: %d", total)
            if items:
                captured.extend(items)
                result_q.put(items)
                logger.info("get_posts intercepted %d items (total so far: %d)", len(items), len(captured))
        except Exception as e:
            logger.debug("get_posts on_response error: %s", e)

    page.on("response", on_response)
    try:
        profile_url = f"https://www.instagram.com/{username}/"
        logger.info("get_posts navigating to profile: %s", profile_url)
        page.goto(profile_url, wait_until="domcontentloaded", timeout=45000)
        time.sleep(3)

        prev_count = 0
        stall_count = 0

        while True:
            # Hedef: profilden okunan total veya max_count
            target = max_count if max_count > 0 else (profile_total[0] or 9999)
            if len(captured) >= target:
                break

            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2.5)

            if len(captured) == prev_count:
                stall_count += 1
                if stall_count >= 5:
                    logger.info("get_posts: no new items after 5 scrolls, stopping")
                    break
            else:
                stall_count = 0
                prev_count = len(captured)
                logger.info("get_posts scroll: %d/%s items", len(captured), profile_total[0] or "?")

        logger.info("get_posts captured total %d items (profile says %d)", len(captured), profile_total[0])
    except Exception as e:
        result_q.put(e)
    finally:
        result_q.put(None)
        page.close()
        browser.close()
        pw.stop()


# ── get_post_likers / get_post_comments ───────────────────────────────────────

_CSRF_FETCH_JS = """
async ([url, csrftoken]) => {
    const r = await fetch(url, {
        headers: {
            'Accept': 'application/json, */*',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrftoken,
        },
        credentials: 'include',
    });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch(e) { body = { _raw: text.slice(0, 200) }; }
    return { status: r.status, body: body };
}
"""


def _fetch_likers_thread(cookies: dict, media_id: int, result_q: queue.Queue):
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        csrftoken = cookies.get("csrftoken", "")
        max_id = None
        while True:
            url = f"{_IG_API}/media/{media_id}/likers/"
            if max_id:
                url += f"?max_id={max_id}"
            resp = page.evaluate(_CSRF_FETCH_JS, [url, csrftoken])
            body = resp.get("body", {})
            status = resp["status"]
            if status != 200:
                logger.warning("get_post_likers HTTP %s body=%s", status, str(body)[:200])
                break
            if not isinstance(body, dict):
                break
            users = body.get("users", [])
            if users:
                result_q.put(users)
            next_max = body.get("next_max_id")
            if not next_max or not body.get("more_available"):
                break
            max_id = next_max
            time.sleep(random.uniform(1.0, 2.0))
    except Exception as e:
        result_q.put(e)
    finally:
        result_q.put(None)
        page.close(); browser.close(); pw.stop()


def get_post_likers(cookies: dict, media_id: int) -> Generator[list[dict], None, None]:
    q: queue.Queue = queue.Queue(maxsize=4)
    t = threading.Thread(target=_fetch_likers_thread, args=(cookies, media_id, q), daemon=True)
    t.start()
    while True:
        item = q.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        yield item
    t.join()


def _fetch_comments_thread(cookies: dict, media_id: int, result_q: queue.Queue):
    pw, browser, ctx = _make_ctx(cookies)
    page = ctx.new_page()
    try:
        page.goto(_IG_HOME, wait_until="domcontentloaded", timeout=20000)
        csrftoken = cookies.get("csrftoken", "")
        min_id = None
        while True:
            url = f"{_IG_API}/media/{media_id}/comments/?can_support_threading=true&permalink_enabled=false"
            if min_id:
                url += f"&min_id={min_id}"
            resp = page.evaluate(_CSRF_FETCH_JS, [url, csrftoken])
            if resp["status"] != 200:
                break
            body = resp.get("body", {})
            comments = body.get("comments", [])
            if not comments:
                break
            result_q.put(comments)
            if not body.get("has_more_comments"):
                break
            min_id = body.get("next_min_id")
            if not min_id:
                break
            time.sleep(random.uniform(1.0, 2.0))
    except Exception as e:
        result_q.put(e)
    finally:
        result_q.put(None)
        page.close(); browser.close(); pw.stop()


def get_post_comments(cookies: dict, media_id: int) -> Generator[list[dict], None, None]:
    q: queue.Queue = queue.Queue(maxsize=4)
    t = threading.Thread(target=_fetch_comments_thread, args=(cookies, media_id, q), daemon=True)
    t.start()
    while True:
        item = q.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        yield item
    t.join()


def get_posts(cookies: dict, user_id: str, username: str = "", max_count: int = 0) -> Generator[list[dict], None, None]:
    """Kullanıcının gönderilerini profil sayfası interception ile döndür."""
    q: queue.Queue = queue.Queue(maxsize=10)
    t = threading.Thread(
        target=_fetch_posts_thread,
        args=(cookies, user_id, username, max_count, q),
        daemon=True,
    )
    t.start()
    while True:
        item = q.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        yield item
    t.join()
