"""add sections and link lessons

Revision ID: e4b7b6c2a1f9
Revises: c1f0b6a4d2ef
Create Date: 2026-02-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4b7b6c2a1f9"
down_revision: Union[str, Sequence[str], None] = "c1f0b6a4d2ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.UniqueConstraint("title", name="uq_sections_title"),
    )

    op.add_column("lessons", sa.Column("section_id", sa.Integer(), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO sections (title, order_index, is_published)
            VALUES ('Core lessons', 1, true)
            """
        )
    )
    section_id = conn.execute(sa.text("SELECT id FROM sections WHERE title = 'Core lessons' LIMIT 1")).scalar()
    conn.execute(sa.text("UPDATE lessons SET section_id = :section_id WHERE section_id IS NULL"), {"section_id": section_id})

    op.alter_column("lessons", "section_id", nullable=False)
    op.create_foreign_key(
        "fk_lessons_section_id_sections",
        "lessons",
        "sections",
        ["section_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_lessons_section_id_sections", "lessons", type_="foreignkey")
    op.drop_column("lessons", "section_id")
    op.drop_table("sections")
