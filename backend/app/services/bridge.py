"""
Tarayıcı köprüsü (dinleyici): beğenen ve yorum listeleri, kullanıcı Instagram'da gezerken sayfanın zaten
indirdiği yanıtlardan okunur.

Ne sunucu ne eklenti Instagram'a kendi isteğini gönderir. Kullanıcı kendi gönderisini açıp "beğenenler"
listesine baktığında Instagram'ın web uygulaması o listeyi indirir; eklenti bu yanıtın bir kopyasını
buraya iletir. Instagram'ın gördüğü her istek kullanıcının kendi tıklamasıdır.

Instagram web uç noktalarını ve GraphQL sorgu adlarını haber vermeden değiştirir. Bu yüzden ayrıştırıcı
belirli bir adrese bağlı değildir: yanıtın içinde gönderi, beğenen ve yorum şekline uyan yapıları arar.
Tanınmayan ama ilgili görünen yanıtların yalnızca anahtar yapısı (değerler olmadan) teşhis için saklanır.

Yalnızca bu profilin kendi gönderilerine ait veri kaydedilir; gezinirken gelen diğer her şey atılır.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Protocol
from urllib.parse import parse_qs, urlparse

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.session import Session

MAX_BODY_CHARS = 8 * 1024 * 1024
MAX_REQ_CHARS = 64 * 1024
RISK_PAUSE = timedelta(hours=24)
RISK_PAUSE_REPEAT = timedelta(hours=72)
RISK_MEMORY_S = 7 * 24 * 3600
STATE_TTL_S = 30 * 24 * 3600
DIAG_KEEP = 30
PAUSE_PREFIX = "Köprü:"

_RISK_STATUSES = (429,)
_RISK_MESSAGES = ("login_required", "checkpoint_required", "challenge_required", "feedback_required")
_MEDIA_TYPES = {1: "PHOTO", 2: "VIDEO", 8: "ALBUM"}
_POST_PATH = re.compile(r"/(?:[\w.]+/)?(?:p|reel|tv)/([\w-]+)")
_REST_MEDIA = re.compile(r"/api/v1/media/(\d+)(?:_\d+)?/(likers|comments)/")
_INTERESTING = re.compile(r"liker|comment", re.I)
# Uyarı yalnızca bizim okuduğumuz türden bir yanıtta sayılır; Instagram'ın arka plandaki önemsiz
# isteklerinde (kayıt, reklam) ara sıra görülen 429'lar kullanıcıyı boşuna bekletmesin.
_RELEVANT_FRIENDLY = re.compile(r"liker|likes|comment|post|media|timeline|profile|feed", re.I)
_RELEVANT_REST = re.compile(r"/api/v1/(media/\d+(_\d+)?/(likers|comments)/|feed/user/)")

# Kullanıcıya gösterilecek metin (eklenti bunu olduğu gibi gösterir)
WARNING_MESSAGES = {
    "rate_limit": "Instagram çok sık işlem yapıldığını düşündü. Beğenen listelerini açmayı bırakın.",
    "action_blocked": "Instagram bazı işlemleri geçici olarak kısıtladı. Bir gün toplu işlem yapmayın.",
    "verify": "Instagram hesabınız için doğrulama istiyor. Telefondan kendiniz tamamlayın.",
    "logged_out": "Instagram oturumu kapanmış görünüyor. instagram.com'a yeniden giriş yapın.",
}


class KV(Protocol):
    async def get(self, key: str): ...
    async def set(self, key: str, value, ex: int | None = None): ...
    async def delete(self, *keys: str): ...
    async def lpush(self, key: str, *values): ...
    async def ltrim(self, key: str, start: int, end: int): ...
    async def lrange(self, key: str, start: int, end: int): ...
    async def expire(self, key: str, seconds: int): ...


def _k(session_id, name: str) -> str:
    return f"bridge:{session_id}:{name}"


def _dec(v):
    return v.decode() if isinstance(v, bytes) else v


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Ayrıştırma (saf fonksiyonlar) ───────────────────────────────────────────────

def parse_body(text: str) -> Any:
    """JSON değilse None. Instagram bazen birden çok JSON'u satır satır yollar: ilk geçerli olan alınır."""
    text = (text or "").lstrip()
    if text.startswith("for (;;);"):
        text = text[len("for (;;);"):]
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        for line in text.splitlines():
            try:
                return json.loads(line)
            except (ValueError, TypeError):
                continue
    return None


