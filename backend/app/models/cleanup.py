"""SPEC-001 §7.2: Kaydedilenler temizleme tabloları (taramalar, envanter, partiler, öğeler, yazma izinleri, koleksiyonlar).

Kısıtlar migration'la (alembic/versions/o5e7a9c1d3f5_cleanup_saved.py) birebir aynıdır; adlandırılmış CHECK'ler
`ck_<tablo>_<kolon>`. Kısmi benzersiz indeksler hem orada hem burada `postgresql_where` ile tanımlıdır.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text,
    UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

_ID = r"^\d{1,25}$"


def _sid():
    return mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)


class CleanupScan(Base):
    __tablename__ = "cleanup_scans"
    __table_args__ = (
        CheckConstraint("kind = 'saved'", name="ck_cleanup_scans_kind"),
        CheckConstraint("status IN ('running','ok','partial','failed','blocked')", name="ck_cleanup_scans_status"),
        CheckConstraint("pages >= 0", name="ck_cleanup_scans_pages"),
        CheckConstraint("items >= 0", name="ck_cleanup_scans_items"),
        CheckConstraint("duplicates >= 0", name="ck_cleanup_scans_duplicates"),
        CheckConstraint("collections_mode IN ('per_collection','all_protected')",
                        name="ck_cleanup_scans_collections_mode"),
        Index("ix_cleanup_scans_session_id", "session_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    kind: Mapped[str] = mapped_column(String(5), nullable=False, default="saved", server_default="saved")
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    items: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    duplicates: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_page_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    collections_mode: Mapped[str] = mapped_column(
        String(14), nullable=False, default="all_protected", server_default="all_protected")
    collections_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # K-7: koleksiyon hakkı tüketildi


class SavedCollection(Base):
    """W modu (K-17): profilin koleksiyonları ve koruma bayrağı. Ad yalnız arayüzde gösterilir, log'a yazılmaz."""
    __tablename__ = "saved_collections"
    __table_args__ = (
        UniqueConstraint("session_id", "collection_id", name="uq_saved_collections_session_collection"),
        CheckConstraint(rf"collection_id ~ '{_ID}'", name="ck_saved_collections_collection_id"),
        CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="ck_saved_collections_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    collection_id: Mapped[str] = mapped_column(String(25), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    protected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    first_seen_scan_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cleanup_scans.id", ondelete="SET NULL"), nullable=True)
    last_seen_scan_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cleanup_scans.id", ondelete="SET NULL"), nullable=True)
    listed_scan_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cleanup_scans.id", ondelete="SET NULL"), nullable=True)   # son koleksiyon çağrısının taraması; finish(ok|partial) last_seen'e çevirir
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class SavedTarget(Base):
    __tablename__ = "saved_targets"
    __table_args__ = (
        UniqueConstraint("scan_id", "media_id", name="uq_saved_targets_scan_media"),
        CheckConstraint("position >= 0", name="ck_saved_targets_position"),
        CheckConstraint(rf"media_id ~ '{_ID}'", name="ck_saved_targets_media_id"),
        CheckConstraint(r"shortcode ~ '^[\w-]{5,40}$'", name="ck_saved_targets_shortcode"),
        CheckConstraint(r"owner_username IS NULL OR owner_username ~ '^[a-z0-9._]{1,30}$'",
                        name="ck_saved_targets_owner_username"),
        CheckConstraint("media_type IS NULL OR media_type IN ('image','video','carousel')",
                        name="ck_saved_targets_media_type"),
        Index("ix_saved_targets_scan_owner", "scan_id", "owner_username"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    scan_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cleanup_scans.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    media_id: Mapped[str] = mapped_column(String(25), nullable=False)
    shortcode: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_username: Mapped[str | None] = mapped_column(String(30), nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_ad: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    collections_unreadable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class CleanupBatch(Base):
    __tablename__ = "cleanup_batches"
    __table_args__ = (
        CheckConstraint("kind = 'saved'", name="ck_cleanup_batches_kind"),
        CheckConstraint("status IN ('draft','confirmed','running','stopped','done','cancelled','expired')",
                        name="ck_cleanup_batches_status"),
        CheckConstraint("item_count BETWEEN 0 AND 500", name="ck_cleanup_batches_item_count"),
        Index("uq_cleanup_batches_active", "session_id", "kind", unique=True,
              postgresql_where=text("status IN ('confirmed','running','stopped')")),
        Index("uq_cleanup_batches_draft", "session_id", "kind", unique=True,
              postgresql_where=text("status = 'draft'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    kind: Mapped[str] = mapped_column(String(5), nullable=False, default="saved", server_default="saved")
    scan_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cleanup_scans.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    selection: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    plan_refs: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_items_at_preview: Mapped[int] = mapped_column(Integer, nullable=False)
    run_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_stop_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_allow_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stale_after_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stopped_ext_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CleanupItem(Base):
    __tablename__ = "cleanup_items"
    __table_args__ = (
        CheckConstraint("action = 'unsave'", name="ck_cleanup_items_action"),
        CheckConstraint(rf"ref ~ '{_ID}'", name="ck_cleanup_items_ref"),
        CheckConstraint("status IN ('pending','done','already','not_found','protected','failed','cancelled')",
                        name="ck_cleanup_items_status"),
        CheckConstraint("attempts BETWEEN 0 AND 3", name="ck_cleanup_items_attempts"),
        Index("ix_cleanup_items_session_action_status", "session_id", "action", "status"),
        Index("uq_cleanup_items_pending_ref", "session_id", "action", "ref", unique=True,
              postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    batch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cleanup_batches.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False, default="unsave", server_default="unsave")
    ref: Mapped[str] = mapped_column(String(25), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    note_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    http_status: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    fields: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    prechecked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CleanupWriteGrant(Base):
    """R7 M5: her `precheck allow` aynı işlemde bir satır yazar; günlük yazma sayımı buradan yapılır.
    `cleanup_retention` 48 saatten eski satırları siler."""
    __tablename__ = "cleanup_write_grants"
    __table_args__ = (Index("ix_cleanup_write_grants_session_granted", "session_id", "granted_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = _sid()
    item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cleanup_items.id", ondelete="CASCADE"), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
