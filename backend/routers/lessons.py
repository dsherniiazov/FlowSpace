from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.services.lesson import LessonService
from backend.schemas.lessons import LessonCreate, LessonOut, LessonUpdate
from backend.auth.dependencies import get_current_user
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/lessons", tags=["lessons"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[LessonOut])
def list_lessons(db: Session = Depends(get_db)) -> list[LessonOut]:
    return LessonService.list_all(db)


@router.get("/published", response_model=list[LessonOut])
def list_published_lessons(db: Session = Depends(get_db)) -> list[LessonOut]:
    return LessonService.list_published(db)


@router.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: int, db: Session = Depends(get_db)) -> LessonOut:
    try:
        return LessonService.get(db, lesson_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("", response_model=LessonOut)
def create_lesson(
    data: LessonCreate,
    db: Session = Depends(get_db),
):
    return LessonService.create(
        db,
        title=data.title,
        content_markdown=data.content_markdown,
        section_id=data.section_id,
        order_index=data.order_index,
    )


@router.put("/{lesson_id}", response_model=LessonOut)
def update_lesson(
    lesson_id: int,
    data: LessonUpdate,
    db: Session = Depends(get_db),
):
    try:
        fields = data.model_dump(exclude_unset=True)
        return LessonService.update(db, lesson_id, fields)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{lesson_id}/publish", response_model=LessonOut)
def publish_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
):
    try:
        return LessonService.publish(db, lesson_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{lesson_id}", response_model=LessonOut)
def delete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
):
    try:
        return LessonService.delete(db, lesson_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
