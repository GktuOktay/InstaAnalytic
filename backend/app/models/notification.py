import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class Notification(Base):
    """Uygulama içi bildirim. Metin burada tutulmaz: tür + parametre saklanır, arayüz seçili dilde yazar."""
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_read_created", "read_at", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="info")   # info | success | warning | error
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    link: Mapped[str | None] = mapped_column(String(100))                              # uygulama içi rota
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