def is_risk(status: int, body: Any, text: str = "") -> bool:
    if status in _RISK_STATUSES:
        return True
    if isinstance(body, dict):
        if body.get("message") in _RISK_MESSAGES or body.get("require_login") or body.get("spam"):
            return True
        for err in body.get("errors") or []:
            if isinstance(err, dict) and ("rate" in str(err.get("message", "")).lower()
                                          or err.get("code") in (1675004, 1357005)):
                return True
    return False


def warning_kind(status: int, body: Any) -> str:
    """Uyarının türü; arayüz ve eklenti bunu son kullanıcı diline çevirir."""
    msg = str(body.get("message", "")) if isinstance(body, dict) else ""
    if "challenge" in msg or "checkpoint" in msg:
        return "verify"
    if "login_required" in msg or (isinstance(body, dict) and body.get("require_login")):
        return "logged_out"
    if "feedback_required" in msg or (isinstance(body, dict) and body.get("spam")):
        return "action_blocked"
    return "rate_limit"


def relevant(url: str, friendly: str | None) -> bool:
    """Yanıt, köprünün okuduğu türden mi (gönderi / beğenen / yorum / profil ızgarası)?"""
    if _RELEVANT_REST.search(urlparse(url or "").path):
        return True
    if friendly:
        return bool(_RELEVANT_FRIENDLY.search(friendly))
    # Sorgu adı yoksa: sayfaya gömülü veri ya da eski biçim; risk sinyali olarak sayılmaz
    return False


def warning_message(kind: str) -> str:
    return WARNING_MESSAGES.get(kind, WARNING_MESSAGES["rate_limit"])


def parse_request(req_body: str, url: str) -> tuple[str | None, dict]:
    """GraphQL isteğinden (form gövdesi) sorgu adı ve değişkenler."""
    friendly, variables = None, {}
    if req_body:
        q = parse_qs(req_body[:MAX_REQ_CHARS], keep_blank_values=True)
        friendly = (q.get("fb_api_req_friendly_name") or [None])[0]
        raw = (q.get("variables") or [None])[0]
        if raw is None and req_body.lstrip().startswith("{"):
            raw = req_body
        if raw:
            try:
                v = json.loads(raw)
                variables = v.get("variables", v) if isinstance(v, dict) else {}
            except ValueError:
                pass
    if not friendly:
        friendly = (parse_qs(urlparse(url).query).get("fb_api_req_friendly_name") or [None])[0]
    return friendly, variables if isinstance(variables, dict) else {}


def _walk(obj: Any, key: str = "", depth: int = 0) -> Iterator[tuple[str, Any]]:
    if depth > 14:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, v
            yield from _walk(v, k, depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            yield key, v
            yield from _walk(v, key, depth + 1)


def _int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _user(u: Any) -> dict | None:
    if not isinstance(u, dict):
        return None
    if isinstance(u.get("node"), dict):
        u = u["node"]
    if isinstance(u.get("user"), dict) and "username" not in u:
        u = u["user"]
    pk = _int(u.get("pk") or u.get("pk_id") or u.get("id"))
    name = u.get("username")
    if not pk or pk <= 0 or not isinstance(name, str) or not name:
        return None
    return {"id": pk, "username": name[:100], "full_name": (u.get("full_name") or None),
            "profile_pic_url": u.get("profile_pic_url"), "is_private": bool(u.get("is_private")),
            "is_verified": bool(u.get("is_verified"))}


def _media_pk(d: dict) -> int | None:
    head = str(d.get("id") or "").split("_")[0]
    if head.isdigit():
        return int(head)
    return _int(d.get("pk"))


def _count(d: dict, *keys: str) -> int | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, dict):
            v = v.get("count")
        n = _int(v)
        if n is not None:
            return n
    return None


