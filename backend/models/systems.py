from backend.db import Base
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Boolean,
    DateTime,
    CheckConstraint,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func


class SystemModel(Base):
    __tablename__ = "system_models"
    __table_args__ = (
        UniqueConstraint("owner_id", "source_system_id", name="uq_system_models_owner_source"),
        CheckConstraint(
            "review_status IN ('draft', 'submitted', 'reviewed', 'changes_requested')",
            name="ck_system_models_review_status",
        ),
        Index("ix_system_models_owner_id", "owner_id"),
        Index("ix_system_models_lesson_id", "lesson_id"),
        Index("ix_system_models_source_system_id", "source_system_id"),
        Index("ix_system_models_is_public", "is_public"),
        Index("ix_system_models_is_template", "is_template"),
        Index("ix_system_models_is_submitted_for_review", "is_submitted_for_review"),
        Index("ix_system_models_review_status", "review_status"),
    )

    id = Column(Integer, primary_key=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    source_system_id = Column(Integer, ForeignKey("system_models.id", ondelete="CASCADE"), nullable=True)

    title = Column(String, nullable=False)
    graph_json = Column(JSONB, nullable=False)

    is_public = Column(Boolean, default=False)
    is_template = Column(Boolean, default=False)
    is_submitted_for_review = Column(Boolean, default=False, nullable=False)
    has_unseen_changes = Column(Boolean, default=False, nullable=False)
    review_status = Column(String, nullable=False, default="draft", server_default="draft")
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    latest_review_id = Column(Integer, ForeignKey("model_reviews.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
