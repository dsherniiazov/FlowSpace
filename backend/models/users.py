from backend.db import Base
from sqlalchemy import Boolean, Column, Integer, String


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    avatar_path = Column(String, nullable=True)
