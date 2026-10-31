"""session_safety_flags

Revision ID: d4f6b8c0e2a3
Revises: c3e5a7b9d1f2
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4f6b8c0e2a3'
down_revision: Union[str, None] = 'c3e5a7b9d1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Takip/takipten çıkma gibi yazma işlemleri varsayılan KAPALI
    op.add_column('sessions', sa.Column('allow_actions', sa.Boolean(), nullable=False, server_default=sa.false()))
    # 'browser' = tarayıcı cookie'si ile bağlandı, 'zip' = yalnızca ZIP verisi (cookie yok, Instagram'a istek atılmaz)
    op.add_column('sessions', sa.Column('source', sa.String(length=10), nullable=False, server_default='browser'))
    # Instagram'dan challenge / action-blocked / 429 gelince işlemler bu zamana kadar durur
    op.add_column('sessions', sa.Column('paused_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sessions', sa.Column('paused_reason', sa.String(length=200), nullable=True))


def downgrade() -> None:
    for c in ('paused_reason', 'paused_until', 'source', 'allow_actions'):
        op.drop_column('sessions', c)
