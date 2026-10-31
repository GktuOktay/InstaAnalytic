"""posts: tarayıcı köprüsü okuma zamanları

Revision ID: h8d0f2a4c6e8
Revises: g7c9e1f3b5d6
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h8d0f2a4c6e8'
down_revision: Union[str, None] = 'g7c9e1f3b5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('likers_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('posts', sa.Column('comments_synced_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'comments_synced_at')
    op.drop_column('posts', 'likers_synced_at')
