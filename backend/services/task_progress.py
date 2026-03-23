from datetime import datetime, timezone

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from backend.models.lesson_tasks import LessonTask
from backend.models.user_task_progress import UserTaskProgress


class TaskProgressService:
    @staticmethod
    def get(db: Session, user_id: int, task_id: int) -> UserTaskProgress | None:
        return (
            db.query(UserTaskProgress)
            .filter(and_(UserTaskProgress.user_id == user_id, UserTaskProgress.task_id == task_id))
            .first()
        )

    @staticmethod
    def complete_task(db: Session, user_id: int, task_id: int) -> UserTaskProgress:
        progress = TaskProgressService.get(db, user_id, task_id)
        if progress:
            return progress

        progress = UserTaskProgress(user_id=user_id, task_id=task_id, completed_at=datetime.now(timezone.utc))
        db.add(progress)
        try:
            db.commit()
            db.refresh(progress)
        except Exception:
            db.rollback()
            raise
        return progress

    @staticmethod
    def uncomplete_task(db: Session, user_id: int, task_id: int) -> UserTaskProgress | None:
        progress = TaskProgressService.get(db, user_id, task_id)
        if not progress:
            return None
        db.delete(progress)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return progress

    @staticmethod
    def list_completed_tasks_for_user(db: Session, user_id: int) -> list[UserTaskProgress]:
        return db.query(UserTaskProgress).filter(UserTaskProgress.user_id == user_id).all()

    @staticmethod
    def summary_for_user(db: Session, user_id: int) -> tuple[int, int]:
        total_tasks = db.query(func.count(LessonTask.id)).scalar() or 0
        completed_tasks = (
            db.query(func.count(UserTaskProgress.id))
            .join(LessonTask, LessonTask.id == UserTaskProgress.task_id)
            .filter(UserTaskProgress.user_id == user_id)
            .scalar()
            or 0
        )
        return int(total_tasks), int(completed_tasks)

    @staticmethod
    def completed_lesson_ids(db: Session, user_id: int) -> list[int]:
        subq = (
            db.query(
                LessonTask.lesson_id.label("lesson_id"),
                func.count(LessonTask.id).label("tasks_count"),
                func.count(UserTaskProgress.id).label("completed_count"),
            )
            .outerjoin(
                UserTaskProgress,
                and_(
                    UserTaskProgress.task_id == LessonTask.id,
                    UserTaskProgress.user_id == user_id,
                ),
            )
            .group_by(LessonTask.lesson_id)
            .subquery()
        )
        rows = (
            db.query(subq.c.lesson_id)
            .filter(subq.c.tasks_count > 0)
            .filter(subq.c.completed_count >= subq.c.tasks_count)
            .all()
        )
        return [int(row.lesson_id) for row in rows]

    @staticmethod
    def completed_lessons_with_timestamp(db: Session, user_id: int) -> list[tuple[int, datetime]]:
        subq = (
            db.query(
                LessonTask.lesson_id.label("lesson_id"),
                func.count(LessonTask.id).label("tasks_count"),
                func.count(UserTaskProgress.id).label("completed_count"),
                func.max(UserTaskProgress.completed_at).label("completed_at"),
            )
            .outerjoin(
                UserTaskProgress,
                and_(
                    UserTaskProgress.task_id == LessonTask.id,
                    UserTaskProgress.user_id == user_id,
                ),
            )
            .group_by(LessonTask.lesson_id)
            .subquery()
        )
        rows = (
            db.query(subq.c.lesson_id, subq.c.completed_at)
            .filter(subq.c.tasks_count > 0)
            .filter(subq.c.completed_count >= subq.c.tasks_count)
            .all()
        )
        return [(int(row.lesson_id), row.completed_at) for row in rows if row.completed_at is not None]
