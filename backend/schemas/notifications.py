from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipient_user_id: int
    sender_user_id: int | None = None
    sender_name: str | None = None
    system_id: int | None = None
    system_title: str | None = None
    kind: str
    title: str
    body: str | None = None
    created_at: datetime
    read_at: datetime | None = None


class MarkReviewedIn(BaseModel):
    comment: str | None = None
