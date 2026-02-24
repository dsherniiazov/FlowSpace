from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    String,
    Text,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
import sqlalchemy as sa

from src.db import Base


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        Index("ix_simulation_runs_user_created_at", "user_id", sa.desc("created_at")),
        Index("ix_simulation_runs_model_id", "model_id"),
    )

    id = Column(Integer, primary_key=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_id = Column(Integer, ForeignKey("system_models.id", ondelete="SET NULL"), nullable=True)
    model_snapshot = Column(JSONB, nullable=False)

    dt = Column(Float, nullable=False)
    steps = Column(Integer, nullable=False)

    engine_version = Column(String, nullable=False, default="euler_v1")
    seed = Column(Integer)
    status = Column(String, nullable=False, default="running")
    duration_ms = Column(Integer)
    error_message = Column(Text)

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
