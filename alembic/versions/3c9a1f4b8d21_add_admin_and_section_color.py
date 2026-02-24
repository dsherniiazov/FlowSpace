"""add admin flag to users and color to sections

Revision ID: 3c9a1f4b8d21
Revises: f2a1c9d4e8b7
Create Date: 2026-02-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3c9a1f4b8d21"
down_revision: Union[str, Sequence[str], None] = "f2a1c9d4e8b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("sections", sa.Column("color", sa.String(), nullable=True))

    conn = op.get_bind()
    conn.execute(sa.text("UPDATE users SET is_admin = true WHERE id = 1"))


def downgrade() -> None:
    op.drop_column("sections", "color")
    op.drop_column("users", "is_admin")
