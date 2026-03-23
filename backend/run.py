import subprocess

import uvicorn

from backend.config import settings


def run_migrations_if_enabled() -> None:
    if not settings.RUN_MIGRATIONS:
        return
    print("[backend] RUN_MIGRATIONS=true -> applying alembic migrations...")
    try:
        subprocess.run(
            ["alembic", "-c", "backend/alembic.ini", "upgrade", "head"],
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        print(f"[backend] migration failed with exit code {exc.returncode}")
        raise SystemExit(exc.returncode) from exc


if __name__ == "__main__":
    run_migrations_if_enabled()
    uvicorn.run(
        "backend.app:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )