import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("ig_user_id", "post_id", "interaction_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    ig_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ig_users.id"), index=True)
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("posts.id"), index=True)
    interaction_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'like', 'comment'
    content: Mapped[str | None] = mapped_column(Text)
    interacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
