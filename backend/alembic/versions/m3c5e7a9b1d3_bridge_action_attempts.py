"""bridge_actions.attempts: başarısız işlemler 3 kez denenir

Revision ID: m3c5e7a9b1d3
Revises: l2b4d6f8a0c2
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'm3c5e7a9b1d3'
down_revision: Union[str, None] = 'l2b4d6f8a0c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bridge_actions', sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('bridge_actions', 'attempts')
