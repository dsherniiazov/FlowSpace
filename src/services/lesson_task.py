from sqlalchemy.orm import Session

from src.models.lesson_tasks import LessonTask
from src.models.systems import SystemModel
from src.services.lesson import LessonService
from src.services.system import SystemModelService


DEFAULT_TASK_SYSTEM_GRAPH = {"nodes": [], "edges": []}


class LessonTaskService:
    @staticmethod
    def create(
        db: Session,
        lesson_id: int,
        title: str,
        description: str,
        order_index: int | None = None,
    ) -> LessonTask:
        LessonService.get(db, lesson_id)
        template_title = SystemModelService._sanitize_title(title) or "Task system"
        template = SystemModel(
            owner_id=None,
            lesson_id=lesson_id,
            title=template_title,
            graph_json=DEFAULT_TASK_SYSTEM_GRAPH,
            is_public=False,
            is_template=True,
        )
        db.add(template)
        db.flush()
        task = LessonTask(
            lesson_id=lesson_id,
            title=title,
            description=description,
            system_id=template.id,
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
        fields.pop("system_id", None)
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
        template = SystemModelService.get(db, task.system_id)
        db.delete(task)
        db.flush()
        db.delete(template)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return task

    @staticmethod
    def start_for_user(db: Session, task_id: int, user_id: int) -> SystemModel:
        task = LessonTaskService.get(db, task_id)
        return SystemModelService.get_or_create_user_copy_from_template(db, task.system_id, user_id)
