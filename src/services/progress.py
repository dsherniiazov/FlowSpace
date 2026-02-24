from sqlalchemy.orm import Session
from typing import Optional

from src.models.progress import UserProgress


class UserProgressService:

    @staticmethod
    def get(db: Session, user_id: int, lesson_id: int) -> Optional[UserProgress]:
        return (
            db.query(UserProgress)
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.lesson_id == lesson_id,
            )
            .first()
        )

    @staticmethod
    def mark_completed(db: Session, user_id: int, lesson_id: int) -> UserProgress:
        progress = UserProgressService.get(db, user_id, lesson_id)

        if not progress:
            progress = UserProgress(
                user_id=user_id,
                lesson_id=lesson_id,
            )
            db.add(progress)

        try:
            db.commit()
            db.refresh(progress)
        except Exception:
            db.rollback()
            raise
        return progress

    @staticmethod
    def list_completed_for_user(db: Session, user_id: int) -> list[UserProgress]:
        return db.query(UserProgress).filter(UserProgress.user_id == user_id).all()

    @staticmethod
    def completed_count(db: Session, user_id: int) -> int:
        return db.query(UserProgress).filter(UserProgress.user_id == user_id).count()

    @staticmethod
    def delete_completion(db: Session, user_id: int, lesson_id: int) -> Optional[UserProgress]:
        progress = UserProgressService.get(db, user_id, lesson_id)
        if not progress:
            return None
        db.delete(progress)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return progress
