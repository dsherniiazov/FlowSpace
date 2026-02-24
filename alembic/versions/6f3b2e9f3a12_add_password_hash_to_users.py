"""add password_hash to users

Revision ID: 6f3b2e9f3a12
Revises: 170303cd9031
Create Date: 2026-02-02 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "6f3b2e9f3a12"
down_revision: Union[str, Sequence[str], None] = "170303cd9031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=False, server_default=""))
    op.alter_column("users", "password_hash", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "password_hash")
