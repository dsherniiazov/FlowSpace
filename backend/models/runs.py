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
from sqlalchemy.sql import func

from backend.db import Base


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        Index("ix_simulation_runs_user_created_at", "user_id", sa.desc("created_at")),
        Index("ix_simulation_runs_user_id", "user_id"),
        Index("ix_simulation_runs_model_id", "model_id"),
        Index("ix_simulation_runs_status", "status"),
        Index("ix_simulation_runs_created_at", "created_at"),
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

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