def _thumb(d: dict) -> str | None:
    src = d
    if not (src.get("image_versions2") or {}).get("candidates") and d.get("carousel_media"):
        src = d["carousel_media"][0] or {}
    cands = (src.get("image_versions2") or {}).get("candidates") or []
    if cands:
        return cands[-1].get("url")
    return d.get("thumbnail_src") or d.get("display_url")


def find_media(body: Any) -> list[dict]:
    """Gönderi şekline uyan her nesne: kısa kod + ID + sahip + (zaman ya da beğeni sayısı)."""
    out: dict[int, dict] = {}
    for _, d in _walk(body):
        if not isinstance(d, dict):
            continue
        code = d.get("code") or d.get("shortcode")
        pk = _media_pk(d)
        owner = d.get("user") or d.get("owner")
        if not (isinstance(code, str) and pk and isinstance(owner, dict) and owner.get("username")):
            continue
        ts = d.get("taken_at") or d.get("taken_at_timestamp")
        likes = _count(d, "like_count", "edge_liked_by", "edge_media_preview_like")
        if ts is None and likes is None:
            continue
        prev = out.get(pk, {})
        mt = d.get("media_type")
        comments = _count(d, "comment_count", "edge_media_to_comment", "edge_media_to_parent_comment")
        out[pk] = {
            "id": pk, "shortcode": code, "owner": str(owner["username"]),
            "media_type": _MEDIA_TYPES.get(mt, str(mt)) if mt is not None else prev.get("media_type"),
            "thumbnail_url": _thumb(d) or prev.get("thumbnail_url"),
            "caption": ((d.get("caption") or {}).get("text") if isinstance(d.get("caption"), dict) else None)
            or prev.get("caption"),
            "like_count": likes if likes is not None else prev.get("like_count"),
            "comment_count": comments if comments is not None else prev.get("comment_count"),
            "view_count": _int(d.get("play_count") or d.get("view_count") or d.get("video_view_count")),
            "taken_at": datetime.fromtimestamp(int(ts), tz=timezone.utc) if _int(ts) else prev.get("taken_at"),
        }
    return list(out.values())


def _user_list(v: Any) -> list[dict]:
    if isinstance(v, dict):
        for key in ("users", "edges", "items", "likers"):
            if isinstance(v.get(key), list):
                return _user_list(v[key])
        return []
    if isinstance(v, list):
        return [u for u in (_user(x) for x in v) if u]
    return []


def find_likers(body: Any, url: str) -> list[dict] | None:
    """Beğenen listesi: adında 'liker' geçen bir anahtar ya da REST /media/{id}/likers/ yanıtı.
    None: yanıtta beğenen listesi yok. []: liste var ama boş."""
    found: list[dict] | None = None
    for k, v in _walk(body):
        lk = k.lower()
        if not isinstance(v, (dict, list)):
            continue
        if "liker" in lk:
            users = _user_list(v)
            if users or (isinstance(v, dict) and isinstance(v.get("users"), list)):
                found = (found or []) + users
        elif "liked_by" in lk:                       # eski GraphQL: edge_liked_by.edges; yalnızca sayı varsa liste değil
            users = _user_list(v)
            if users:
                found = (found or []) + users
    if found is None and _REST_MEDIA.search(url or "") and _REST_MEDIA.search(url).group(2) == "likers":
        if isinstance(body, dict) and isinstance(body.get("users"), list):
            found = _user_list(body["users"])
    if found is None:
        return None
    return list({u["id"]: u for u in found}.values())


def find_comments(body: Any, url: str) -> list[dict] | None:
    out: dict[int, dict] = {}
    seen_list = False
    for k, v in _walk(body):
        if "comment" not in k.lower() or not isinstance(v, (list, dict)):
            continue
        items = v.get("edges") or v.get("comments") or v.get("items") if isinstance(v, dict) else v
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            node = it.get("node") if isinstance(it.get("node"), dict) else it
            text = node.get("text")
            u = _user(node.get("user") or node.get("owner") or {})
            if not isinstance(text, str) or not u:
                continue
            seen_list = True
            ts = node.get("created_at") or node.get("created_at_utc")
            out.setdefault(u["id"], {"user": u, "text": text,
                                     "at": datetime.fromtimestamp(float(ts), tz=timezone.utc) if _int(ts) else None})
    return list(out.values()) if seen_list else None


