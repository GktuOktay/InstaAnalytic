"""session_risk_profile

Revision ID: c3e5a7b9d1f2
Revises: b2d4f6a8c0e1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3e5a7b9d1f2'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('risk_profile', sa.String(length=20), nullable=False, server_default='balanced'))


def downgrade() -> None:
    op.drop_column('sessions', 'risk_profile')
