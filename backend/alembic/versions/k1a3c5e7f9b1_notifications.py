"""notifications: uygulama içi bildirimler

Revision ID: k1a3c5e7f9b1
Revises: j0f2b4c6e8a0
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'k1a3c5e7f9b1'
down_revision: Union[str, None] = 'j0f2b4c6e8a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True),
        sa.Column('kind', sa.String(40), nullable=False),
        sa.Column('level', sa.String(10), nullable=False, server_default='info'),
        sa.Column('params', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('link', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_notifications_session_id', 'notifications', ['session_id'])
    op.create_index('ix_notifications_read_created', 'notifications', ['read_at', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_notifications_read_created', table_name='notifications')
    op.drop_index('ix_notifications_session_id', table_name='notifications')
    op.drop_table('notifications')
