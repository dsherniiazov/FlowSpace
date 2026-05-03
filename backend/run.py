import logging
import subprocess

import uvicorn

from backend.config import settings


logger = logging.getLogger(__name__)


def run_migrations_if_enabled() -> None:
    if not settings.RUN_MIGRATIONS:
        return
    logger.info("RUN_MIGRATIONS=true; applying alembic migrations")
    try:
        subprocess.run(
            ["alembic", "-c", "backend/alembic.ini", "upgrade", "head"],
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        logger.exception("Migration failed with exit code %s", exc.returncode)
        raise SystemExit(exc.returncode) from exc


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations_if_enabled()
    uvicorn.run(
        "backend.app:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )
