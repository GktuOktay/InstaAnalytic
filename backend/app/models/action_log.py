import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class ActionLog(Base):
    __tablename__ = "action_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    ig_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ig_users.id"))
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)   # 'follow', 'unfollow'
    status: Mapped[str] = mapped_column(String(20), default="pending")     # pending/success/failed/skipped
    error_msg: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