def _shortcode_candidates(page_url: str, url: str, variables: dict) -> tuple[set[int], set[str]]:
    ids, codes = set(), set()
    m = _REST_MEDIA.search(url or "")
    if m:
        ids.add(int(m.group(1)))
    for k, v in _walk(variables):
        lk = k.lower()
        if lk in ("media_id", "mediaid", "media_pk", "mediapk", "id", "post_id") and isinstance(v, (str, int)):
            head = str(v).split("_")[0]
            if head.isdigit():
                ids.add(int(head))
        if lk in ("shortcode", "code") and isinstance(v, str):
            codes.add(v)
    m = _POST_PATH.search(urlparse(page_url or "").path)
    if m:
        codes.add(m.group(1))
    return ids, codes


def shape(obj: Any, depth: int = 0) -> Any:
    """Teşhis: yalnızca anahtar yapısı, değer yok."""
    if depth > 5:
        return "…"
    if isinstance(obj, dict):
        return {k: shape(v, depth + 1) for k, v in list(obj.items())[:25]}
    if isinstance(obj, list):
        return [shape(obj[0], depth + 1), f"×{len(obj)}"] if obj else []
    return type(obj).__name__


# ── Kayıt ───────────────────────────────────────────────────────────────────────

async def _get(kv: KV, sid, name: str) -> str | None:
    v = await kv.get(_k(sid, name))
    return _dec(v) if v is not None else None


async def _adopt_real_id(db: AsyncSession, session: Session, real_id: int) -> None:
    """ZIP profili ilk kez gerçek Instagram ID'sini öğrendi."""
    taken = (await db.execute(select(Session.id).where(Session.ig_user_id == real_id))).scalar()
    if not taken:
        session.ig_user_id = real_id


async def _heal_and_upsert(db: AsyncSession, users: list[dict]) -> None:
    from app.services.user_ids import resolve_placeholder
    if not users:
        return
    by_name = {u["username"].lower(): u["id"] for u in users}
    placeholders = (await db.execute(
        select(IgUser.id, func.lower(IgUser.username))
        .where(IgUser.id < 0, func.lower(IgUser.username).in_(list(by_name)))
    )).all()
    for old_id, lname in placeholders:
        real = by_name[lname]
        await db.run_sync(lambda s, o=old_id, r=real: resolve_placeholder(s, o, r))
    unique = list({u["id"]: u for u in users}.values())
    for i in range(0, len(unique), 1000):
        stmt = pg_insert(IgUser).values(unique[i:i + 1000])
        stmt = stmt.on_conflict_do_update(index_elements=[IgUser.id], set_={
            "username": stmt.excluded.username, "full_name": stmt.excluded.full_name,
            "profile_pic_url": stmt.excluded.profile_pic_url, "is_private": stmt.excluded.is_private,
            "is_verified": stmt.excluded.is_verified,
        })
        await db.execute(stmt)


async def _pause(db: AsyncSession, kv: KV, session: Session, reason: str, now: datetime) -> None:
    repeat = bool(await _get(kv, session.id, "risk_at"))
    span = RISK_PAUSE_REPEAT if repeat else RISK_PAUSE
    until = now + span
    if not session.paused_until or session.paused_until < until:
        session.paused_until = until
        session.paused_reason = f"{PAUSE_PREFIX} {reason}"[:200]
    await kv.set(_k(session.id, "risk_at"), str(now.timestamp()), ex=RISK_MEMORY_S)


async def _diag(kv: KV, sid, friendly: str | None, url: str, page_url: str, status: int, body: Any) -> None:
    entry = json.dumps({"at": int(time.time()), "friendly": friendly, "path": urlparse(url).path,
                        "page": urlparse(page_url).path, "status": status, "shape": shape(body)},
                       ensure_ascii=False)[:20000]
    key = _k(sid, "diag")
    await kv.lpush(key, entry)
    await kv.ltrim(key, 0, DIAG_KEEP - 1)
    await kv.expire(key, STATE_TTL_S)


