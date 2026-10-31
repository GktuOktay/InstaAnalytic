"""
Tarayıcı köprüsü: beğenen ve yorum listeleri kullanıcının kendi Chrome'undan, kendi oturumuyla okunur.

Sunucu Instagram'a hiç istek atmaz. Eklenti yalnızca "sıradaki yol ne?" diye sorar, o yolu açık Instagram
sekmesinin içinden getirir ve ham yanıtı geri yollar. Ne isteneceği, ne kadar bekleneceği ve ne zaman
durulacağı burada belirlenir (tek yer, test edilebilir).

Neden böyle: istek aynı cihazdan, aynı IP'den, aynı tarayıcıdan ve aynı oturumdan çıkar. Instagram açısından
kullanıcı kendi gönderisinin beğenenlerine bakıyor; çerez kopyalanmaz, headless tarayıcı yoktur.

Ritim: gönderi başına bir beğenen isteği, yorum isteği yalnızca yorum varsa. Gönderiler arası düzensiz bekleme,
birkaç gönderide bir uzun mola, günlük gönderi tavanı. Risk sinyalinde (429, challenge, giriş duvarı) her şey
24 saat (tekrarında 72 saat) durur.
"""
from __future__ import annotations

import json
import random
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Protocol
from urllib.parse import quote

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.post import Post
from app.models.session import Session
from app.services import human_timing as ht

# ── Yollar (eklenti de yalnızca bunlara izin verir) ─────────────────────────────

FEED_PATH = "/api/v1/feed/user/{uid}/?count=12"
LIKERS_PATH = "/api/v1/media/{pid}/likers/"
COMMENTS_PATH = "/api/v1/media/{pid}/comments/?can_support_threading=true&permalink_enabled=false"

ALLOWED_PATH = re.compile(
    r"^/api/v1/("
    r"feed/user/\d+/\?count=12(&max_id=[\w%.-]+)?"
    r"|media/\d+/likers/(\?max_id=[\w%.-]+)?"
    r"|media/\d+/comments/\?can_support_threading=true&permalink_enabled=false(&min_id=[\w%.-]+)?"
    r")$"
)

# ── Ritim ───────────────────────────────────────────────────────────────────────

MATURE_AFTER = timedelta(days=3)       # beğeniler ilk günlerde birikir; erken okumak eksik liste verir
FEED_EVERY = timedelta(hours=24)
FEED_MAX_PAGES = 9                     # 12'şerli, en yeni ~108 gönderi
PAGES_PER_LIST = 5                     # tek gönderinin beğenen / yorum listesi için en çok sayfa
DAILY_POSTS = {"safe": 12, "balanced": 20, "aggressive": 30}

FEED_PAGE_S = (5, 15)                  # profil ızgarasını kaydırmak
WITHIN_POST_S = (4, 12)                # listeyi kaydırmak, yorumları açmak
BETWEEN_POSTS_S = (25, 80)             # sonraki gönderiye geçmek
BREAK_EVERY = (4, 8)                   # birkaç gönderide bir uzun mola
BREAK_S = (300, 1200)

RISK_PAUSE = timedelta(hours=24)
RISK_PAUSE_REPEAT = timedelta(hours=72)
RISK_MEMORY_S = 7 * 24 * 3600
ERROR_WAIT_S = 600
ERROR_LIMIT = 3
ERROR_PAUSE = timedelta(hours=6)
IDLE_WAIT_S = 6 * 3600
JOB_TTL_S = 900
STATE_TTL_S = 30 * 24 * 3600
MAX_BODY_CHARS = 8 * 1024 * 1024

_RISK_STATUSES = (401, 403, 429)
_RISK_MESSAGES = ("login_required", "checkpoint_required", "challenge_required", "feedback_required")
PAUSE_PREFIX = "Köprü:"


class KV(Protocol):
    async def get(self, key: str): ...
    async def set(self, key: str, value, ex: int | None = None): ...
    async def delete(self, *keys: str): ...


def _k(session_id, name: str) -> str:
    return f"bridge:{session_id}:{name}"


def _dec(v):
    return v.decode() if isinstance(v, bytes) else v


def _now() -> datetime:
    return datetime.now(timezone.utc)


