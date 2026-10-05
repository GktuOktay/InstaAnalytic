import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ig_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    ig_username: Mapped[str] = mapped_column(String(100), nullable=False)
    session_data: Mapped[str] = mapped_column(String, nullable=False)  # encrypted
    risk_profile: Mapped[str] = mapped_column(String(20), default="balanced", server_default="balanced")
    plan_b_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
