from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260401_reset_tokens"
down_revision: Union[str, Sequence[str], None] = "20260318_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col["name"] for col in inspector.get_columns("users")]
    if "reset_token" not in existing_columns:
        op.add_column("users", sa.Column("reset_token", sa.String(), nullable=True))
    if "reset_token_expires" not in existing_columns:
        op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
