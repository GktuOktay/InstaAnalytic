import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Relationship(Base):
    __tablename__ = "relationships"

    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    ig_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ig_users.id"), primary_key=True)
    we_follow: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    they_follow: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    we_follow_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    they_follow_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
