from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.models.users import User
from backend.schemas.progress import CompletedLesson, ProgressSummary
from backend.services.lesson import LessonService
from backend.services.task_progress import TaskProgressService
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/progress", tags=["progress"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=ProgressSummary)
def get_progress(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_tasks, completed_tasks = TaskProgressService.summary_for_user(db, current_user.id)
    total_lessons = LessonService.count_all(db)
    completed_lessons = len(TaskProgressService.completed_lesson_ids(db, current_user.id))
    progress_percent = 100.0 if total_tasks == 0 else completed_tasks / total_tasks * 100

    return ProgressSummary(
        user_id=current_user.id,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        total_lessons=total_lessons,
        completed_lessons=completed_lessons,
        progress_percent=round(progress_percent, 2),
    )


@router.get("/completed", response_model=list[CompletedLesson])
def list_completed_lessons(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    completed = TaskProgressService.completed_lessons_with_timestamp(db, current_user.id)
    return [
        CompletedLesson(lesson_id=lesson_id, completed_at=completed_at)
        for lesson_id, completed_at in completed
    ]
