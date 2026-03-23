from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from typing import Optional

from backend.models.lessons import Lesson
from backend.services.section import SectionService


class LessonService:

    @staticmethod
    def create(
        db: Session,
        title: str,
        content_markdown: str,
        section_id: int | None = None,
        order_index: int | None = None,
    ) -> Lesson:
        if section_id is not None:
            SectionService.get(db, section_id)

        lesson = Lesson(
            title=title,
            content_markdown=content_markdown,
            section_id=section_id,
            order_index=order_index,
        )
        db.add(lesson)
        try:
            db.commit()
            db.refresh(lesson)
        except Exception:
            db.rollback()
            raise
        return lesson

    @staticmethod
    def get(db: Session, lesson_id: int) -> Lesson:
        lesson = (
            db.query(Lesson)
            .options(joinedload(Lesson.section))
            .filter(Lesson.id == lesson_id)
            .first()
        )
        if not lesson:
            raise ValueError(f"Lesson with id {lesson_id} not found")
        return lesson

    @staticmethod
    def list_all(db: Session) -> list[Lesson]:
        return (
            db.query(Lesson)
            .options(joinedload(Lesson.section))
            .order_by(Lesson.section_id, Lesson.order_index, Lesson.id)
            .all()
        )

    @staticmethod
    def count_all(db: Session) -> int:
        return db.query(Lesson).count()

    @staticmethod
    def list_published(db: Session) -> list[Lesson]:
        return (
            db.query(Lesson)
            .options(joinedload(Lesson.section))
            .filter(Lesson.is_published)
            .order_by(Lesson.section_id, Lesson.order_index, Lesson.id)
            .all()
        )

    @staticmethod
    def update(db: Session, lesson_id: int, fields: dict) -> Lesson:
        lesson = LessonService.get(db, lesson_id)
        if "section_id" in fields and fields["section_id"] is not None:
            SectionService.get(db, int(fields["section_id"]))
        for key, value in fields.items():
            setattr(lesson, key, value)
        try:
            db.commit()
            db.refresh(lesson)
        except Exception:
            db.rollback()
            raise
        return lesson

    @staticmethod
    def publish(db: Session, lesson_id: int) -> Lesson:
        lesson = LessonService.get(db, lesson_id)
        lesson.is_published = True
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return lesson

    @staticmethod
    def delete(db: Session, lesson_id: int) -> Lesson:
        lesson = LessonService.get(db, lesson_id)
        db.delete(lesson)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return lesson