def daily_cap(profile: str | None) -> int:
    return DAILY_POSTS.get(profile or "", DAILY_POSTS["safe"])


# ── Yanıt ayrıştırma (saf fonksiyonlar) ─────────────────────────────────────────

def parse_body(text: str) -> dict | None:
    """JSON değilse None: Instagram giriş sayfasına yönlendirdiyse HTML gelir."""
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def is_risk(status: int, body: dict | None) -> bool:
    if status in _RISK_STATUSES:
        return True
    if body is None:
        return status == 200            # 200 ama JSON değil: giriş duvarı
    return body.get("message") in _RISK_MESSAGES or bool(body.get("require_login")) or bool(body.get("spam"))


def _media_pk(item: dict) -> int:
    head = str(item.get("id") or "").split("_")[0]
    if head.isdigit():
        return int(head)
    try:
        return int(item.get("pk") or 0)
    except (TypeError, ValueError):
        return 0


def _thumb(item: dict) -> str | None:
    src = item
    if not (src.get("image_versions2") or {}).get("candidates") and item.get("carousel_media"):
        src = item["carousel_media"][0]
    cands = (src.get("image_versions2") or {}).get("candidates") or []
    return cands[-1].get("url") if cands else None


_MEDIA_TYPES = {1: "PHOTO", 2: "VIDEO", 8: "ALBUM"}


def parse_feed(body: dict) -> tuple[list[dict], dict | None, str | None]:
    """(gönderiler, sahip {pk, username}, sonraki sayfa imleci)."""
    posts, owner = [], None
    for item in body.get("items") or []:
        if not isinstance(item, dict):
            continue
        pk = _media_pk(item)
        code = item.get("code")
        if not pk or not code:
            continue
        user = item.get("user") or item.get("owner") or {}
        if owner is None and user.get("username"):
            owner = {"pk": int(user.get("pk") or user.get("id") or 0), "username": str(user["username"])}
        ts = item.get("taken_at")
        posts.append({
            "id": pk,
            "shortcode": str(code),
            "media_type": _MEDIA_TYPES.get(item.get("media_type"), str(item.get("media_type") or "")) or None,
            "thumbnail_url": _thumb(item),
            "caption": ((item.get("caption") or {}).get("text") if isinstance(item.get("caption"), dict) else None),
            "like_count": int(item.get("like_count") or 0),
            "comment_count": int(item.get("comment_count") or 0),
            "view_count": item.get("play_count") or item.get("view_count") or item.get("ig_play_count"),
            "taken_at": datetime.fromtimestamp(int(ts), tz=timezone.utc) if isinstance(ts, (int, float)) else None,
        })
    nxt = body.get("next_max_id") if body.get("more_available") else None
    return posts, owner, (str(nxt) if nxt else None)


def _user(u: dict) -> dict | None:
    try:
        pk = int(u.get("pk") or u.get("pk_id") or u.get("id") or 0)
    except (TypeError, ValueError):
        return None
    name = u.get("username")
    if not pk or not name:
        return None
    return {"id": pk, "username": str(name)[:100], "full_name": (u.get("full_name") or None),
            "profile_pic_url": u.get("profile_pic_url"), "is_private": bool(u.get("is_private")),
            "is_verified": bool(u.get("is_verified"))}


def parse_likers(body: dict) -> tuple[list[dict], str | None]:
    users = [x for x in (_user(u) for u in body.get("users") or [] if isinstance(u, dict)) if x]
    nxt = body.get("next_max_id")
    return users, (str(nxt) if nxt else None)


def parse_comments(body: dict) -> tuple[list[dict], str | None]:
    out = []
    for c in body.get("comments") or []:
        if not isinstance(c, dict):
            continue
        u = _user(c.get("user") or {})
        if not u:
            continue
        ts = c.get("created_at") or c.get("created_at_utc")
        out.append({"user": u, "text": c.get("text") or "",
                    "at": datetime.fromtimestamp(float(ts), tz=timezone.utc) if ts else None})
    nxt = body.get("next_min_id") if body.get("has_more_comments") else None
    if isinstance(nxt, dict):
        nxt = json.dumps(nxt, separators=(",", ":"))
    return out, (str(nxt) if nxt else None)


def _with_cursor(path: str, param: str, cursor: str | None) -> str:
    if not cursor:
        return path
    return f"{path}{'&' if '?' in path else '?'}{param}={quote(cursor, safe='')}"


