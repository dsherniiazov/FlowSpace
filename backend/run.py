import logging
import subprocess
import time

import uvicorn
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from backend.config import settings


logger = logging.getLogger(__name__)


def wait_for_database(max_attempts: int = 30, delay: float = 1.0) -> None:
    engine = create_engine(settings.db_url)
    logger.info("Waiting for database to become available...")

    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is ready (attempt %d)", attempt)
            return
        except OperationalError:
            if attempt == 1:
                logger.info("Database not ready yet, retrying...")
            time.sleep(delay)
        except Exception as exc:
            logger.exception("Unexpected error while waiting for database")
            raise

    raise RuntimeError(
        f"Could not connect to the database after {max_attempts} attempts. "
        "Please ensure PostgreSQL is running and DB_URL is correct."
    )


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
    wait_for_database()
    run_migrations_if_enabled()
    uvicorn.run(
        "backend.app:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=settings.reload,
    )
