from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.db_url,
    echo=settings.db_echo
)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
