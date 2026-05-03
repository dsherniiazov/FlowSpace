from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from backend.db import Base


class ModelReview(Base):
    __tablename__ = "model_reviews"
    __table_args__ = (
        CheckConstraint(
            "status IN ('submitted', 'in_review', 'reviewed', 'changes_requested')",
            name="ck_model_reviews_status",
        ),
        Index("ix_model_reviews_system_id", "system_id"),
        Index("ix_model_reviews_student_id", "student_id"),
        Index("ix_model_reviews_teacher_id", "teacher_id"),
        Index("ix_model_reviews_status", "status"),
        Index("ix_model_reviews_submitted_at", "submitted_at"),
    )

    id = Column(Integer, primary_key=True)
    system_id = Column(Integer, ForeignKey("system_models.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, nullable=False, default="submitted", server_default="submitted")
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
