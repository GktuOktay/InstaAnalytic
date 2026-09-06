from datetime import datetime
from sqlalchemy import BigInteger, String, Boolean, Integer, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class IgUser(Base):
    __tablename__ = "ig_users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # Instagram user ID
    username: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    profile_pic_url: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    follower_count: Mapped[int | None] = mapped_column(Integer)
    following_count: Mapped[int | None] = mapped_column(Integer)
    post_count: Mapped[int | None] = mapped_column(Integer)
    bio: Mapped[str | None] = mapped_column(Text)
    external_url: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
