"""ZIP profillerinde işlemler varsayılan açık (eklenti kuyruğu yapar)

Revision ID: l2b4d6f8a0c2
Revises: k1a3c5e7f9b1
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'l2b4d6f8a0c2'
down_revision: Union[str, None] = 'k1a3c5e7f9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Isınma süresi (ilk günlerde daha düşük günlük sınır) açıldığı andan başlar
    op.execute("UPDATE sessions SET allow_actions = true, actions_enabled_at = COALESCE(actions_enabled_at, now()) "
               "WHERE source = 'zip' AND allow_actions = false")


def downgrade() -> None:
    pass
