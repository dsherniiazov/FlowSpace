"""add lesson tasks and task progress

Revision ID: f2a1c9d4e8b7
Revises: e4b7b6c2a1f9
Create Date: 2026-02-22 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a1c9d4e8b7"
down_revision: Union[str, Sequence[str], None] = "e4b7b6c2a1f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lesson_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("system_id", sa.Integer(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["system_id"], ["system_models.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_lesson_tasks_lesson_id", "lesson_tasks", ["lesson_id"])

    op.create_table(
        "user_task_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["lesson_tasks.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "task_id", name="uq_user_task_progress_user_task"),
    )
    op.create_index("ix_user_task_progress_user_id", "user_task_progress", ["user_id"])
    op.create_index("ix_user_task_progress_task_id", "user_task_progress", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_user_task_progress_task_id", table_name="user_task_progress")
    op.drop_index("ix_user_task_progress_user_id", table_name="user_task_progress")
    op.drop_table("user_task_progress")

    op.drop_index("ix_lesson_tasks_lesson_id", table_name="lesson_tasks")
    op.drop_table("lesson_tasks")
