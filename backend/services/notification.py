from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.notifications import Notification
from backend.models.users import User
from backend.schemas.notifications import NotificationOut
from backend.utils.db import commit, commit_and_refresh
from backend.utils.errors import AccessDeniedError, NotFoundError


class NotificationService:
    @staticmethod
    def get_notification_or_raise(db: Session, notification_id: int) -> Notification:
        row = db.query(Notification).filter(Notification.id == notification_id).first()
        if not row:
            raise NotFoundError("Notification not found")
        return row

    @staticmethod
    def assert_recipient(notification: Notification, user_id: int) -> None:
        if notification.recipient_user_id != user_id:
            raise AccessDeniedError("Not your notification")

    @staticmethod
    def to_notification_out(db: Session, row: Notification) -> NotificationOut:
        sender_name = None
        if row.sender_user_id:
            sender = db.query(User).filter(User.id == row.sender_user_id).first()
            if sender:
                sender_name = f"{sender.name} {sender.last_name}".strip() or sender.email
        out = NotificationOut.model_validate(row)
        out.sender_name = sender_name
        return out

    @staticmethod
    def list_for_user(db: Session, user_id: int) -> list[NotificationOut]:
        rows = (
            db.query(Notification)
            .filter(Notification.recipient_user_id == user_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .all()
        )
        return [NotificationService.to_notification_out(db, row) for row in rows]

    @staticmethod
    def unread_count(db: Session, user_id: int) -> int:
        return (
            db.query(Notification)
            .filter(
                Notification.recipient_user_id == user_id,
                Notification.read_at.is_(None),
            )
            .count()
        )

    @staticmethod
    def mark_read(db: Session, notification_id: int, user_id: int) -> NotificationOut:
        row = NotificationService.get_notification_or_raise(db, notification_id)
        NotificationService.assert_recipient(row, user_id)
        if row.read_at is None:
            row.read_at = datetime.now(timezone.utc)
            commit_and_refresh(db, row)
        return NotificationService.to_notification_out(db, row)

    @staticmethod
    def delete(db: Session, notification_id: int, user_id: int) -> NotificationOut:
        row = NotificationService.get_notification_or_raise(db, notification_id)
        NotificationService.assert_recipient(row, user_id)
        payload = NotificationService.to_notification_out(db, row)
        db.delete(row)
        commit(db)
        return payload
