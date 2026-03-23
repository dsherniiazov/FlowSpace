from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.models.users import User
from backend.schemas.systems import SystemCreate, SystemOut, SystemUpdate, SystemWithOwner
from backend.services.system import (
    DuplicateSystemTitleError,
    SystemAccessDeniedError,
    SystemModelService,
    SystemNotFoundError,
)
from backend.auth.dependencies import get_current_user
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/systems", tags=["systems"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[SystemOut])
def list_systems(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return SystemModelService.list_for_user(db, current_user.id)


@router.get("/public", response_model=list[SystemOut])
def list_public_systems(db: Session = Depends(get_db)):
    return SystemModelService.list_public(db)


@router.post("/pending-review/{system_id}/mark-reviewed", response_model=SystemOut)
def mark_reviewed(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    try:
        return SystemModelService.mark_reviewed(db, system_id)
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/pending-review", response_model=list[SystemWithOwner])
def list_pending_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    rows = SystemModelService.list_pending_review(db)
    result = []
    for model, owner in rows:
        item = SystemWithOwner.model_validate(model)
        if owner:
            item.owner_email = owner.email
            item.owner_name = f"{owner.name} {owner.last_name}".strip()
        result.append(item)
    return result


@router.get("/{system_id}", response_model=SystemOut)
def get_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        model = SystemModelService.get(db, system_id)
        SystemModelService.ensure_view_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        return model
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SystemAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.post("", response_model=SystemOut)
def create_system(
    data: SystemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        owner_id = data.owner_id if current_user.is_admin and data.owner_id is not None else current_user.id
        return SystemModelService.create(
            db,
            owner_id=owner_id,
            title=data.title,
            graph_json=data.graph_json,
            lesson_id=data.lesson_id,
            is_public=data.is_public,
            is_template=False,
        )
    except DuplicateSystemTitleError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{system_id}", response_model=SystemOut)
def update_system(
    system_id: int,
    data: SystemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        model = SystemModelService.get(db, system_id)
        SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        fields = data.model_dump(exclude_unset=True)
        if not current_user.is_admin:
            fields.pop("owner_id", None)
            fields.pop("is_template", None)
            fields.pop("source_system_id", None)
        # If admin is editing another user's system, flag unseen changes for the owner
        if current_user.is_admin and model.owner_id is not None and model.owner_id != current_user.id:
            fields["has_unseen_changes"] = True
        return SystemModelService.update(db, system_id, fields)
    except DuplicateSystemTitleError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SystemAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{system_id}/submit-for-review", response_model=SystemOut)
def submit_for_review(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        model = SystemModelService.get(db, system_id)
        SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        return SystemModelService.submit_for_review(db, system_id)
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SystemAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.post("/{system_id}/mark-seen", response_model=SystemOut)
def mark_changes_seen(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        model = SystemModelService.get(db, system_id)
        SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        return SystemModelService.mark_changes_seen(db, system_id)
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SystemAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.delete("/{system_id}", response_model=SystemOut)
def delete_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        model = SystemModelService.get(db, system_id)
        SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        return SystemModelService.delete(db, system_id)
    except SystemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except SystemAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
