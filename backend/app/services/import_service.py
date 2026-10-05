"""ZIP export verisini veritabanına uygular (ağ isteği yok)."""
from datetime import datetime, timezone

from sqlalchemy import select, update, func, case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ig_user import IgUser
from app.models.relationship import Relationship
from app.models.import_snapshot import ImportSnapshot
from app.services.ig_export import ExportData, ExportEntry, ExportError
from app.services.user_ids import placeholder_id

_CHUNK = 5000
_LIST_CAP = 500


def _ts(ts: int | None):
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


async def _map_usernames(db: AsyncSession, entries: list[ExportEntry]) -> dict[str, int]:
    """username(lower) -> ig_user id (mevcut kayıt ya da yer tutucu). Eksik kullanıcıları ekler."""
    names = [e.username.lower() for e in entries]
    mapping: dict[str, int] = {}
    for i in range(0, len(names), _CHUNK):
        rows = await db.execute(
            select(IgUser.id, func.lower(IgUser.username))
            .where(func.lower(IgUser.username).in_(names[i:i + _CHUNK]))
            # gerçek (pozitif) ID'yi yer tutucuya tercih et
            .order_by(IgUser.id.asc())
        )
        for uid, lname in rows:
            if lname not in mapping or uid > 0:
                mapping[lname] = uid
    missing = [e for e in entries if e.username.lower() not in mapping]
    for i in range(0, len(missing), _CHUNK):
        vals = []
        for e in missing[i:i + _CHUNK]:
            pid = placeholder_id(e.username)
            mapping[e.username.lower()] = pid
            vals.append({"id": pid, "username": e.username, "is_private": False, "is_verified": False})
        await db.execute(pg_insert(IgUser).values(vals).on_conflict_do_nothing(index_elements=["id"]))
    return mapping


async def _apply_dimension(db: AsyncSession, session_id, entries: list[ExportEntry], flag: str) -> tuple[list[str], list[str]]:
    """flag: 'they_follow' | 'we_follow'. (gained_usernames, lost_usernames) döner."""
    since_col = f"{flag}_since"
    col = getattr(Relationship, flag)
    since = getattr(Relationship, since_col)
    mapping = await _map_usernames(db, entries)
    new_ids = {mapping[e.username.lower()]: e for e in entries}

    prev_ids = set((await db.execute(
        select(Relationship.ig_user_id).where(Relationship.session_id == session_id, col.is_(True))
    )).scalars().all())

    if not new_ids and prev_ids:
        raise ExportError("Dosyada hiç kullanıcı yok; mevcut veriyi silmemek için işlem iptal edildi.")

    now = datetime.now(timezone.utc)
    items = list(new_ids.items())
    for i in range(0, len(items), _CHUNK):
        rows = [{"session_id": session_id, "ig_user_id": uid, flag: True,
                 since_col: _ts(e.timestamp), "last_checked_at": now}
                for uid, e in items[i:i + _CHUNK]]
        stmt = pg_insert(Relationship).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["session_id", "ig_user_id"],
            set_={
                flag: True,
                since_col: case((col.is_(False), stmt.excluded[since_col]),
                                else_=func.coalesce(since, stmt.excluded[since_col])),
                "last_checked_at": now,
            },
        )
        await db.execute(stmt)

    lost_ids = prev_ids - set(new_ids)
    lost_names: list[str] = []
    if lost_ids:
        lost = list(lost_ids)
        for i in range(0, len(lost), _CHUNK):
            part = lost[i:i + _CHUNK]
            await db.execute(update(Relationship).where(
                Relationship.session_id == session_id, Relationship.ig_user_id.in_(part)
            ).values({flag: False, "last_checked_at": now}))
            lost_names += (await db.execute(select(IgUser.username).where(IgUser.id.in_(part)))).scalars().all()
    gained_names = [new_ids[u].username for u in new_ids if u not in prev_ids]
    return gained_names, lost_names


async def apply_export(db: AsyncSession, session_id, data: ExportData, source: str = "zip") -> dict:
    out = {"followers": None, "following": None}
    snap = ImportSnapshot(session_id=session_id, source=source)
    if data.has_followers:
        g, l = await _apply_dimension(db, session_id, data.followers, "they_follow")
        snap.followers_count, snap.followers_gained, snap.followers_lost = len(data.followers), g[:_LIST_CAP], l[:_LIST_CAP]
        out["followers"] = {"count": len(data.followers), "gained": len(g), "lost": len(l)}
    if data.has_following:
        g, l = await _apply_dimension(db, session_id, data.following, "we_follow")
        snap.following_count, snap.following_gained, snap.following_lost = len(data.following), g[:_LIST_CAP], l[:_LIST_CAP]
        out["following"] = {"count": len(data.following), "gained": len(g), "lost": len(l)}
    db.add(snap)
    await db.commit()
    await db.refresh(snap)
    return {
        "snapshot_id": str(snap.id), **out,
        "followers_lost": snap.followers_lost, "followers_gained": snap.followers_gained,
        "following_lost": snap.following_lost, "following_gained": snap.following_gained,
        "needs_id_resolution": True,
    }
