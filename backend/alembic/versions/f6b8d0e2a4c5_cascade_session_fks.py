"""sessions'a bağlı tüm tablolarda ON DELETE CASCADE

Modeller CASCADE tanımlıyordu ama ilk şemada dört tablo NO ACTION kalmıştı. Sonuç: bir profile ait
sync_jobs / posts / interactions / action_log kaydı varsa "Tüm verimi sil" 500 hatası veriyordu.

Revision ID: f6b8d0e2a4c5
Revises: e5a7c9d1f3b4
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f6b8d0e2a4c5'
down_revision: Union[str, None] = 'e5a7c9d1f3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (tablo, kısıt adı)
_FKS = [
    ("action_log",   "action_log_session_id_fkey"),
    ("posts",        "posts_session_id_fkey"),
    ("sync_jobs",    "sync_jobs_session_id_fkey"),
    ("interactions", "interactions_session_id_fkey"),
]


def upgrade() -> None:
    for table, name in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "sessions", ["session_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    for table, name in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "sessions", ["session_id"], ["id"])
