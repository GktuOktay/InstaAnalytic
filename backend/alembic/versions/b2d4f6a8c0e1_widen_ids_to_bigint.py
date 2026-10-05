"""widen_ids_to_bigint

Instagram kullanıcı/gönderi ID'leri int32'yi aşar; modeller BigInteger ama ilk migration Integer üretmişti.
Zaten BIGINT olan veritabanlarında işlem etkisizdir.

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5f7b9d2
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b2d4f6a8c0e1'
down_revision: Union[str, None] = 'a1c3e5f7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("ig_users", "id"), ("posts", "id"),
    ("relationships", "ig_user_id"), ("interactions", "ig_user_id"), ("interactions", "post_id"),
    ("action_log", "ig_user_id"), ("sessions", "ig_user_id"),
    ("interactions", "id"), ("action_log", "id"),
]


def upgrade() -> None:
    for table, col in _COLUMNS:
        op.execute(f'ALTER TABLE {table} ALTER COLUMN {col} TYPE BIGINT')


def downgrade() -> None:
    pass  # daraltma veri kaybettirebilir; bilerek geri alınmıyor