# ── Planlama ────────────────────────────────────────────────────────────────────

def _wait(seconds: float, reason: str, message: str = "") -> dict:
    return {"action": "wait", "wait_s": max(1, int(seconds)), "reason": reason, "message": message}


async def _get(kv: KV, sid, name: str) -> str | None:
    v = await kv.get(_k(sid, name))
    return _dec(v) if v is not None else None


async def plan_next(db: AsyncSession, kv: KV, session: Session, viewer_id: int | None, now: datetime | None = None) -> dict:
    """Sıradaki iş: {"action": "fetch", "kind", "path", "post_id"} ya da {"action": "wait", "wait_s", "reason"}."""
    now = now or _now()
    sid = session.id
    await kv.set(_k(sid, "seen"), str(time.time()), ex=STATE_TTL_S)

    if session.paused_until and session.paused_until > now:
        return _wait((session.paused_until - now).total_seconds(), "paused", session.paused_reason or "")
    if await _get(kv, sid, "off"):
        return _wait(300, "stopped")
    if session.ig_user_id > 0 and viewer_id and viewer_id != session.ig_user_id:
        return _wait(300, "wrong_account")
    if await _get(kv, sid, "wrong_account"):
        return _wait(300, "wrong_account")

    next_at = float(await _get(kv, sid, "next_at") or 0)
    if next_at > now.timestamp():
        return _wait(next_at - now.timestamp(), "pacing")

    job = await _choose(db, kv, session, viewer_id, now)
    if job["action"] == "fetch":
        await kv.set(_k(sid, "job"), json.dumps(job), ex=JOB_TTL_S)
    return job


async def _choose(db: AsyncSession, kv: KV, session: Session, viewer_id: int | None, now: datetime) -> dict:
    sid = session.id

    # 1) Gönderi listesi (profil ızgarası): günde bir, en yeniden geriye
    owner_uid = session.ig_user_id if session.ig_user_id > 0 else (viewer_id or 0)
    cursor = await _get(kv, sid, "feed_cursor")
    last_feed = (await db.execute(
        select(func.max(Post.last_synced_at)).where(Post.session_id == sid)
    )).scalar()
    if owner_uid and (cursor or last_feed is None or now - last_feed > FEED_EVERY):
        path = FEED_PATH.format(uid=owner_uid)
        if cursor and cursor != "-":
            path = _with_cursor(path, "max_id", cursor)
        return {"action": "fetch", "kind": "feed", "path": path, "post_id": None}
    if not owner_uid:
        return _wait(300, "no_viewer")

    # 2) Günlük tavan (son 24 saatte okunan gönderi sayısı)
    cap = daily_cap(session.risk_profile)
    recent = (await db.execute(
        select(Post.likers_synced_at).where(Post.session_id == sid, Post.likers_synced_at > now - timedelta(hours=24))
        .order_by(Post.likers_synced_at)
    )).scalars().all()
    if len(recent) >= cap:
        reopen = recent[0] + timedelta(hours=24)
        return _wait((reopen - now).total_seconds() + random.uniform(0, 1800), "daily_cap")

    for _ in range(50):                  # yorumsuz / beğenisiz gönderiler istek atmadan işaretlenir
        # 3) Beğenenleri okunmuş, yorumları bekleyen gönderi
        p = (await db.execute(
            select(Post).where(Post.session_id == sid, Post.likers_synced_at.is_not(None), Post.comments_synced_at.is_(None))
            .order_by(Post.likers_synced_at).limit(1)
        )).scalar()
        if p:
            if not p.comment_count:
                p.comments_synced_at = now
                await db.commit()
                continue
            path = _with_cursor(COMMENTS_PATH.format(pid=p.id), "min_id", await _get(kv, sid, f"cm:{p.id}"))
            return {"action": "fetch", "kind": "comments", "path": path, "post_id": p.id}

        # 4) Beğenenleri okunmamış, beğenileri oturmuş en yeni gönderi
        p = (await db.execute(
            select(Post).where(
                Post.session_id == sid, Post.likers_synced_at.is_(None),
                (Post.taken_at.is_(None)) | (Post.taken_at <= now - MATURE_AFTER),
            ).order_by(Post.taken_at.desc().nullslast()).limit(1)
        )).scalar()
        if p:
            if not p.like_count:
                p.likers_synced_at = now
                await db.commit()
                continue
            path = _with_cursor(LIKERS_PATH.format(pid=p.id), "max_id", await _get(kv, sid, f"lk:{p.id}"))
            return {"action": "fetch", "kind": "likers", "path": path, "post_id": p.id}
        break

    # 5) Yalnızca yeni gönderiler kaldı: beğeniler oturana kadar bekle
    young = (await db.execute(
        select(func.min(Post.taken_at)).where(Post.session_id == sid, Post.likers_synced_at.is_(None))
    )).scalar()
    if young:
        return _wait(min(IDLE_WAIT_S, max(600, (young + MATURE_AFTER - now).total_seconds())), "waiting_young")
    return _wait(IDLE_WAIT_S, "up_to_date")


