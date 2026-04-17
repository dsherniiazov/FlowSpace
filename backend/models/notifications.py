from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from backend.db import Base


class Notification(Base):
    """A message delivered to a user's inbox.

    Currently used for teacher → student "mark as reviewed" feedback, but the
    schema is intentionally generic so we can reuse it for other in-app
    messages later.
    """

    __tablename__ = "notifications"

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
        default=lambda: datetime.now(timezone.utc),
    )
    read_at = Column(DateTime(timezone=True), nullable=True)
