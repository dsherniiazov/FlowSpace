from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Float,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB

from src.db import Base


class SimulationRunStep(Base):
    __tablename__ = "simulation_run_steps"
    __table_args__ = (
        UniqueConstraint("run_id", "step_index", name="uq_simulation_run_steps_run_step"),
        Index("ix_simulation_run_steps_run_step", "run_id", "step_index"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(Integer, ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    step_index = Column(Integer, nullable=False)
    time = Column(Float, nullable=False)
    values = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
