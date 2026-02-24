from sqlalchemy.orm import Session

from src.models.sections import Section
from src.models.lessons import Lesson


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
        try:
            db.commit()
            db.refresh(section)
        except Exception:
            db.rollback()
            raise
        return section

    @staticmethod
    def get(db: Session, section_id: int) -> Section:
        section = db.query(Section).filter(Section.id == section_id).first()
        if not section:
            raise ValueError(f"Section with id {section_id} not found")
        return section

    @staticmethod
    def list_all(db: Session) -> list[Section]:
        return db.query(Section).order_by(Section.order_index, Section.id).all()

    @staticmethod
    def list_published(db: Session) -> list[Section]:
        return (
            db.query(Section)
            .filter(Section.is_published)
            .order_by(Section.order_index, Section.id)
            .all()
        )

    @staticmethod
    def update(db: Session, section_id: int, fields: dict) -> Section:
        section = SectionService.get(db, section_id)
        for key, value in fields.items():
            setattr(section, key, value)
        try:
            db.commit()
            db.refresh(section)
        except Exception:
            db.rollback()
            raise
        return section

    @staticmethod
    def delete(db: Session, section_id: int) -> Section:
        section = SectionService.get(db, section_id)
        db.query(Lesson).filter(Lesson.section_id == section.id).update({"section_id": None}, synchronize_session=False)
        db.delete(section)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return section

    @staticmethod
    def get_default(db: Session) -> Section:
        section = db.query(Section).order_by(Section.order_index, Section.id).first()
        if section:
            return section
        return SectionService.create(db, title="Core lessons", order_index=1, is_published=True)
