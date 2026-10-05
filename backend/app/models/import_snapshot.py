import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class ImportSnapshot(Base):
    """Her ZIP içe aktarma / tam tarama sonrası takipçi farkının kaydı."""
    __tablename__ = "import_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # 'zip' | 'scan'
    followers_count: Mapped[int | None] = mapped_column(Integer)
    following_count: Mapped[int | None] = mapped_column(Integer)
    followers_gained: Mapped[list] = mapped_column(JSONB, default=list)
    followers_lost: Mapped[list] = mapped_column(JSONB, default=list)
    following_gained: Mapped[list] = mapped_column(JSONB, default=list)
    following_lost: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
