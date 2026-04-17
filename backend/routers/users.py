from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_admin, get_current_user
from backend.auth.security import get_password_hash, verify_password
from backend.models.systems import SystemModel
from backend.models.users import User
from backend.schemas.users import UserAdminUpdate, UserCreate, UserPasswordChange, UserPublic, UserUpdate
from backend.services.user import UserService
from backend.utils.avatar import remove_avatar_file, save_avatar
from backend.utils.dependencies import get_db
from backend.utils.errors import AccessDeniedError, ValidationError

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])


def _ensure_self_or_admin(target_user_id: int, current_user: User) -> None:
    if target_user_id != current_user.id and not current_user.is_admin:
        raise AccessDeniedError("Not enough permissions")


@router.get("", response_model=list[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    return UserService.list_all(db)


@router.get("/{user_id}", response_model=UserPublic)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return UserService.get(db, user_id)


@router.post("", response_model=UserPublic)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    return UserService.create(
        db,
        email=data.email,
        name=data.name,
        last_name=data.last_name,
        password_hash=get_password_hash(data.password),
    )


@router.put("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_self_or_admin(user_id, current_user)
    fields = data.model_dump(exclude_unset=True)
    if "is_admin" in fields and not current_user.is_admin:
        raise AccessDeniedError("Not enough permissions")
    if "password" in fields:
        fields["password_hash"] = get_password_hash(fields.pop("password"))
    return UserService.update(db, user_id, fields)


@router.delete("/{user_id}", response_model=UserPublic)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_self_or_admin(user_id, current_user)
    user = UserService.get(db, user_id)
    remove_avatar_file(user.avatar_path)
    # Detach owned systems before deleting the user so the FK to users is not violated.
    db.query(SystemModel).filter(SystemModel.owner_id == user_id).update({"owner_id": None})
    db.flush()
    return UserService.delete(db, user_id)


@router.patch("/{user_id}/admin", response_model=UserPublic)
def set_admin_role(
    user_id: int,
    data: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise ValidationError("You cannot change your own admin role")
    return UserService.update(db, user_id, {"is_admin": data.is_admin})


@router.post("/{user_id}/avatar", response_model=UserPublic)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_self_or_admin(user_id, current_user)
    content = await file.read()
    new_avatar_url = save_avatar(user_id, file.filename or "", content)
    user = UserService.get(db, user_id)
    old_avatar_url = user.avatar_path
    updated = UserService.update(db, user_id, {"avatar_path": new_avatar_url})
    if old_avatar_url and old_avatar_url != updated.avatar_path:
        remove_avatar_file(old_avatar_url)
    return updated


@router.post("/{user_id}/change-password", response_model=UserPublic)
def change_password(
    user_id: int,
    data: UserPasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_self_or_admin(user_id, current_user)
    if len(data.new_password.strip()) < 6:
        raise ValidationError("New password must be at least 6 characters")
    user = UserService.get(db, user_id)
    if user_id == current_user.id and not verify_password(data.current_password, user.password_hash):
        raise ValidationError("Current password is incorrect")
    return UserService.update(db, user_id, {"password_hash": get_password_hash(data.new_password)})