# ── Yanıtı işleme ───────────────────────────────────────────────────────────────

class ReportError(ValueError):
    """Eklentiye 4xx olarak dönen hata (iş eşleşmedi, yanlış hesap vb.)."""


async def _set_next(kv: KV, sid, seconds: float) -> int:
    await kv.set(_k(sid, "next_at"), str(time.time() + seconds), ex=STATE_TTL_S)
    return int(seconds)


async def _post_done(kv: KV, sid, rng) -> float:
    left = int(await _get(kv, sid, "until_break") or 0)
    if left <= 1:
        await kv.set(_k(sid, "until_break"), str(rng.randint(*BREAK_EVERY)), ex=STATE_TTL_S)
        return ht.between(rng, *BREAK_S) if left == 1 else ht.between(rng, *BETWEEN_POSTS_S)
    await kv.set(_k(sid, "until_break"), str(left - 1), ex=STATE_TTL_S)
    return ht.between(rng, *BETWEEN_POSTS_S)


async def _pause(db: AsyncSession, kv: KV, session: Session, reason: str, now: datetime) -> dict:
    repeat = bool(await _get(kv, session.id, "risk_at"))
    span = RISK_PAUSE_REPEAT if repeat else RISK_PAUSE
    session.paused_until = now + span
    session.paused_reason = f"{PAUSE_PREFIX} {reason}"[:200]
    await db.commit()
    await kv.set(_k(session.id, "risk_at"), str(now.timestamp()), ex=RISK_MEMORY_S)
    await kv.delete(_k(session.id, "job"))
    return _wait(span.total_seconds(), "paused", session.paused_reason)


async def handle_report(db: AsyncSession, kv: KV, session: Session, path: str, status: int, text: str,
                        now: datetime | None = None, rng=random) -> dict:
    now = now or _now()
    sid = session.id
    raw_job = await _get(kv, sid, "job")
    job = json.loads(raw_job) if raw_job else None
    if not job or job.get("path") != path:
        raise ReportError("Bu yanıt beklenen işle eşleşmiyor")
    await kv.delete(_k(sid, "job"))
    kind, pid = job["kind"], job.get("post_id")

    body = parse_body(text[:MAX_BODY_CHARS])
    if is_risk(status, body):
        msg = (body or {}).get("message") or f"HTTP {status}"
        return await _pause(db, kv, session, f"Instagram uyarı verdi ({msg})", now)

    if status == 404 and pid:                        # gönderi silinmiş
        post = await db.get(Post, pid)
        if post:
            post.likers_synced_at = post.likers_synced_at or now
            post.comments_synced_at = now
            await db.commit()
        return {"action": "ok", "wait_s": await _set_next(kv, sid, ht.between(rng, *WITHIN_POST_S))}

    if status != 200 or body is None:
        errors = int(await _get(kv, sid, "errors") or 0) + 1
        await kv.set(_k(sid, "errors"), str(errors), ex=STATE_TTL_S)
        if errors >= ERROR_LIMIT:
            await kv.delete(_k(sid, "errors"))
            session.paused_until = now + ERROR_PAUSE
            session.paused_reason = f"{PAUSE_PREFIX} Instagram üst üste yanıt vermedi (HTTP {status})"
            await db.commit()
            return _wait(ERROR_PAUSE.total_seconds(), "paused", session.paused_reason)
        return {"action": "ok", "wait_s": await _set_next(kv, sid, ERROR_WAIT_S)}
    await kv.delete(_k(sid, "errors"))

    if kind == "feed":
        return await _ingest_feed(db, kv, session, body, now, rng)
    if kind == "likers":
        return await _ingest_likers(db, kv, session, pid, body, now, rng)
    return await _ingest_comments(db, kv, session, pid, body, now, rng)


