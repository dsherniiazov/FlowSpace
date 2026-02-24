from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.services.system import SystemModelService
from src.schemas.systems import SystemCreate, SystemUpdate
from src.auth.dependencies import get_current_user
from src.utils.dependencies import get_db

router = APIRouter(prefix="/systems", tags=["systems"], dependencies=[Depends(get_current_user)])


@router.get("")
def list_systems(db: Session = Depends(get_db)):
    return SystemModelService.list_all(db)


@router.get("/public")
def list_public_systems(db: Session = Depends(get_db)):
    return SystemModelService.list_public(db)


@router.get("/{system_id}")
def get_system(system_id: int, db: Session = Depends(get_db)):
    try:
        return SystemModelService.get(db, system_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("")
def create_system(
    data: SystemCreate,
    db: Session = Depends(get_db),
):
    return SystemModelService.create(
        db,
        owner_id=data.owner_id,
        title=data.title,
        graph_json=data.graph_json,
        lesson_id=data.lesson_id,
        is_public=data.is_public,
        is_template=data.is_template,
    )


@router.put("/{system_id}")
def update_system(
    system_id: int,
    data: SystemUpdate,
    db: Session = Depends(get_db),
):
    try:
        fields = data.model_dump(exclude_unset=True)
        return SystemModelService.update(db, system_id, fields)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{system_id}")
def delete_system(system_id: int, db: Session = Depends(get_db)):
    try:
        return SystemModelService.delete(db, system_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
