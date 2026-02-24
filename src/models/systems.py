from src.db import Base
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Boolean,
    DateTime,
)
from sqlalchemy.dialects.postgresql import JSONB


class SystemModel(Base):
    __tablename__ = "system_models"

    id = Column(Integer, primary_key=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)

    title = Column(String, nullable=False)
    graph_json = Column(JSONB, nullable=False)

    is_public = Column(Boolean, default=False)
    is_template = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
