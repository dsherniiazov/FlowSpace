"""make lesson.section_id nullable and set null on section delete

Revision ID: 9e1d2a4f6b77
Revises: 3c9a1f4b8d21
Create Date: 2026-02-24 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9e1d2a4f6b77"
down_revision: Union[str, Sequence[str], None] = "3c9a1f4b8d21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("fk_lessons_section_id_sections", "lessons", type_="foreignkey")
    op.alter_column("lessons", "section_id", existing_type=sa.Integer(), nullable=True)
    op.create_foreign_key(
        "fk_lessons_section_id_sections",
        "lessons",
        "sections",
        ["section_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    conn = op.get_bind()
    default_section_id = conn.execute(sa.text("SELECT id FROM sections ORDER BY id LIMIT 1")).scalar()
    if default_section_id is None:
        conn.execute(sa.text("INSERT INTO sections (title, order_index, is_published) VALUES ('Core lessons', 1, true)"))
        default_section_id = conn.execute(sa.text("SELECT id FROM sections ORDER BY id LIMIT 1")).scalar()
    conn.execute(sa.text("UPDATE lessons SET section_id = :sid WHERE section_id IS NULL"), {"sid": default_section_id})

    op.drop_constraint("fk_lessons_section_id_sections", "lessons", type_="foreignkey")
    op.alter_column("lessons", "section_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        "fk_lessons_section_id_sections",
        "lessons",
        "sections",
        ["section_id"],
        ["id"],
        ondelete="RESTRICT",
    )
