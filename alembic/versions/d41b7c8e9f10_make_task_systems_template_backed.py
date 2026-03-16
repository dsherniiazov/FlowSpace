"""make task systems template backed

Revision ID: d41b7c8e9f10
Revises: b8c4f7d1e2a3
Create Date: 2026-03-15 00:00:00.000000

"""
from __future__ import annotations

import json
from collections import Counter
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d41b7c8e9f10"
down_revision: Union[str, Sequence[str], None] = "b8c4f7d1e2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("system_models", sa.Column("source_system_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_system_models_source_system_id_system_models",
        "system_models",
        "system_models",
        ["source_system_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_system_models_owner_source", "system_models", ["owner_id", "source_system_id"])

    conn = op.get_bind()
    task_rows = conn.execute(
        sa.text(
            """
            SELECT
                lt.id,
                lt.lesson_id,
                lt.title,
                lt.system_id,
                sm.owner_id AS system_owner_id,
                sm.title AS system_title,
                sm.graph_json AS system_graph_json,
                sm.is_template AS system_is_template
            FROM lesson_tasks AS lt
            LEFT JOIN system_models AS sm ON sm.id = lt.system_id
            ORDER BY lt.id
            """
        )
    ).mappings().all()

    system_counts = Counter(
        int(row["system_id"])
        for row in task_rows
        if row["system_id"] is not None
    )

    for row in task_rows:
        current_system_id = row["system_id"]
        needs_dedicated_template = (
            current_system_id is None
            or system_counts[int(current_system_id)] > 1
            or row["system_owner_id"] is not None
            or not bool(row["system_is_template"])
        )

        if needs_dedicated_template:
            raw_graph = row["system_graph_json"]
            graph_json = raw_graph if isinstance(raw_graph, dict) else {"nodes": [], "edges": []}
            title = " ".join(str(row["title"] or "Task system").split()) or "Task system"
            new_system_id = conn.execute(
                sa.text(
                    """
                    INSERT INTO system_models (
                        owner_id,
                        lesson_id,
                        source_system_id,
                        title,
                        graph_json,
                        is_public,
                        is_template,
                        created_at
                    )
                    VALUES (
                        NULL,
                        :lesson_id,
                        NULL,
                        :title,
                        CAST(:graph_json AS jsonb),
                        false,
                        true,
                        now()
                    )
                    RETURNING id
                    """
                ),
                {
                    "lesson_id": row["lesson_id"],
                    "title": title,
                    "graph_json": json.dumps(graph_json),
                },
            ).scalar_one()
            conn.execute(
                sa.text("UPDATE lesson_tasks SET system_id = :system_id WHERE id = :task_id"),
                {"system_id": new_system_id, "task_id": row["id"]},
            )
            continue

        conn.execute(
            sa.text(
                """
                UPDATE system_models
                SET owner_id = NULL,
                    lesson_id = :lesson_id,
                    is_public = false,
                    is_template = true
                WHERE id = :system_id
                """
            ),
            {"lesson_id": row["lesson_id"], "system_id": current_system_id},
        )

    op.execute("ALTER TABLE lesson_tasks DROP CONSTRAINT IF EXISTS lesson_tasks_system_id_fkey")
    op.alter_column("lesson_tasks", "system_id", nullable=False)
    op.create_unique_constraint("uq_lesson_tasks_system_id", "lesson_tasks", ["system_id"])
    op.create_foreign_key(
        "fk_lesson_tasks_system_id_system_models",
        "lesson_tasks",
        "system_models",
        ["system_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE lesson_tasks DROP CONSTRAINT IF EXISTS fk_lesson_tasks_system_id_system_models")
    op.drop_constraint("uq_lesson_tasks_system_id", "lesson_tasks", type_="unique")
    op.alter_column("lesson_tasks", "system_id", nullable=True)
    op.create_foreign_key(
        "lesson_tasks_system_id_fkey",
        "lesson_tasks",
        "system_models",
        ["system_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint("uq_system_models_owner_source", "system_models", type_="unique")
    op.drop_constraint("fk_system_models_source_system_id_system_models", "system_models", type_="foreignkey")
    op.drop_column("system_models", "source_system_id")