async def _ingest_feed(db, kv, session: Session, body: dict, now: datetime, rng) -> dict:
    sid = session.id
    posts, owner, nxt = parse_feed(body)
    if owner:
        if owner["username"].lower() != session.ig_username.lower():
            await kv.set(_k(sid, "wrong_account"), owner["username"], ex=600)
            await kv.delete(_k(sid, "feed_cursor"))
            raise ReportError(f"Instagram'da @{owner['username']} açık; bu profil @{session.ig_username}")
        if session.ig_user_id < 0 and owner["pk"] > 0:
            await _adopt_real_id(db, session, owner["pk"])

    for p in posts:
        stmt = pg_insert(Post).values(session_id=sid, last_synced_at=now, **p)
        stmt = stmt.on_conflict_do_update(index_elements=[Post.id], set_={
            "like_count": stmt.excluded.like_count, "comment_count": stmt.excluded.comment_count,
            "view_count": stmt.excluded.view_count, "thumbnail_url": stmt.excluded.thumbnail_url,
            "caption": stmt.excluded.caption, "last_synced_at": now,
        }, where=Post.session_id == sid)
        await db.execute(stmt)
    await db.commit()

    pages = int(await _get(kv, sid, "feed_pages") or 0) + 1
    if nxt and pages < FEED_MAX_PAGES:
        await kv.set(_k(sid, "feed_cursor"), nxt, ex=STATE_TTL_S)
        await kv.set(_k(sid, "feed_pages"), str(pages), ex=STATE_TTL_S)
    else:
        await kv.delete(_k(sid, "feed_cursor"), _k(sid, "feed_pages"))
        if not posts:
            await kv.set(_k(sid, "next_at"), str(time.time() + IDLE_WAIT_S), ex=STATE_TTL_S)
            return {"action": "ok", "wait_s": IDLE_WAIT_S, "posts": 0}
    return {"action": "ok", "wait_s": await _set_next(kv, sid, ht.between(rng, *FEED_PAGE_S)), "posts": len(posts)}


async def _adopt_real_id(db: AsyncSession, session: Session, real_id: int) -> None:
    """ZIP profili ilk kez gerçek Instagram ID'sini öğrendi."""
    taken = (await db.execute(select(Session.id).where(Session.ig_user_id == real_id))).scalar()
    if not taken:
        session.ig_user_id = real_id
        await db.commit()


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
    unique = {u["id"]: u for u in users}
    stmt = pg_insert(IgUser).values(list(unique.values()))
    stmt = stmt.on_conflict_do_update(index_elements=[IgUser.id], set_={
        "username": stmt.excluded.username, "full_name": stmt.excluded.full_name,
        "profile_pic_url": stmt.excluded.profile_pic_url, "is_private": stmt.excluded.is_private,
        "is_verified": stmt.excluded.is_verified,
    })
    await db.execute(stmt)


async def _ingest_likers(db, kv, session: Session, pid: int, body: dict, now: datetime, rng) -> dict:
    sid = session.id
    users, nxt = parse_likers(body)
    users = [u for u in users if u["id"] != session.ig_user_id]
    await _heal_and_upsert(db, users)
    if users:
        await db.execute(pg_insert(Interaction).values([
            {"session_id": sid, "ig_user_id": u["id"], "post_id": pid, "interaction_type": "like"} for u in users
        ]).on_conflict_do_nothing(index_elements=["ig_user_id", "post_id", "interaction_type"]))

    pages = int(await _get(kv, sid, f"lkp:{pid}") or 0) + 1
    post = await db.get(Post, pid)
    if nxt and pages < PAGES_PER_LIST:
        await db.commit()
        await kv.set(_k(sid, f"lk:{pid}"), nxt, ex=STATE_TTL_S)
        await kv.set(_k(sid, f"lkp:{pid}"), str(pages), ex=STATE_TTL_S)
        return {"action": "ok", "wait_s": await _set_next(kv, sid, ht.between(rng, *WITHIN_POST_S)), "saved": len(users)}
    await kv.delete(_k(sid, f"lk:{pid}"), _k(sid, f"lkp:{pid}"))
    if post:
        post.likers_synced_at = now
        if not post.comment_count:
            post.comments_synced_at = now
    await db.commit()
    wait = ht.between(rng, *WITHIN_POST_S) if post and post.comment_count else await _post_done(kv, sid, rng)
    return {"action": "ok", "wait_s": await _set_next(kv, sid, wait), "saved": len(users)}


