from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.notifications import Notification
from backend.models.systems import SystemModel
from backend.models.users import User
from backend.utils.db import commit, commit_and_refresh
from backend.utils.errors import (
    AccessDeniedError,
    ConflictError,
    NotFoundError,
    ValidationError,
)


SystemNotFoundError = NotFoundError
SystemAccessDeniedError = AccessDeniedError
DuplicateSystemTitleError = ConflictError


def _sanitize_title(title: str) -> str:
    return " ".join(str(title).strip().split())


def _normalize_title(title: str) -> str:
    return _sanitize_title(title).lower()


class SystemModelService:
    @staticmethod
    def _ensure_unique_title(
        db: Session,
        owner_id: int | None,
        title: str,
        exclude_id: int | None = None,
    ) -> None:
        if owner_id is None:
            return
        normalized = _normalize_title(title)
        query = db.query(SystemModel).filter(SystemModel.owner_id == owner_id)
        if exclude_id is not None:
            query = query.filter(SystemModel.id != exclude_id)
        for item in query.all():
            if _normalize_title(item.title) == normalized:
                raise ConflictError("System with this title already exists")

    @staticmethod
    def _build_unique_title(
        db: Session,
        owner_id: int | None,
        title: str,
        exclude_id: int | None = None,
    ) -> str:
        clean_title = _sanitize_title(title)
        if not clean_title:
            raise ValidationError("Title is required")
        if owner_id is None:
            return clean_title
        try:
            SystemModelService._ensure_unique_title(db, owner_id, clean_title, exclude_id=exclude_id)
            return clean_title
        except ConflictError:
            suffix = 2
            while True:
                candidate = f"{clean_title} ({suffix})"
                try:
                    SystemModelService._ensure_unique_title(db, owner_id, candidate, exclude_id=exclude_id)
                    return candidate
                except ConflictError:
                    suffix += 1

    @staticmethod
    def create(
        db: Session,
        owner_id: int | None,
        title: str,
        graph_json: dict,
        lesson_id: int | None = None,
        source_system_id: int | None = None,
        is_public: bool = False,
        is_template: bool = False,
    ) -> SystemModel:
        clean_title = _sanitize_title(title)
        if not clean_title:
            raise ValidationError("Title is required")
        SystemModelService._ensure_unique_title(db, owner_id, clean_title)
        model = SystemModel(
            owner_id=owner_id,
            lesson_id=lesson_id,
            source_system_id=source_system_id,
            title=clean_title,
            graph_json=graph_json,
            is_public=is_public,
            is_template=is_template,
        )
        db.add(model)
        return commit_and_refresh(db, model)

    @staticmethod
    def get(db: Session, model_id: int) -> SystemModel:
        model = db.query(SystemModel).filter(SystemModel.id == model_id).first()
        if not model:
            raise NotFoundError(f"Model with id {model_id} not found")
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
    def ensure_view_access(model: SystemModel, user_id: int, is_admin: bool = False) -> None:
        if is_admin or model.owner_id == user_id or model.is_public:
            return
        raise AccessDeniedError("You do not have access to this system")

    @staticmethod
    def ensure_write_access(model: SystemModel, user_id: int, is_admin: bool = False) -> None:
        if is_admin or model.owner_id == user_id:
            return
        raise AccessDeniedError("You do not have permission to modify this system")

    @staticmethod
    def update(db: Session, model_id: int, fields: dict) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        if "title" in fields:
            clean_title = _sanitize_title(str(fields["title"]))
            if not clean_title:
                raise ValidationError("Title is required")
            SystemModelService._ensure_unique_title(db, model.owner_id, clean_title, exclude_id=model.id)
            fields["title"] = clean_title
        for key, value in fields.items():
            setattr(model, key, value)
        return commit_and_refresh(db, model)

    @staticmethod
    def delete(db: Session, model_id: int) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        db.delete(model)
        commit(db)
        return model

    @staticmethod
    def submit_for_review(db: Session, model_id: int) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        model.is_submitted_for_review = True
        return commit_and_refresh(db, model)

    @staticmethod
    def mark_changes_seen(db: Session, model_id: int) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        model.has_unseen_changes = False
        return commit_and_refresh(db, model)

    @staticmethod
    def mark_reviewed(
        db: Session,
        model_id: int,
        reviewer_id: int | None = None,
        comment: str | None = None,
    ) -> SystemModel:
        model = SystemModelService.get(db, model_id)
        model.is_submitted_for_review = False

        clean_comment = (comment or "").strip() or None
        owner_needs_notification = (
            model.owner_id is not None and model.owner_id != reviewer_id
        )
        if owner_needs_notification:
            db.add(
                Notification(
                    recipient_user_id=model.owner_id,
                    sender_user_id=reviewer_id,
                    system_id=model.id,
                    system_title=model.title,
                    kind="review",
                    title=f'Your system "{model.title}" was reviewed',
                    body=clean_comment,
                    created_at=datetime.now(timezone.utc),
                )
            )
        return commit_and_refresh(db, model)

    @staticmethod
    def list_pending_review_with_owners(db: Session) -> list[tuple[SystemModel, User | None]]:
        return (
            db.query(SystemModel, User)
            .outerjoin(User, SystemModel.owner_id == User.id)
            .filter(SystemModel.is_submitted_for_review == True)  # noqa: E712
            .all()
        )

    @staticmethod
    def sanitize_title(title: str) -> str:
        return _sanitize_title(title)

    @staticmethod
    def get_or_create_user_copy_from_template(db: Session, template_id: int, user_id: int) -> SystemModel:
        template = SystemModelService.get(db, template_id)
        if template.owner_id is not None or not template.is_template:
            raise ValidationError("Task system template is misconfigured")

        existing = (
            db.query(SystemModel)
            .filter(SystemModel.owner_id == user_id, SystemModel.source_system_id == template.id)
            .first()
        )
        if existing:
            return existing

        copy_title = SystemModelService._build_unique_title(db, user_id, template.title)
        model = SystemModel(
            owner_id=user_id,
            lesson_id=template.lesson_id,
            source_system_id=template.id,
            title=copy_title,
            graph_json=template.graph_json,
            is_public=False,
            is_template=False,
        )
        db.add(model)
        return commit_and_refresh(db, model)
