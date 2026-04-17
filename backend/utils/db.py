from typing import TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")


def commit_and_refresh(db: Session, obj: T) -> T:
    try:
        db.commit()
        db.refresh(obj)
    except Exception:
        db.rollback()
        raise
    return obj


def commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
