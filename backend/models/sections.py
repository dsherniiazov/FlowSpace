from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.db import Base


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (
        Index("ix_sections_order_index", "order_index"),
        Index("ix_sections_is_published", "is_published"),
    )

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False, unique=True)
    color = Column(String, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_published = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    lessons = relationship("Lesson", back_populates="section")
