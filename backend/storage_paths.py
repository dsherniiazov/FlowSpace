from pathlib import Path

from backend.config import settings


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def get_files_dir() -> Path:
    files_dir = _resolve_path(settings.files_dir)
    files_dir.mkdir(parents=True, exist_ok=True)
    return files_dir


def get_avatars_dir() -> Path:
    avatars_dir = get_files_dir() / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    return avatars_dir
