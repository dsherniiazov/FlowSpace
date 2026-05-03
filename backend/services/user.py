from typing import Optional

from sqlalchemy.orm import Session

from backend.models.users import User
from backend.utils.db import commit, commit_and_refresh
from backend.utils.errors import NotFoundError, ValidationError


USER_ROLES = {"student", "teacher", "admin"}


def role_for_admin_flag(is_admin: bool) -> str:
    return "teacher" if is_admin else "student"


class UserService:
    @staticmethod
    def get(db: Session, user_id: int) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise NotFoundError(f"User with id {user_id} not found")
        return user

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def create(
        db: Session,
        email: str,
        name: str,
        last_name: str,
        password_hash: str,
        is_admin: bool | None = None,
    ) -> User:
        if is_admin is None:
            is_admin = db.query(User).count() == 0
        user = User(
            email=email,
            name=name,
            last_name=last_name,
            password_hash=password_hash,
            is_admin=is_admin,
            role=role_for_admin_flag(is_admin),
        )
        db.add(user)
        return commit_and_refresh(db, user)

    @staticmethod
    def list_all(db: Session) -> list[User]:
        return db.query(User).all()

    @staticmethod
    def update(db: Session, user_id: int, fields: dict) -> User:
        user = UserService.get(db, user_id)
        if "role" in fields and fields["role"] not in USER_ROLES:
            raise ValidationError("Invalid user role")
        if "is_admin" in fields and "role" not in fields:
            fields["role"] = role_for_admin_flag(bool(fields["is_admin"]))
        if "role" in fields and "is_admin" not in fields:
            fields["is_admin"] = fields["role"] in {"teacher", "admin"}
        for key, value in fields.items():
            setattr(user, key, value)
        return commit_and_refresh(db, user)

    @staticmethod
    def delete(db: Session, user_id: int) -> User:
        user = UserService.get(db, user_id)
        db.delete(user)
        commit(db)
        return user
