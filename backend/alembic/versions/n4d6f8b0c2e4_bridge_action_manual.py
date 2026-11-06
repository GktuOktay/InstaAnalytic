"""bridge_actions.manual: kullanıcının tek tek tıkladığı işlemler insan hızında yapılır

Revision ID: n4d6f8b0c2e4
Revises: m3c5e7a9b1d3
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'n4d6f8b0c2e4'
down_revision: Union[str, None] = 'm3c5e7a9b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bridge_actions', sa.Column('manual', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('bridge_actions', 'manual')
