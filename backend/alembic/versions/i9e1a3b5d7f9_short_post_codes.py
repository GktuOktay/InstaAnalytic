"""Instagram kısa kodu: 11 karakterden uzun kodları kısalt

Instagram artık gönderi `code` alanına 28 karakterlik bir son ek ekliyor. Gerçek kısa kod ilk 11
karakter (gönderi kimliğinin taban-64 hâli). Uzun kodla /p/<kod>/ açılınca beğenenler gönderiye bağlanamıyordu.

Revision ID: i9e1a3b5d7f9
Revises: h8d0f2a4c6e8
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'i9e1a3b5d7f9'
down_revision: Union[str, None] = 'h8d0f2a4c6e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE posts SET shortcode = left(shortcode, 11) WHERE length(shortcode) > 11")


def downgrade() -> None:
    pass
