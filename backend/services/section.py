from sqlalchemy.orm import Session

from backend.models.lessons import Lesson
from backend.models.sections import Section
from backend.utils.db import commit, commit_and_refresh
from backend.utils.errors import NotFoundError


class SectionService:
    @staticmethod
    def create(
        db: Session,
        title: str,
        color: str | None = None,
        order_index: int | None = None,
        is_published: bool = True,
    ) -> Section:
        section = Section(
            title=title,
            color=color,
            order_index=order_index if order_index is not None else 0,
            is_published=is_published,
        )
        db.add(section)
        return commit_and_refresh(db, section)

    @staticmethod
    def get(db: Session, section_id: int) -> Section:
        section = db.query(Section).filter(Section.id == section_id).first()
        if not section:
            raise NotFoundError(f"Section with id {section_id} not found")
        return section

    @staticmethod
    def list_all(db: Session) -> list[Section]:
        return db.query(Section).order_by(Section.order_index, Section.id).all()

    @staticmethod
    def update(db: Session, section_id: int, fields: dict) -> Section:
        section = SectionService.get(db, section_id)
        for key, value in fields.items():
            setattr(section, key, value)
        return commit_and_refresh(db, section)

    @staticmethod
    def delete(db: Session, section_id: int) -> Section:
        section = SectionService.get(db, section_id)
        db.query(Lesson).filter(Lesson.section_id == section.id).update(
            {"section_id": None}, synchronize_session=False
        )
        db.delete(section)
        commit(db)
        return section
