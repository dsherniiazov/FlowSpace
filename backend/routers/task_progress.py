from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.models.users import User
from backend.schemas.lesson_tasks import CompletedTaskOut
from backend.services.lesson_task import LessonTaskService
from backend.services.task_progress import TaskProgressService
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/task-progress", tags=["task-progress"], dependencies=[Depends(get_current_user)])


@router.get("/completed", response_model=list[CompletedTaskOut])
def list_completed_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return TaskProgressService.list_completed_tasks_for_user(db, current_user.id)


@router.post("/{task_id}/complete", response_model=CompletedTaskOut)
def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        LessonTaskService.get(db, task_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TaskProgressService.complete_task(db, current_user.id, task_id)


@router.delete("/{task_id}", response_model=CompletedTaskOut)
def uncomplete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    progress = TaskProgressService.uncomplete_task(db, current_user.id, task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task completion not found")
    return progress
