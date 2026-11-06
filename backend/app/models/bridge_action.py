import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Integer, String, Text, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class BridgeAction(Base):
    """Eklentinin Instagram sekmesinde, insan hızında ve sırayla yaptığı takip / takipten çıkma kuyruğu."""
    __tablename__ = "bridge_actions"
    __table_args__ = (Index("ix_bridge_actions_session_status", "session_id", "status"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    ig_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ig_users.id"))
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)          # follow | unfollow
    status: Mapped[str] = mapped_column(String(10), default="pending", server_default="pending")  # pending|done|skipped|failed
    manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")   # kullanıcı bu kişiye tek tek tıkladı: insan hızı
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")   # başarısız denemeler
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
