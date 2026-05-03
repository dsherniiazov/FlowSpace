import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.model_reviews import ModelReview
from backend.models.notifications import Notification
from backend.models.systems import SystemModel
from backend.models.users import User
from backend.services.email import send_review_notification_email
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


logger = logging.getLogger(__name__)


def clean_title_text(title: str) -> str:
    return " ".join(str(title).strip().split())


def normalized_title_key(title: str) -> str:
    return clean_title_text(title).lower()


class SystemModelService:
    @staticmethod
    def assert_unique_owner_title(
        db: Session,
        owner_id: int | None,
        title: str,
        exclude_id: int | None = None,
    ) -> None:
        if owner_id is None:
            return
        normalized = normalized_title_key(title)
        query = db.query(SystemModel).filter(SystemModel.owner_id == owner_id)
        if exclude_id is not None:
            query = query.filter(SystemModel.id != exclude_id)
        for item in query.all():
            if normalized_title_key(item.title) == normalized:
                raise ConflictError("System with this title already exists")

    @staticmethod
    def allocate_unique_title_for_owner(
        db: Session,
        owner_id: int | None,
        title: str,
        exclude_id: int | None = None,
    ) -> str:
        clean_title = clean_title_text(title)
        if not clean_title:
            raise ValidationError("Title is required")
        if owner_id is None:
            return clean_title
        try:
            SystemModelService.assert_unique_owner_title(db, owner_id, clean_title, exclude_id=exclude_id)
            return clean_title
        except ConflictError:
            suffix = 2
            while True:
                candidate = f"{clean_title} ({suffix})"
                try:
                    SystemModelService.assert_unique_owner_title(db, owner_id, candidate, exclude_id=exclude_id)
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
        clean_title = clean_title_text(title)
        if not clean_title:
            raise ValidationError("Title is required")
        SystemModelService.assert_unique_owner_title(db, owner_id, clean_title)
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
            clean_title = clean_title_text(str(fields["title"]))
            if not clean_title:
                raise ValidationError("Title is required")
            SystemModelService.assert_unique_owner_title(db, model.owner_id, clean_title, exclude_id=model.id)
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
        if model.owner_id is None:
            raise ValidationError("Only user-owned systems can be submitted for review")
        now = datetime.now(timezone.utc)
        model.is_submitted_for_review = True
        model.review_status = "submitted"
        model.submitted_at = now
        model.reviewed_at = None
        model.reviewed_by_user_id = None
        review = ModelReview(
            system_id=model.id,
            student_id=model.owner_id,
            status="submitted",
            submitted_at=now,
        )
        db.add(review)
        db.flush()
        model.latest_review_id = review.id
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
        now = datetime.now(timezone.utc)
        model.is_submitted_for_review = False
        model.review_status = "reviewed"
        model.reviewed_at = now
        model.reviewed_by_user_id = reviewer_id

        clean_comment = (comment or "").strip() or None
        review = None
        if model.latest_review_id is not None:
            review = db.query(ModelReview).filter(ModelReview.id == model.latest_review_id).first()
        if review is None:
            review = (
                db.query(ModelReview)
                .filter(ModelReview.system_id == model.id)
                .order_by(ModelReview.submitted_at.desc(), ModelReview.id.desc())
                .first()
            )
        if review is None and model.owner_id is not None:
            review = ModelReview(
                system_id=model.id,
                student_id=model.owner_id,
                submitted_at=model.submitted_at or now,
            )
            db.add(review)
            db.flush()
            model.latest_review_id = review.id
        if review is not None:
            review.teacher_id = reviewer_id
            review.status = "reviewed"
            review.comment = clean_comment
            review.reviewed_at = now

        owner_needs_notification = (
            model.owner_id is not None and model.owner_id != reviewer_id
        )
        if owner_needs_notification:
            owner = db.query(User).filter(User.id == model.owner_id).first()
            reviewer = db.query(User).filter(User.id == reviewer_id).first() if reviewer_id else None
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
            if owner and owner.email:
                reviewer_name = None
                if reviewer:
                    reviewer_name = f"{reviewer.name} {reviewer.last_name}".strip() or reviewer.email
                try:
                    send_review_notification_email(owner.email, model.title, reviewer_name, clean_comment, db=db)
                except Exception:
                    logger.exception("Failed to send review notification to %s", owner.email)
        return commit_and_refresh(db, model)

    @staticmethod
    def list_pending_review_with_owners(db: Session) -> list[tuple[SystemModel, User | None]]:
        return (
            db.query(SystemModel, User)
            .outerjoin(User, SystemModel.owner_id == User.id)
            .filter(SystemModel.is_submitted_for_review == True)
            .all()
        )

    @staticmethod
    def sanitize_title(title: str) -> str:
        return clean_title_text(title)

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

        copy_title = SystemModelService.allocate_unique_title_for_owner(db, user_id, template.title)
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
