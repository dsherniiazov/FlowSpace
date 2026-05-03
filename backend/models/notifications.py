from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from backend.db import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_sender_user_id", "sender_user_id"),
        Index("ix_notifications_system_id", "system_id"),
        Index("ix_notifications_read_at", "read_at"),
        Index("ix_notifications_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    recipient_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    system_id = Column(
        Integer, ForeignKey("system_models.id", ondelete="SET NULL"), nullable=True
    )
    system_title = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="review")
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)
