from pathlib import Path
from uuid import uuid4

from backend.storage_paths import get_avatars_dir
from backend.utils.errors import ValidationError

AVATARS_DIR = get_avatars_dir()
AVATAR_URL_PREFIX = "/files/avatars/"
ALLOWED_AVATAR_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".jfif"}
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024


def _avatar_path_on_disk(avatar_url: str) -> Path | None:
    if not avatar_url or not avatar_url.startswith(AVATAR_URL_PREFIX):
        return None
    return AVATARS_DIR / avatar_url.removeprefix(AVATAR_URL_PREFIX)


def remove_avatar_file(avatar_url: str | None) -> None:
    path = _avatar_path_on_disk(avatar_url or "")
    if path and path.exists():
        path.unlink()


def save_avatar(user_id: int, filename: str, content: bytes) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_AVATAR_EXTS:
        raise ValidationError(
            "Unsupported avatar format. Use PNG, JPG, JPEG, WEBP, GIF, BMP, or AVIF."
        )
    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise ValidationError("Avatar file too large")

    stored_name = f"user_{user_id}_{uuid4().hex}{suffix}"
    destination = AVATARS_DIR / stored_name
    destination.write_bytes(content)
    return f"{AVATAR_URL_PREFIX}{stored_name}"
