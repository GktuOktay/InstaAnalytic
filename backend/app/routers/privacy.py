import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.action_log import ActionLog
from app.models.ig_user import IgUser
from app.models.interaction import Interaction
from app.models.relationship import Relationship
from app.models.session import Session

router = APIRouter(prefix="/sessions/{session_id}", tags=["privacy"])


async def _get_session(session_id: uuid.UUID, db: AsyncSession) -> Session:
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session bulunamadı")
    return session


def _safe(v) -> str:
    """CSV/Excel formül enjeksiyonuna karşı: =, +, -, @ ile başlayan hücrelerin başına ' koy."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _csv_response(name: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([_safe(c) for c in r])
    # utf-8-sig: Excel'de Türkçe karakterler doğru görünsün
    return Response(
        content=buf.getvalue().encode("utf-8-sig"), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Content-Type-Options": "nosniff"},
    )


@router.get("/export/relationships.csv")
async def export_relationships(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_session(session_id, db)
    q = (select(IgUser.username, IgUser.full_name, Relationship.they_follow, Relationship.we_follow)
         .join(IgUser, IgUser.id == Relationship.ig_user_id)
         .where(Relationship.session_id == session_id).order_by(IgUser.username))
    rows = [[u, n, "evet" if t else "hayır", "evet" if w else "hayır",
             "evet" if (t and w) else "hayır"] for u, n, t, w in (await db.execute(q)).all()]
    return _csv_response("takip-durumu.csv",
                         ["kullanıcı adı", "ad", "beni takip ediyor", "ben takip ediyorum", "karşılıklı"], rows)


@router.delete("/purge", status_code=200)
async def purge_all_data(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    "Tüm verimi sil": oturumu ve ona bağlı HER ŞEYİ (gönderiler, etkileşimler, takip ilişkileri,
    işlem günlüğü, ZIP geçmişi) siler; artık hiçbir oturumda kullanılmayan kullanıcı kayıtları da temizlenir.
    """
    session = await _get_session(session_id, db)
    own_id = session.ig_user_id
    await db.delete(session)          # FK ON DELETE CASCADE: diğer tablolar otomatik temizlenir
    await db.flush()
    still_used = (
        exists().where(Relationship.ig_user_id == IgUser.id)
        | exists().where(Interaction.ig_user_id == IgUser.id)
        | exists().where(ActionLog.ig_user_id == IgUser.id)
        | exists().where(Session.ig_user_id == IgUser.id)
    )
    result = await db.execute(delete(IgUser).where(~still_used).returning(IgUser.id))
    removed_users = len(result.all())
    await db.commit()
    return {"purged": True, "removed_users": removed_users, "own_id": own_id}
