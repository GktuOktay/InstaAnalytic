"""bridge_actions: eklentinin yaptığı takip / takipten çıkma kuyruğu

Revision ID: j0f2b4c6e8a0
Revises: i9e1a3b5d7f9
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'j0f2b4c6e8a0'
down_revision: Union[str, None] = 'i9e1a3b5d7f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bridge_actions',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ig_user_id', sa.BigInteger(), sa.ForeignKey('ig_users.id'), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('action', sa.String(10), nullable=False),
        sa.Column('status', sa.String(10), nullable=False, server_default='pending'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_bridge_actions_session_status', 'bridge_actions', ['session_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_bridge_actions_session_status', table_name='bridge_actions')
    op.drop_table('bridge_actions')
