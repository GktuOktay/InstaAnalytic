"""actions_enabled_at + safe default

Revision ID: e5a7c9d1f3b4
Revises: d4f6b8c0e2a3
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5a7c9d1f3b4'
down_revision: Union[str, None] = 'd4f6b8c0e2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('actions_enabled_at', sa.DateTime(timezone=True), nullable=True))
    op.alter_column('sessions', 'risk_profile', server_default='safe')


def downgrade() -> None:
    op.alter_column('sessions', 'risk_profile', server_default='balanced')
    op.drop_column('sessions', 'actions_enabled_at')
