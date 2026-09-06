import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # Instagram post ID
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    shortcode: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(20))
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int | None] = mapped_column(Integer)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
