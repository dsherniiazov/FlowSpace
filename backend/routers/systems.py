from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_admin, get_current_user
from backend.models.users import User
from backend.schemas.notifications import MarkReviewedIn
from backend.schemas.systems import SystemCreate, SystemOut, SystemUpdate, SystemWithOwner
from backend.services.system import SystemModelService
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
    payload: MarkReviewedIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    return SystemModelService.mark_reviewed(
        db,
        system_id,
        reviewer_id=current_user.id,
        comment=payload.comment if payload is not None else None,
    )


@router.get("/pending-review", response_model=list[SystemWithOwner])
def list_pending_review(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result: list[SystemWithOwner] = []
    for model, owner in SystemModelService.list_pending_review_with_owners(db):
        item = SystemWithOwner.model_validate(model)
        if owner:
            item.owner_email = owner.email
            item.owner_name = f"{owner.name} {owner.last_name}".strip()
        result.append(item)
    return result


@router.get("/{system_id}", response_model=SystemOut)
def get_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = SystemModelService.get(db, system_id)
    SystemModelService.ensure_view_access(model, current_user.id, is_admin=bool(current_user.is_admin))
    return model


@router.post("", response_model=SystemOut)
def create_system(
    data: SystemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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


@router.put("/{system_id}", response_model=SystemOut)
def update_system(
    system_id: int,
    data: SystemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = SystemModelService.get(db, system_id)
    SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
    fields = data.model_dump(exclude_unset=True)
    if not current_user.is_admin:
        for admin_only in ("owner_id", "is_template", "source_system_id"):
            fields.pop(admin_only, None)
    # Admins editing another user's system flag it so the owner sees the update on next visit.
    if current_user.is_admin and model.owner_id is not None and model.owner_id != current_user.id:
        fields["has_unseen_changes"] = True
    return SystemModelService.update(db, system_id, fields)


@router.post("/{system_id}/submit-for-review", response_model=SystemOut)
def submit_for_review(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = SystemModelService.get(db, system_id)
    SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
    return SystemModelService.submit_for_review(db, system_id)


@router.post("/{system_id}/mark-seen", response_model=SystemOut)
def mark_changes_seen(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = SystemModelService.get(db, system_id)
    SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
    return SystemModelService.mark_changes_seen(db, system_id)


@router.delete("/{system_id}", response_model=SystemOut)
def delete_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = SystemModelService.get(db, system_id)
    SystemModelService.ensure_write_access(model, current_user.id, is_admin=bool(current_user.is_admin))
    return SystemModelService.delete(db, system_id)
