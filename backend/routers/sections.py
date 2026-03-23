from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.schemas.sections import SectionCreate, SectionOut, SectionUpdate
from backend.services.section import SectionService
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/sections", tags=["sections"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[SectionOut])
def list_sections(db: Session = Depends(get_db)):
    return SectionService.list_all(db)


@router.get("/{section_id}", response_model=SectionOut)
def get_section(section_id: int, db: Session = Depends(get_db)):
    try:
        return SectionService.get(db, section_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("", response_model=SectionOut)
def create_section(data: SectionCreate, db: Session = Depends(get_db)):
    return SectionService.create(
        db,
        title=data.title,
        color=data.color,
        order_index=data.order_index,
        is_published=data.is_published,
    )


@router.put("/{section_id}", response_model=SectionOut)
def update_section(section_id: int, data: SectionUpdate, db: Session = Depends(get_db)):
    try:
        return SectionService.update(db, section_id, data.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/{section_id}", response_model=SectionOut)
def delete_section(section_id: int, db: Session = Depends(get_db)):
    try:
        return SectionService.delete(db, section_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