async def observe(db: AsyncSession, kv: KV, session: Session, *, url: str, page_url: str, req_body: str,
                  status: int, text: str, now: datetime | None = None) -> dict:
    """Instagram sayfasının indirdiği bir yanıtı işler. Instagram'a hiçbir istek gönderilmez."""
    now = now or _now()
    sid = session.id
    await kv.set(_k(sid, "seen"), str(time.time()), ex=STATE_TTL_S)
    result = {"posts": 0, "likers": 0, "comments": 0, "warning": False, "ignored": False}

    body = parse_body(text[:MAX_BODY_CHARS])
    friendly, variables = parse_request(req_body, url)
    if is_risk(status, body, text) and relevant(url, friendly):
        msg = (body or {}).get("message") if isinstance(body, dict) else None
        await _pause(db, kv, session, f"Instagram uyarı verdi ({msg or f'HTTP {status}'})", now)
        await db.commit()
        result["warning"] = True
        result["warning_kind"] = warning_kind(status, body)
        result["message"] = warning_message(result["warning_kind"])
        result["paused_until"] = session.paused_until.isoformat()
        return result
    if status != 200 or body is None:
        result["ignored"] = True
        return result

    me = session.ig_username.lower()

    # 1) Kendi gönderilerim (profil ızgarası, gönderi sayfası)
    mine = [m for m in find_media(body) if m["owner"].lower() == me]
    for m in mine:
        row = {k: v for k, v in m.items() if k != "owner" and v is not None}
        stmt = pg_insert(Post).values(session_id=sid, last_synced_at=now, **row)
        stmt = stmt.on_conflict_do_update(index_elements=[Post.id], set_={
            **{k: getattr(stmt.excluded, k) for k in row if k not in ("id", "shortcode", "taken_at")},
            "last_synced_at": now,
        }, where=Post.session_id == sid)
        await db.execute(stmt)
    result["posts"] = len(mine)
    if session.ig_user_id < 0:
        for _, d in _walk(body):
            if isinstance(d, dict) and str(d.get("username", "")).lower() == me and _int(d.get("pk") or d.get("id")):
                await _adopt_real_id(db, session, int(d.get("pk") or d.get("id")))
                break

    # 2) Beğenenler ve yorumlar: yalnızca bu profilin bilinen bir gönderisine bağlanabiliyorsa
    likers = find_likers(body, url)
    comments = find_comments(body, url)
    if likers is not None or comments is not None:
        ids, codes = _shortcode_candidates(page_url, url, variables)
        conds = []
        if ids:
            conds.append(Post.id.in_(ids))
        if codes:
            conds.append(Post.shortcode.in_(codes))
        post = (await db.execute(
            select(Post).where(Post.session_id == sid, or_(*conds)).limit(1)
        )).scalar() if conds else None
        if post is None:
            result["ignored"] = True         # başka birinin gönderisi ya da tanınmayan bağlam
        else:
            if likers is not None:
                users = [u for u in likers if u["id"] != session.ig_user_id and u["username"].lower() != me]
                await _heal_and_upsert(db, users)
                if users:
                    await db.execute(pg_insert(Interaction).values([
                        {"session_id": sid, "ig_user_id": u["id"], "post_id": post.id, "interaction_type": "like"}
                        for u in users
                    ]).on_conflict_do_nothing(index_elements=["ig_user_id", "post_id", "interaction_type"]))
                post.likers_synced_at = now
                result["likers"] = len(users)
            if comments is not None:
                cs = [c for c in comments if c["user"]["id"] != session.ig_user_id and c["user"]["username"].lower() != me]
                await _heal_and_upsert(db, [c["user"] for c in cs])
                if cs:
                    await db.execute(pg_insert(Interaction).values([
                        {"session_id": sid, "ig_user_id": c["user"]["id"], "post_id": post.id,
                         "interaction_type": "comment", "content": c["text"], "interacted_at": c["at"]} for c in cs
                    ]).on_conflict_do_nothing(index_elements=["ig_user_id", "post_id", "interaction_type"]))
                post.comments_synced_at = now
                result["comments"] = len(cs)
    await db.commit()

    if result["likers"] or result["comments"] or result["posts"]:
        today = now.strftime("%Y-%m-%d")
        for name, n in (("today_posts", 1 if result["likers"] else 0), ("today_people", result["likers"])):
            raw = await _get(kv, sid, name)
            day, val = (raw.split("|") + ["0"])[:2] if raw else (today, "0")
            val = int(val) if day == today else 0
            await kv.set(_k(sid, name), f"{today}|{val + n}", ex=STATE_TTL_S)
        await kv.set(_k(sid, "last_saved"), str(time.time()), ex=STATE_TTL_S)
    elif not result["ignored"] and ((friendly and _INTERESTING.search(friendly)) or "liker" in text[:200000].lower()):
        await _diag(kv, sid, friendly, url, page_url, status, body)   # ilgili görünüyor ama tanınmadı
    if session.paused_until and session.paused_until > now:
        result["paused_until"] = session.paused_until.isoformat()
        result["message"] = _pause_message(session.paused_reason)
    return result


