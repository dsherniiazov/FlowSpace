from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.services.user import UserService
from src.schemas.users import UserAdminUpdate, UserCreate, UserPasswordChange, UserUpdate, UserPublic
from src.auth.security import get_password_hash, verify_password
from src.auth.dependencies import get_current_admin, get_current_user
from src.utils.dependencies import get_db

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])
BASE_DIR = Path(__file__).resolve().parents[2]
AVATARS_DIR = BASE_DIR / "files" / "avatars"
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".jfif"}
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024


def _remove_avatar_file_if_exists(avatar_path: str | None) -> None:
    if not avatar_path or not avatar_path.startswith("/files/avatars/"):
        return
    file_path = AVATARS_DIR / avatar_path.removeprefix("/files/avatars/")
    if file_path.exists():
        file_path.unlink()


@router.get("", response_model=list[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    return UserService.list_all(db)


@router.get("/{user_id}", response_model=UserPublic)
def get_user(user_id: int, db: Session = Depends(get_db)):
    try:
        return UserService.get(db, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("", response_model=UserPublic)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
):
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
    current_user=Depends(get_current_user),
):
    try:
        fields = data.model_dump(exclude_unset=True)
        if user_id != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        if "is_admin" in fields and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        if "password" in fields:
            fields["password_hash"] = get_password_hash(fields.pop("password"))
        return UserService.update(db, user_id, fields)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{user_id}", response_model=UserPublic)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    try:
        user = UserService.get(db, user_id)
        _remove_avatar_file_if_exists(user.avatar_path)
        return UserService.delete(db, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.patch("/{user_id}/admin", response_model=UserPublic)
def set_admin_role(
    user_id: int,
    data: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own admin role")
    try:
        return UserService.update(db, user_id, {"is_admin": data.is_admin})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{user_id}/avatar", response_model=UserPublic)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AVATAR_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported avatar format. Use PNG, JPG, JPEG, WEBP, GIF, BMP, or AVIF.",
        )

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file too large")

    filename = f"user_{user_id}_{uuid4().hex}{suffix}"
    destination = AVATARS_DIR / filename
    destination.write_bytes(content)

    try:
        user = UserService.get(db, user_id)
        old_avatar_path = user.avatar_path
        updated = UserService.update(db, user_id, {"avatar_path": f"/files/avatars/{filename}"})
        if old_avatar_path and old_avatar_path != updated.avatar_path:
            _remove_avatar_file_if_exists(old_avatar_path)
        return updated
    except ValueError as e:
        if destination.exists():
            destination.unlink()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{user_id}/change-password", response_model=UserPublic)
def change_password(
    user_id: int,
    data: UserPasswordChange,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if len(data.new_password.strip()) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 6 characters")

    try:
        user = UserService.get(db, user_id)
        if user_id == current_user.id and not verify_password(data.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        return UserService.update(db, user_id, {"password_hash": get_password_hash(data.new_password)})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
