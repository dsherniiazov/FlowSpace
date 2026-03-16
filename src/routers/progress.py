from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.schemas.progress import CompletedLesson, ProgressSummary
from src.auth.dependencies import get_current_user
from src.models.users import User
from src.services.lesson import LessonService
from src.services.task_progress import TaskProgressService
from src.utils.dependencies import get_db

router = APIRouter(prefix="/progress", tags=["progress"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=ProgressSummary)
def get_progress(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_tasks, completed_tasks = TaskProgressService.summary_for_user(db, current_user.id)
    total_lessons = LessonService.count_all(db)
    completed_lessons = len(TaskProgressService.completed_lesson_ids(db, current_user.id))
    progress_percent = 100.0 if total_tasks == 0 else (completed_tasks / total_tasks * 100)

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
    return [CompletedLesson(lesson_id=lesson_id, completed_at=completed_at) for lesson_id, completed_at in completed]


@router.post("/{lesson_id}/complete", response_model=CompletedLesson)
def complete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(status_code=400, detail="Lesson completion is derived from task completion")


@router.delete("/{lesson_id}", response_model=CompletedLesson)
def uncomplete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(status_code=400, detail="Uncomplete lesson by uncompleting one or more tasks")
