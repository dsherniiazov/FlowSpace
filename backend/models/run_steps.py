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
from sqlalchemy.sql import func

from backend.db import Base


class SimulationRunStep(Base):
    __tablename__ = "simulation_run_steps"
    __table_args__ = (
        UniqueConstraint("run_id", "step_index", name="uq_simulation_run_steps_run_step"),
        Index("ix_simulation_run_steps_run_step", "run_id", "step_index"),
        Index("ix_simulation_run_steps_run_id", "run_id"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(Integer, ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False)
    step_index = Column(Integer, nullable=False)
    time = Column(Float, nullable=False)
    values = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
