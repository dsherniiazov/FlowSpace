from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from backend.db import Base


class LessonTask(Base):
    __tablename__ = "lesson_tasks"
    __table_args__ = (
        Index("ix_lesson_tasks_order_index", "order_index"),
    )

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    system_id = Column(Integer, ForeignKey("system_models.id", ondelete="RESTRICT"), nullable=False, unique=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
