"""import_snapshots

Revision ID: a1c3e5f7b9d2
Revises: 8ef28bafe420
Create Date: 2026-10-05 12:00:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1c3e5f7b9d2'
down_revision: Union[str, None] = '8ef28bafe420'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'import_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('followers_count', sa.Integer(), nullable=True),
        sa.Column('following_count', sa.Integer(), nullable=True),
        sa.Column('followers_gained', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('followers_lost', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('following_gained', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('following_lost', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_import_snapshots_session_id'), 'import_snapshots', ['session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_import_snapshots_session_id'), table_name='import_snapshots')
    op.drop_table('import_snapshots')