def _pause_message(reason: str | None) -> str:
    r = (reason or "").lower()
    kind = ("verify" if "challenge" in r or "checkpoint" in r else
            "logged_out" if "login" in r else
            "action_blocked" if "feedback" in r or "spam" in r else "rate_limit")
    return warning_message(kind)


# ── Durum (arayüz) ──────────────────────────────────────────────────────────────

async def status(db: AsyncSession, kv: KV, session: Session, now: datetime | None = None) -> dict:
    now = now or _now()
    sid = session.id
    row = (await db.execute(select(
        func.count(Post.id), func.count(Post.likers_synced_at), func.count(Post.comments_synced_at),
    ).where(Post.session_id == sid))).one()
    seen = await _get(kv, sid, "seen")
    saved = await _get(kv, sid, "last_saved")
    today = now.strftime("%Y-%m-%d")
    counts = {}
    for name in ("today_posts", "today_people"):
        raw = await _get(kv, sid, name)
        day, val = (raw.split("|") + ["0"])[:2] if raw else ("", "0")
        counts[name] = int(val) if day == today else 0
    paused = bool(session.paused_until and session.paused_until > now)
    ts = lambda v: datetime.fromtimestamp(float(v), tz=timezone.utc).isoformat() if v else None  # noqa: E731
    return {
        "posts": row[0], "likers_done": row[1], "comments_done": row[2],
        "today_posts": counts["today_posts"], "today_people": counts["today_people"],
        "last_seen": ts(seen), "last_saved": ts(saved),
        "connected": bool(seen and time.time() - float(seen) < 15 * 60),
        "stopped": bool(await _get(kv, sid, "off")),
        "paused_until": session.paused_until.isoformat() if paused else None,
        "paused_reason": session.paused_reason if paused else None,
        "paused_message": _pause_message(session.paused_reason) if paused else None,
    }


async def todo(db: AsyncSession, session: Session, limit: int = 8) -> list[dict]:
    """Beğenenleri henüz okunmamış gönderiler, en yeniden."""
    rows = (await db.execute(
        select(Post).where(Post.session_id == session.id, Post.likers_synced_at.is_(None), Post.like_count > 0)
        .order_by(Post.taken_at.desc().nullslast()).limit(max(1, min(limit, 50)))
    )).scalars().all()
    return [{"id": str(p.id), "shortcode": p.shortcode, "thumbnail_url": p.thumbnail_url, "like_count": p.like_count,
             "comment_count": p.comment_count, "taken_at": p.taken_at.isoformat() if p.taken_at else None}
            for p in rows]


async def diagnostics(kv: KV, session_id) -> list[dict]:
    rows = await kv.lrange(_k(session_id, "diag"), 0, DIAG_KEEP - 1)
    out = []
    for r in rows or []:
        try:
            out.append(json.loads(_dec(r)))
        except ValueError:
            pass
    return out


async def set_stopped(kv: KV, session_id: uuid.UUID, stopped: bool) -> None:
    if stopped:
        await kv.set(_k(session_id, "off"), "1", ex=STATE_TTL_S)
    else:
        await kv.delete(_k(session_id, "off"))


async def is_stopped(kv: KV, session_id) -> bool:
    return bool(await _get(kv, session_id, "off"))
