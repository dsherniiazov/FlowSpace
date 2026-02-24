from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.auth.dependencies import get_current_user
from src.schemas.lesson_tasks import LessonTaskCreate, LessonTaskOut, LessonTaskUpdate
from src.services.lesson_task import LessonTaskService
from src.utils.dependencies import get_db

router = APIRouter(prefix="/lesson-tasks", tags=["lesson-tasks"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[LessonTaskOut])
def list_tasks(
    lesson_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if lesson_id is not None:
        return LessonTaskService.list_for_lesson(db, lesson_id)
    return LessonTaskService.list_all(db)


@router.get("/{task_id}", response_model=LessonTaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    try:
        return LessonTaskService.get(db, task_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("", response_model=LessonTaskOut)
def create_task(data: LessonTaskCreate, db: Session = Depends(get_db)):
    return LessonTaskService.create(
        db,
        lesson_id=data.lesson_id,
        title=data.title,
        description=data.description,
        system_id=data.system_id,
        order_index=data.order_index,
    )


@router.put("/{task_id}", response_model=LessonTaskOut)
def update_task(task_id: int, data: LessonTaskUpdate, db: Session = Depends(get_db)):
    try:
        return LessonTaskService.update(db, task_id, data.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/{task_id}", response_model=LessonTaskOut)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    try:
        return LessonTaskService.delete(db, task_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
