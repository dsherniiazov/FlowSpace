from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LessonTaskCreate(BaseModel):
    lesson_id: int
    title: str
    description: str
    order_index: int | None = None


class LessonTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order_index: int | None = None


class LessonTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lesson_id: int
    title: str
    description: str
    system_id: int
    order_index: int | None = None
    created_at: datetime | None = None


class CompletedTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: int
    completed_at: datetime
