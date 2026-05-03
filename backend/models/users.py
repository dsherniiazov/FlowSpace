from backend.db import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy import CheckConstraint
from sqlalchemy.sql import func


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('student', 'teacher', 'admin')", name="ck_users_role"),
    )

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    role = Column(String, nullable=False, default="student", server_default="student")
    avatar_path = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    @property
    def is_teacher(self) -> bool:
        return self.role in {"teacher", "admin"} or bool(self.is_admin)
