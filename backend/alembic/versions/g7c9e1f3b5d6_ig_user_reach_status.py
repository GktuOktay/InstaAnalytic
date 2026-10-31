"""ig_users: hayalet hesap durumu

Revision ID: g7c9e1f3b5d6
Revises: f6b8d0e2a4c5
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g7c9e1f3b5d6'
down_revision: Union[str, None] = 'f6b8d0e2a4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ig_users', sa.Column('reach_status', sa.String(16), nullable=True))
    op.add_column('ig_users', sa.Column('reach_checked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ig_users', sa.Column('reach_source', sa.String(8), nullable=True))
    op.create_index('ix_ig_users_reach_status', 'ig_users', ['reach_status'])


def downgrade() -> None:
    op.drop_index('ix_ig_users_reach_status', table_name='ig_users')
    op.drop_column('ig_users', 'reach_source')
    op.drop_column('ig_users', 'reach_checked_at')
    op.drop_column('ig_users', 'reach_status')
