from sqlalchemy.orm import Session

from src.models.systems import SystemModel


class SystemNotFoundError(ValueError):
    pass


class DuplicateSystemTitleError(ValueError):
    pass


class SystemModelService:
    @staticmethod
    def _normalized_title(title: str) -> str:
        return " ".join(str(title).strip().split()).lower()

    @staticmethod
    def _ensure_unique_title(
        db: Session,
        owner_id: int | None,
        title: str,
        exclude_id: int | None = None,
    ) -> None:
        normalized = SystemModelService._normalized_title(title)
        query = db.query(SystemModel).filter(SystemModel.owner_id == owner_id)
        if exclude_id is not None:
            query = query.filter(SystemModel.id != exclude_id)
        existing = query.all()
        for item in existing:
            if SystemModelService._normalized_title(item.title) == normalized:
                raise DuplicateSystemTitleError("System with this title already exists")

    @staticmethod
    def _sanitize_title(title: str) -> str:
        return " ".join(str(title).strip().split())

    @staticmethod
    def create(
        db: Session,
        owner_id: int,
        title: str,
        graph_json: dict,
        lesson_id: int | None = None,
        is_public: bool = False,
        is_template: bool = False,
    ) -> SystemModel:
        clean_title = SystemModelService._sanitize_title(title)
        if not clean_title:
            raise ValueError("Title is required")
        SystemModelService._ensure_unique_title(db, owner_id, clean_title)
        model = SystemModel(
            owner_id=owner_id,
            lesson_id=lesson_id,
            title=clean_title,
            graph_json=graph_json,
            is_public=is_public,
            is_template=is_template,
        )
        db.add(model)
        try:
            db.commit()
            db.refresh(model)
        except Exception:
            db.rollback()
            raise
        return model

    @staticmethod
    def get(db: Session, model_id: int, user_id: int | None = None) -> SystemModel:
        query = db.query(SystemModel).filter(SystemModel.id == model_id)

        if user_id is not None:
            query = query.filter(
                (SystemModel.owner_id == user_id) | (SystemModel.is_public)
            )

        model = query.first()
        if not model:
            raise SystemNotFoundError(f"Model with id {model_id} not found")

        return model

    @staticmethod
    def list_for_user(db: Session, user_id: int) -> list[SystemModel]:
        return db.query(SystemModel).filter(SystemModel.owner_id == user_id).all()

    @staticmethod
    def list_all(db: Session) -> list[SystemModel]:
        return db.query(SystemModel).all()

    @staticmethod
    def list_public(db: Session) -> list[SystemModel]:
        return db.query(SystemModel).filter(SystemModel.is_public).all()

    @staticmethod
    def update(db: Session, model_id: int, fields: dict) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        if "title" in fields:
            clean_title = SystemModelService._sanitize_title(str(fields["title"]))
            if not clean_title:
                raise ValueError("Title is required")
            SystemModelService._ensure_unique_title(db, model.owner_id, clean_title, exclude_id=model.id)
            fields["title"] = clean_title
        for key, value in fields.items():
            setattr(model, key, value)
        try:
            db.commit()
            db.refresh(model)
        except Exception:
            db.rollback()
            raise
        return model

    @staticmethod
    def delete(db: Session, model_id: int, user_id: int | None = None) -> SystemModel:
        model = SystemModelService.get(db, model_id, user_id)
        db.delete(model)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return model
