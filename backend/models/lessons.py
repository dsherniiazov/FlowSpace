from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.db import Base


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_section_id", "section_id"),
        Index("ix_lessons_order_index", "order_index"),
        Index("ix_lessons_is_published", "is_published"),
    )

    id = Column(Integer, primary_key=True)

    title = Column(String, nullable=False)
    content_markdown = Column(Text, nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)

    order_index = Column(Integer)
    is_published = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    section = relationship("Section", back_populates="lessons")
