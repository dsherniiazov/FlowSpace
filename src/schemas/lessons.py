from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LessonCreate(BaseModel):
    title: str
    content_markdown: str
    section_id: int | None = None
    order_index: int | None = None


class LessonUpdate(BaseModel):
    title: str | None = None
    content_markdown: str | None = None
    section_id: int | None = None
    order_index: int | None = None
    is_published: bool | None = None


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content_markdown: str
    section_id: int | None = None
    order_index: int | None = None
    is_published: bool | None = None
    created_at: datetime | None = None
