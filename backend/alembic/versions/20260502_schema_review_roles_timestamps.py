from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260502_schema_review_roles"
down_revision: Union[str, Sequence[str], None] = "20260425_app_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _tables() -> set[str]:
    return set(_inspector().get_table_names())


def _columns(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_exists(table_name: str, index_name: str) -> bool:
    if table_name not in _tables():
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _check_exists(table_name: str, check_name: str) -> bool:
    if table_name not in _tables():
        return False
    return any(check["name"] == check_name for check in _inspector().get_check_constraints(table_name))


def _fk_exists(table_name: str, fk_name: str) -> bool:
    if table_name not in _tables():
        return False
    return any(fk["name"] == fk_name for fk in _inspector().get_foreign_keys(table_name))


def _fk_for_columns_exists(table_name: str, columns: list[str], referred_table: str) -> bool:
    if table_name not in _tables():
        return False
    for fk in _inspector().get_foreign_keys(table_name):
        if fk.get("constrained_columns") == columns and fk.get("referred_table") == referred_table:
            return True
    return False


def _add_timestamp(table_name: str, column_name: str) -> None:
    existing_columns = _columns(table_name)
    if column_name not in existing_columns:
        op.add_column(
            table_name,
            sa.Column(
                column_name,
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
        )
        return

    op.execute(sa.text(f"UPDATE {table_name} SET {column_name} = now() WHERE {column_name} IS NULL"))
    op.alter_column(
        table_name,
        column_name,
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


def _create_index(table_name: str, index_name: str, columns: list[str], unique: bool = False) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    timestamp_tables = [
        "users",
        "sections",
        "lessons",
        "lesson_tasks",
        "system_models",
        "user_progress",
        "user_task_progress",
        "simulation_runs",
        "simulation_run_steps",
        "notifications",
        "app_settings",
    ]
    for table_name in timestamp_tables:
        if table_name in _tables():
            _add_timestamp(table_name, "created_at")
            _add_timestamp(table_name, "updated_at")

    if "users" in _tables():
        if "role" not in _columns("users"):
            op.add_column(
                "users",
                sa.Column("role", sa.String(), nullable=False, server_default="student"),
            )
        op.execute(
            sa.text(
                "UPDATE users "
                "SET role = CASE WHEN is_admin IS TRUE THEN 'teacher' ELSE 'student' END "
                "WHERE role IS NULL OR role NOT IN ('student', 'teacher', 'admin')"
            )
        )
        if not _check_exists("users", "ck_users_role"):
            op.create_check_constraint(
                "ck_users_role",
                "users",
                "role IN ('student', 'teacher', 'admin')",
            )

    if "system_models" in _tables():
        system_columns = _columns("system_models")
        if "review_status" not in system_columns:
            op.add_column(
                "system_models",
                sa.Column("review_status", sa.String(), nullable=False, server_default="draft"),
            )
        if "submitted_at" not in system_columns:
            op.add_column("system_models", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
        if "reviewed_at" not in system_columns:
            op.add_column("system_models", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        if "reviewed_by_user_id" not in system_columns:
            op.add_column("system_models", sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))

        op.execute(
            sa.text(
                "UPDATE system_models "
                "SET review_status = CASE "
                "WHEN is_submitted_for_review IS TRUE THEN 'submitted' "
                "ELSE COALESCE(review_status, 'draft') END "
                "WHERE review_status IS NULL OR review_status NOT IN "
                "('draft', 'submitted', 'reviewed', 'changes_requested')"
            )
        )
        op.execute(
            sa.text(
                "UPDATE system_models "
                "SET submitted_at = COALESCE(created_at, now()) "
                "WHERE is_submitted_for_review IS TRUE AND submitted_at IS NULL"
            )
        )
        if not _check_exists("system_models", "ck_system_models_review_status"):
            op.create_check_constraint(
                "ck_system_models_review_status",
                "system_models",
                "review_status IN ('draft', 'submitted', 'reviewed', 'changes_requested')",
            )
        if not _fk_for_columns_exists("system_models", ["reviewed_by_user_id"], "users"):
            op.create_foreign_key(
                "fk_system_models_reviewed_by_user_id_users",
                "system_models",
                "users",
                ["reviewed_by_user_id"],
                ["id"],
                ondelete="SET NULL",
            )

    if "model_reviews" not in _tables():
        op.create_table(
            "model_reviews",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "system_id",
                sa.Integer(),
                sa.ForeignKey("system_models.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "student_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "teacher_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("status", sa.String(), nullable=False, server_default="submitted"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint(
                "status IN ('submitted', 'in_review', 'reviewed', 'changes_requested')",
                name="ck_model_reviews_status",
            ),
        )

    if "system_models" in _tables() and "model_reviews" in _tables():
        if "latest_review_id" not in _columns("system_models"):
            op.add_column("system_models", sa.Column("latest_review_id", sa.Integer(), nullable=True))
        if not _fk_for_columns_exists("system_models", ["latest_review_id"], "model_reviews"):
            op.create_foreign_key(
                "fk_system_models_latest_review_id_model_reviews",
                "system_models",
                "model_reviews",
                ["latest_review_id"],
                ["id"],
                ondelete="SET NULL",
            )

        op.execute(
            sa.text(
                "INSERT INTO model_reviews (system_id, student_id, status, created_at, updated_at, submitted_at) "
                "SELECT id, owner_id, 'submitted', COALESCE(submitted_at, created_at, now()), "
                "now(), COALESCE(submitted_at, created_at, now()) "
                "FROM system_models "
                "WHERE is_submitted_for_review IS TRUE "
                "AND owner_id IS NOT NULL "
                "AND latest_review_id IS NULL "
                "AND NOT EXISTS ("
                "SELECT 1 FROM model_reviews WHERE model_reviews.system_id = system_models.id"
                ")"
            )
        )
        op.execute(
            sa.text(
                "UPDATE system_models "
                "SET latest_review_id = latest.id "
                "FROM ("
                "SELECT DISTINCT ON (system_id) id, system_id "
                "FROM model_reviews "
                "ORDER BY system_id, submitted_at DESC, id DESC"
                ") AS latest "
                "WHERE system_models.id = latest.system_id "
                "AND system_models.latest_review_id IS NULL"
            )
        )

    index_specs = [
        ("sections", "ix_sections_order_index", ["order_index"]),
        ("sections", "ix_sections_is_published", ["is_published"]),
        ("lessons", "ix_lessons_section_id", ["section_id"]),
        ("lessons", "ix_lessons_order_index", ["order_index"]),
        ("lessons", "ix_lessons_is_published", ["is_published"]),
        ("lesson_tasks", "ix_lesson_tasks_order_index", ["order_index"]),
        ("system_models", "ix_system_models_owner_id", ["owner_id"]),
        ("system_models", "ix_system_models_lesson_id", ["lesson_id"]),
        ("system_models", "ix_system_models_source_system_id", ["source_system_id"]),
        ("system_models", "ix_system_models_is_public", ["is_public"]),
        ("system_models", "ix_system_models_is_template", ["is_template"]),
        ("system_models", "ix_system_models_is_submitted_for_review", ["is_submitted_for_review"]),
        ("system_models", "ix_system_models_review_status", ["review_status"]),
        ("user_progress", "ix_user_progress_user_id", ["user_id"]),
        ("user_progress", "ix_user_progress_lesson_id", ["lesson_id"]),
        ("simulation_runs", "ix_simulation_runs_user_id", ["user_id"]),
        ("simulation_runs", "ix_simulation_runs_status", ["status"]),
        ("simulation_runs", "ix_simulation_runs_created_at", ["created_at"]),
        ("simulation_run_steps", "ix_simulation_run_steps_run_id", ["run_id"]),
        ("notifications", "ix_notifications_sender_user_id", ["sender_user_id"]),
        ("notifications", "ix_notifications_system_id", ["system_id"]),
        ("notifications", "ix_notifications_read_at", ["read_at"]),
        ("notifications", "ix_notifications_created_at", ["created_at"]),
        ("model_reviews", "ix_model_reviews_system_id", ["system_id"]),
        ("model_reviews", "ix_model_reviews_student_id", ["student_id"]),
        ("model_reviews", "ix_model_reviews_teacher_id", ["teacher_id"]),
        ("model_reviews", "ix_model_reviews_status", ["status"]),
        ("model_reviews", "ix_model_reviews_submitted_at", ["submitted_at"]),
    ]
    for table_name, index_name, columns in index_specs:
        if table_name in _tables():
            _create_index(table_name, index_name, columns)


def downgrade() -> None:
    index_names = [
        ("model_reviews", "ix_model_reviews_submitted_at"),
        ("model_reviews", "ix_model_reviews_status"),
        ("model_reviews", "ix_model_reviews_teacher_id"),
        ("model_reviews", "ix_model_reviews_student_id"),
        ("model_reviews", "ix_model_reviews_system_id"),
        ("notifications", "ix_notifications_created_at"),
        ("notifications", "ix_notifications_read_at"),
        ("notifications", "ix_notifications_system_id"),
        ("notifications", "ix_notifications_sender_user_id"),
        ("simulation_run_steps", "ix_simulation_run_steps_run_id"),
        ("simulation_runs", "ix_simulation_runs_created_at"),
        ("simulation_runs", "ix_simulation_runs_status"),
        ("simulation_runs", "ix_simulation_runs_user_id"),
        ("user_progress", "ix_user_progress_lesson_id"),
        ("user_progress", "ix_user_progress_user_id"),
        ("system_models", "ix_system_models_review_status"),
        ("system_models", "ix_system_models_is_submitted_for_review"),
        ("system_models", "ix_system_models_is_template"),
        ("system_models", "ix_system_models_is_public"),
        ("system_models", "ix_system_models_source_system_id"),
        ("system_models", "ix_system_models_lesson_id"),
        ("system_models", "ix_system_models_owner_id"),
        ("lesson_tasks", "ix_lesson_tasks_order_index"),
        ("lessons", "ix_lessons_is_published"),
        ("lessons", "ix_lessons_order_index"),
        ("lessons", "ix_lessons_section_id"),
        ("sections", "ix_sections_is_published"),
        ("sections", "ix_sections_order_index"),
    ]
    for table_name, index_name in index_names:
        if _index_exists(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)

    if "system_models" in _tables():
        if _fk_exists("system_models", "fk_system_models_latest_review_id_model_reviews"):
            op.drop_constraint("fk_system_models_latest_review_id_model_reviews", "system_models", type_="foreignkey")
        if "latest_review_id" in _columns("system_models"):
            op.drop_column("system_models", "latest_review_id")
        if _fk_exists("system_models", "fk_system_models_reviewed_by_user_id_users"):
            op.drop_constraint("fk_system_models_reviewed_by_user_id_users", "system_models", type_="foreignkey")
        if _check_exists("system_models", "ck_system_models_review_status"):
            op.drop_constraint("ck_system_models_review_status", "system_models", type_="check")
        for column_name in ["reviewed_by_user_id", "reviewed_at", "submitted_at", "review_status"]:
            if column_name in _columns("system_models"):
                op.drop_column("system_models", column_name)

    if "model_reviews" in _tables():
        op.drop_table("model_reviews")

    if "users" in _tables():
        if _check_exists("users", "ck_users_role"):
            op.drop_constraint("ck_users_role", "users", type_="check")
        if "role" in _columns("users"):
            op.drop_column("users", "role")

    for table_name in [
        "users",
        "sections",
        "lessons",
        "lesson_tasks",
        "system_models",
        "user_progress",
        "user_task_progress",
        "simulation_runs",
        "simulation_run_steps",
        "notifications",
        "app_settings",
    ]:
        for column_name in ["updated_at"]:
            if table_name in _tables() and column_name in _columns(table_name):
                op.drop_column(table_name, column_name)

    for table_name in ["users", "user_progress", "user_task_progress", "app_settings"]:
        if table_name in _tables() and "created_at" in _columns(table_name):
            op.drop_column(table_name, "created_at")
