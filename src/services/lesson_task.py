from sqlalchemy.orm import Session

from src.models.lesson_tasks import LessonTask
from src.services.lesson import LessonService


class LessonTaskService:
    @staticmethod
    def create(
        db: Session,
        lesson_id: int,
        title: str,
        description: str,
        system_id: int | None = None,
        order_index: int | None = None,
    ) -> LessonTask:
        LessonService.get(db, lesson_id)
        task = LessonTask(
            lesson_id=lesson_id,
            title=title,
            description=description,
            system_id=system_id,
            order_index=order_index if order_index is not None else 0,
        )
        db.add(task)
        try:
            db.commit()
            db.refresh(task)
        except Exception:
            db.rollback()
            raise
        return task

    @staticmethod
    def get(db: Session, task_id: int) -> LessonTask:
        task = db.query(LessonTask).filter(LessonTask.id == task_id).first()
        if not task:
            raise ValueError(f"Task with id {task_id} not found")
        return task

    @staticmethod
    def list_for_lesson(db: Session, lesson_id: int) -> list[LessonTask]:
        return (
            db.query(LessonTask)
            .filter(LessonTask.lesson_id == lesson_id)
            .order_by(LessonTask.order_index, LessonTask.id)
            .all()
        )

    @staticmethod
    def list_all(db: Session) -> list[LessonTask]:
        return db.query(LessonTask).order_by(LessonTask.lesson_id, LessonTask.order_index, LessonTask.id).all()

    @staticmethod
    def update(db: Session, task_id: int, fields: dict) -> LessonTask:
        task = LessonTaskService.get(db, task_id)
        for key, value in fields.items():
            setattr(task, key, value)
        try:
            db.commit()
            db.refresh(task)
        except Exception:
            db.rollback()
            raise
        return task

    @staticmethod
    def delete(db: Session, task_id: int) -> LessonTask:
        task = LessonTaskService.get(db, task_id)
        db.delete(task)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return task
