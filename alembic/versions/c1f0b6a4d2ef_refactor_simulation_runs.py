"""refactor simulation runs and steps

Revision ID: c1f0b6a4d2ef
Revises: aa2a7c1d9b3f
Create Date: 2026-02-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c1f0b6a4d2ef"
down_revision: Union[str, Sequence[str], None] = "aa2a7c1d9b3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "simulation_run_steps",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("time", sa.Float(), nullable=False),
        sa.Column("values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["run_id"], ["simulation_runs.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("run_id", "step_index", name="uq_simulation_run_steps_run_step"),
    )
    op.create_index(
        "ix_simulation_run_steps_run_step",
        "simulation_run_steps",
        ["run_id", "step_index"],
    )

    op.add_column(
        "simulation_runs",
        sa.Column("model_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("simulation_runs", sa.Column("engine_version", sa.String(), nullable=True))
    op.add_column("simulation_runs", sa.Column("seed", sa.Integer(), nullable=True))
    op.add_column("simulation_runs", sa.Column("status", sa.String(), nullable=True))
    op.add_column("simulation_runs", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("simulation_runs", sa.Column("error_message", sa.Text(), nullable=True))

    op.alter_column("simulation_runs", "model_id", existing_type=sa.Integer(), nullable=True)

    conn = op.get_bind()

    conn.execute(sa.text("UPDATE simulation_runs SET engine_version = 'euler_v1' WHERE engine_version IS NULL"))
    conn.execute(sa.text("UPDATE simulation_runs SET status = 'completed' WHERE status IS NULL"))

    conn.execute(
        sa.text(
            """
            UPDATE simulation_runs AS r
            SET model_snapshot = s.graph_json
            FROM system_models AS s
            WHERE r.model_id = s.id
            """
        )
    )
    conn.execute(sa.text("UPDATE simulation_runs SET model_snapshot = '{}'::jsonb WHERE model_snapshot IS NULL"))
    conn.execute(sa.text("UPDATE simulation_runs SET created_at = now() WHERE created_at IS NULL"))

    # Best-effort backfill of steps from legacy results JSONB
    rows = conn.execute(
        sa.text("SELECT id, dt, results FROM simulation_runs WHERE results IS NOT NULL")
    ).mappings()
    for row in rows:
        results = row.get("results")
        if not isinstance(results, dict):
            continue
        series = results.get("series")
        if not isinstance(series, dict) or not series:
            continue
        lengths = [len(values) for values in series.values() if isinstance(values, list)]
        if not lengths:
            continue
        steps_count = min(lengths)
        insert_rows = []
        for step_index in range(steps_count):
            values_at_step = {
                key: (values[step_index] if isinstance(values, list) and len(values) > step_index else None)
                for key, values in series.items()
            }
            insert_rows.append(
                {
                    "run_id": row["id"],
                    "step_index": step_index,
                    "time": row["dt"] * step_index,
                    "values": values_at_step,
                }
            )
        if insert_rows:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO simulation_run_steps (run_id, step_index, time, values, created_at)
                    VALUES (:run_id, :step_index, :time, :values, now())
                    """
                ),
                insert_rows,
            )

    op.alter_column(
        "simulation_runs",
        "model_snapshot",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
    )
    op.alter_column("simulation_runs", "engine_version", existing_type=sa.String(), nullable=False)
    op.alter_column("simulation_runs", "status", existing_type=sa.String(), nullable=False)
    op.alter_column("simulation_runs", "created_at", existing_type=sa.DateTime(timezone=True), nullable=False)

    op.drop_column("simulation_runs", "results")
    op.drop_column("simulation_runs", "parameters")

    op.execute("ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS simulation_runs_user_id_fkey")
    op.execute("ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS simulation_runs_model_id_fkey")
    op.create_foreign_key(
        "simulation_runs_user_id_fkey",
        "simulation_runs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "simulation_runs_model_id_fkey",
        "simulation_runs",
        "system_models",
        ["model_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_simulation_runs_model_id", "simulation_runs", ["model_id"])
    op.execute(
        "CREATE INDEX ix_simulation_runs_user_created_at "
        "ON simulation_runs (user_id, created_at DESC)"
    )

    op.execute("DROP TABLE IF EXISTS simulation_history")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_simulation_runs_user_created_at")
    op.drop_index("ix_simulation_runs_model_id", table_name="simulation_runs")

    op.execute("ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS simulation_runs_model_id_fkey")
    op.execute("ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS simulation_runs_user_id_fkey")
    op.create_foreign_key(
        "simulation_runs_user_id_fkey",
        "simulation_runs",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "simulation_runs_model_id_fkey",
        "simulation_runs",
        "system_models",
        ["model_id"],
        ["id"],
    )

    op.add_column("simulation_runs", sa.Column("parameters", postgresql.JSONB(astext_type=sa.Text())))
    op.add_column("simulation_runs", sa.Column("results", postgresql.JSONB(astext_type=sa.Text())))

    op.alter_column("simulation_runs", "created_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.alter_column("simulation_runs", "status", existing_type=sa.String(), nullable=True)
    op.alter_column("simulation_runs", "engine_version", existing_type=sa.String(), nullable=True)
    op.alter_column(
        "simulation_runs",
        "model_snapshot",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
    )
    op.alter_column("simulation_runs", "model_id", existing_type=sa.Integer(), nullable=False)

    op.drop_column("simulation_runs", "error_message")
    op.drop_column("simulation_runs", "duration_ms")
    op.drop_column("simulation_runs", "status")
    op.drop_column("simulation_runs", "seed")
    op.drop_column("simulation_runs", "engine_version")
    op.drop_column("simulation_runs", "model_snapshot")

    op.drop_index("ix_simulation_run_steps_run_step", table_name="simulation_run_steps")
    op.drop_table("simulation_run_steps")

    op.create_table(
        "simulation_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("model_id", sa.Integer(), nullable=True),
        sa.Column("input_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("results", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["model_id"], ["system_models.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
