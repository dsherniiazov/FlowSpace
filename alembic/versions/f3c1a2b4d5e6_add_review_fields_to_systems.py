"""add review fields to systems

Revision ID: f3c1a2b4d5e6
Revises: d41b7c8e9f10
Create Date: 2026-03-17 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3c1a2b4d5e6"
down_revision: Union[str, Sequence[str], None] = "d41b7c8e9f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "system_models",
        sa.Column("is_submitted_for_review", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "system_models",
        sa.Column("has_unseen_changes", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("system_models", "has_unseen_changes")
    op.drop_column("system_models", "is_submitted_for_review")
