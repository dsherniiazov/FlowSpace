from sqlalchemy.orm import Session
from typing import Optional

from src.models.systems import SystemModel


class SystemModelService:

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
        model = SystemModel(
            owner_id=owner_id,
            lesson_id=lesson_id,
            title=title,
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
            raise ValueError(f"Model with id {model_id} not found")

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