async def _ingest_comments(db, kv, session: Session, pid: int, body: dict, now: datetime, rng) -> dict:
    sid = session.id
    comments, nxt = parse_comments(body)
    comments = [c for c in comments if c["user"]["id"] != session.ig_user_id]
    await _heal_and_upsert(db, [c["user"] for c in comments])
    first: dict[int, dict] = {}
    for c in comments:                       # tabloda kullanıcı başına bir yorum: ilki saklanır
        first.setdefault(c["user"]["id"], c)
    if first:
        await db.execute(pg_insert(Interaction).values([
            {"session_id": sid, "ig_user_id": uid, "post_id": pid, "interaction_type": "comment",
             "content": c["text"], "interacted_at": c["at"]} for uid, c in first.items()
        ]).on_conflict_do_nothing(index_elements=["ig_user_id", "post_id", "interaction_type"]))

    pages = int(await _get(kv, sid, f"cmp:{pid}") or 0) + 1
    if nxt and pages < PAGES_PER_LIST:
        await db.commit()
        await kv.set(_k(sid, f"cm:{pid}"), nxt, ex=STATE_TTL_S)
        await kv.set(_k(sid, f"cmp:{pid}"), str(pages), ex=STATE_TTL_S)
        return {"action": "ok", "wait_s": await _set_next(kv, sid, ht.between(rng, *WITHIN_POST_S)), "saved": len(first)}
    await kv.delete(_k(sid, f"cm:{pid}"), _k(sid, f"cmp:{pid}"))
    post = await db.get(Post, pid)
    if post:
        post.comments_synced_at = now
    await db.commit()
    return {"action": "ok", "wait_s": await _set_next(kv, sid, await _post_done(kv, sid, rng)), "saved": len(first)}


# ── Durum (arayüz) ──────────────────────────────────────────────────────────────

async def status(db: AsyncSession, kv: KV, session: Session, now: datetime | None = None) -> dict:
    now = now or _now()
    sid = session.id
    row = (await db.execute(select(
        func.count(Post.id),
        func.count(Post.likers_synced_at),
        func.count(Post.comments_synced_at),
        func.count(Post.id).filter(and_(Post.likers_synced_at.is_(None), Post.taken_at > now - MATURE_AFTER)),
        func.count(Post.id).filter(Post.likers_synced_at > now - timedelta(hours=24)),
    ).where(Post.session_id == sid))).one()
    seen = await _get(kv, sid, "seen")
    next_at = await _get(kv, sid, "next_at")
    paused = bool(session.paused_until and session.paused_until > now)
    return {
        "posts": row[0], "likers_done": row[1], "comments_done": row[2], "waiting_young": row[3],
        "today": row[4], "daily_cap": daily_cap(session.risk_profile),
        "last_seen": datetime.fromtimestamp(float(seen), tz=timezone.utc).isoformat() if seen else None,
        "connected": bool(seen and time.time() - float(seen) < 15 * 60),
        "stopped": bool(await _get(kv, sid, "off")),
        "wrong_account": await _get(kv, sid, "wrong_account"),
        "paused_until": session.paused_until.isoformat() if paused else None,
        "paused_reason": session.paused_reason if paused else None,
        "next_at": datetime.fromtimestamp(float(next_at), tz=timezone.utc).isoformat()
        if next_at and float(next_at) > time.time() else None,
    }


async def set_stopped(kv: KV, session_id: uuid.UUID, stopped: bool) -> None:
    if stopped:
        await kv.set(_k(session_id, "off"), "1", ex=STATE_TTL_S)
    else:
        await kv.delete(_k(session_id, "off"), _k(session_id, "wrong_account"))
