import os
import subprocess
import time
import uvicorn


def run_migrations_with_retry():
    attempts = 10
    delay_seconds = 2
    last_error = None
    for _ in range(attempts):
        try:
            subprocess.run(["alembic", "upgrade", "head"], check=True)
            return
        except subprocess.CalledProcessError as exc:
            last_error = exc
            time.sleep(delay_seconds)
    raise last_error


if os.getenv("RUN_MIGRATIONS") == "true":
    run_migrations_with_retry()

if __name__ == "__main__":
    uvicorn.run("src:app", host="0.0.0.0", port=8000, reload=True)
