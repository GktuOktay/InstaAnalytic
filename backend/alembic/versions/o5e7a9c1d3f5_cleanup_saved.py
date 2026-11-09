"""SPEC-001: kaydedilenler temizleme tabloları, sessions/action_log değişiklikleri

Revision ID: o5e7a9c1d3f5
Revises: n4d6f8b0c2e4

downgrade: yeni tablo ve kolonlar düşer; action_log.ig_user_id nullable KALIR (ADR-0001 b),
çünkü unsave/cleanup_setting/collection_protection satırlarında ig_user_id null olabilir ve geri NOT NULL
yapmak bu satırları silmeyi gerektirir.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'o5e7a9c1d3f5'
down_revision: Union[str, None] = 'n4d6f8b0c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ID = r"^\d{1,25}$"


def _sid():
    return sa.Column('session_id', sa.UUID(), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)


def _ts(name, **kw):
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


def upgrade() -> None:
    # sessions
    op.add_column('sessions', sa.Column('allow_unsave', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('sessions', _ts('unsave_enabled_at', nullable=True))
    op.add_column('sessions', _ts('cleanup_paused_until', nullable=True))
    op.add_column('sessions', sa.Column('cleanup_paused_reason', sa.String(length=200), nullable=True))

    # action_log
    op.alter_column('action_log', 'ig_user_id', existing_type=sa.BigInteger(), nullable=True)
    op.add_column('action_log', sa.Column('target_ref', sa.String(length=64), nullable=True))
    op.add_column('action_log', sa.Column('target_label', sa.String(length=200), nullable=True))
    # action_type zaten varchar(30): collection_protection (21) sığar, genişletme gerekmez (spec §7.2 denetimi)

    op.create_table(
        'cleanup_scans',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('kind', sa.String(length=5), nullable=False, server_default='saved'),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('pages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duplicates', sa.Integer(), nullable=False, server_default='0'),
        _ts('started_at', nullable=False, server_default=sa.text('now()')),
        _ts('last_page_at', nullable=True),
        _ts('finished_at', nullable=True),
        sa.Column('note_code', sa.String(length=30), nullable=True),
        sa.Column('collections_mode', sa.String(length=14), nullable=False, server_default='all_protected'),
        _ts('collections_received_at', nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("kind = 'saved'", name='ck_cleanup_scans_kind'),
        sa.CheckConstraint("status IN ('running','ok','partial','failed','blocked')", name='ck_cleanup_scans_status'),
        sa.CheckConstraint("pages >= 0", name='ck_cleanup_scans_pages'),
        sa.CheckConstraint("items >= 0", name='ck_cleanup_scans_items'),
        sa.CheckConstraint("duplicates >= 0", name='ck_cleanup_scans_duplicates'),
        sa.CheckConstraint("collections_mode IN ('per_collection','all_protected')",
                           name='ck_cleanup_scans_collections_mode'),
    )
    op.create_index('ix_cleanup_scans_session_id', 'cleanup_scans', ['session_id'])

    op.create_table(
        'saved_collections',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('collection_id', sa.String(length=25), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('protected', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('first_seen_scan_id', sa.BigInteger(), sa.ForeignKey('cleanup_scans.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_seen_scan_id', sa.BigInteger(), sa.ForeignKey('cleanup_scans.id', ondelete='SET NULL'), nullable=True),
        sa.Column('listed_scan_id', sa.BigInteger(), sa.ForeignKey('cleanup_scans.id', ondelete='SET NULL'), nullable=True),
        _ts('created_at', nullable=False, server_default=sa.text('now()')),
        _ts('updated_at', nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'collection_id', name='uq_saved_collections_session_collection'),
        sa.CheckConstraint(f"collection_id ~ '{ID}'", name='ck_saved_collections_collection_id'),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 100", name='ck_saved_collections_name'),
    )

    op.create_table(
        'saved_targets',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('scan_id', sa.BigInteger(), sa.ForeignKey('cleanup_scans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('media_id', sa.String(length=25), nullable=False),
        sa.Column('shortcode', sa.String(length=40), nullable=False),
        sa.Column('owner_username', sa.String(length=30), nullable=True),
        sa.Column('media_type', sa.String(length=10), nullable=True),
        sa.Column('is_ad', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('thumbnail_url', sa.Text(), nullable=True),
        sa.Column('collection_ids', postgresql.JSONB(), nullable=True),
        sa.Column('collections_unreadable', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('scan_id', 'media_id', name='uq_saved_targets_scan_media'),
        sa.CheckConstraint("position >= 0", name='ck_saved_targets_position'),
        sa.CheckConstraint(f"media_id ~ '{ID}'", name='ck_saved_targets_media_id'),
        sa.CheckConstraint(r"shortcode ~ '^[\w-]{5,40}$'", name='ck_saved_targets_shortcode'),
        sa.CheckConstraint(r"owner_username IS NULL OR owner_username ~ '^[a-z0-9._]{1,30}$'",
                           name='ck_saved_targets_owner_username'),
        sa.CheckConstraint("media_type IS NULL OR media_type IN ('image','video','carousel')",
                           name='ck_saved_targets_media_type'),
    )
    op.create_index('ix_saved_targets_scan_owner', 'saved_targets', ['scan_id', 'owner_username'])

    op.create_table(
        'cleanup_batches',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('kind', sa.String(length=5), nullable=False, server_default='saved'),
        sa.Column('scan_id', sa.BigInteger(), sa.ForeignKey('cleanup_scans.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('selection', postgresql.JSONB(), nullable=True),
        sa.Column('plan_refs', postgresql.JSONB(), nullable=True),
        sa.Column('item_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_items_at_preview', sa.Integer(), nullable=False),
        sa.Column('run_seq', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_stop_reason', sa.String(length=30), nullable=True),
        _ts('last_allow_at', nullable=True),
        sa.Column('stale_after_s', sa.Integer(), nullable=True),
        sa.Column('stopped_ext_version', sa.String(length=20), nullable=True),
        _ts('created_at', nullable=False, server_default=sa.text('now()')),
        _ts('expires_at', nullable=False),
        _ts('confirmed_at', nullable=True),
        _ts('started_at', nullable=True),
        _ts('last_seen_at', nullable=True),
        _ts('last_progress_at', nullable=True),
        _ts('finished_at', nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("kind = 'saved'", name='ck_cleanup_batches_kind'),
        sa.CheckConstraint("status IN ('draft','confirmed','running','stopped','done','cancelled','expired')",
                           name='ck_cleanup_batches_status'),
        sa.CheckConstraint("item_count BETWEEN 0 AND 500", name='ck_cleanup_batches_item_count'),
    )
    op.create_index('uq_cleanup_batches_active', 'cleanup_batches', ['session_id', 'kind'], unique=True,
                    postgresql_where=sa.text("status IN ('confirmed','running','stopped')"))
    op.create_index('uq_cleanup_batches_draft', 'cleanup_batches', ['session_id', 'kind'], unique=True,
                    postgresql_where=sa.text("status = 'draft'"))

    op.create_table(
        'cleanup_items',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('batch_id', sa.BigInteger(), sa.ForeignKey('cleanup_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(length=10), nullable=False, server_default='unsave'),
        sa.Column('ref', sa.String(length=25), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False, server_default='pending'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('note_code', sa.String(length=30), nullable=True),
        sa.Column('http_status', sa.SmallInteger(), nullable=True),
        sa.Column('fields', postgresql.JSONB(), nullable=True),
        _ts('prechecked_at', nullable=True),
        _ts('created_at', nullable=False, server_default=sa.text('now()')),
        _ts('done_at', nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("action = 'unsave'", name='ck_cleanup_items_action'),
        sa.CheckConstraint(f"ref ~ '{ID}'", name='ck_cleanup_items_ref'),
        sa.CheckConstraint("status IN ('pending','done','already','not_found','protected','failed','cancelled')",
                           name='ck_cleanup_items_status'),
        sa.CheckConstraint("attempts BETWEEN 0 AND 3", name='ck_cleanup_items_attempts'),
    )
    op.create_index('ix_cleanup_items_session_action_status', 'cleanup_items', ['session_id', 'action', 'status'])
    op.create_index('uq_cleanup_items_pending_ref', 'cleanup_items', ['session_id', 'action', 'ref'], unique=True,
                    postgresql_where=sa.text("status = 'pending'"))

    op.create_table(
        'cleanup_write_grants',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        _sid(),
        sa.Column('item_id', sa.BigInteger(), sa.ForeignKey('cleanup_items.id', ondelete='CASCADE'), nullable=False),
        _ts('granted_at', nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cleanup_write_grants_session_granted', 'cleanup_write_grants', ['session_id', 'granted_at'])


def downgrade() -> None:
    op.drop_table('cleanup_write_grants')
    op.drop_table('cleanup_items')
    op.drop_table('cleanup_batches')
    op.drop_table('saved_targets')
    op.drop_table('saved_collections')
    op.drop_table('cleanup_scans')
    op.drop_column('action_log', 'target_label')
    op.drop_column('action_log', 'target_ref')
    # ig_user_id nullable KALIR (ADR-0001 b)
    op.drop_column('sessions', 'cleanup_paused_reason')
    op.drop_column('sessions', 'cleanup_paused_until')
    op.drop_column('sessions', 'unsave_enabled_at')
    op.drop_column('sessions', 'allow_unsave')
