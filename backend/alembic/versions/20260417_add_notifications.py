"""add notifications table for student inbox

Revision ID: 20260417_notifications
Revises: 20260401_reset_tokens
Create Date: 2026-04-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260417_notifications"
down_revision: Union[str, Sequence[str], None] = "20260401_reset_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "notifications" in inspector.get_table_names():
        return

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "recipient_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "system_id",
            sa.Integer(),
            sa.ForeignKey("system_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("system_title", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False, server_default="review"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_notifications_recipient_user_id",
        "notifications",
        ["recipient_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_user_id", table_name="notifications")
    op.drop_table("notifications")
