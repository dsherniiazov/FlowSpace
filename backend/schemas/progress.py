from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ProgressSummary(BaseModel):
    user_id: int
    total_tasks: int
    completed_tasks: int
    total_lessons: int
    completed_lessons: int
    progress_percent: float


class CompletedLesson(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lesson_id: int
    completed_at: datetime
