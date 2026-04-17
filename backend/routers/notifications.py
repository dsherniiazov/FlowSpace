from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.models.users import User
from backend.schemas.notifications import NotificationOut
from backend.services.notification import NotificationService
from backend.utils.dependencies import get_db

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationService.list_for_user(db, current_user.id)


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": NotificationService.unread_count(db, current_user.id)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationService.mark_read(db, notification_id, current_user.id)


@router.delete("/{notification_id}", response_model=NotificationOut)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationService.delete(db, notification_id, current_user.id)
