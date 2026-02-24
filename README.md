# FlowSpace-backend

Backend API built with FastAPI + SQLAlchemy.

## Prerequisites

- Python 3.13 (matches Docker image)
- PostgreSQL (local install) or Docker (for DB or full stack)
- Docker + Docker Compose (only for Docker setup)

## Environment

Create a `.env` file in the repo root:

```
DB_URL=postgresql+psycopg://admin:admin@localhost:5432/flowspace
RUN_MIGRATIONS=true
```

Notes:
- `RUN_MIGRATIONS=true` runs Alembic migrations on startup via `run.py`.
- When running via Docker Compose, use `db` instead of `localhost`:

```
DB_URL=postgresql+psycopg://admin:admin@db:5432/flowspace
RUN_MIGRATIONS=true
```

## Run locally (API on host)

1. Create and activate a virtualenv:
   - `python -m venv .venv`
   - `source .venv/bin/activate`
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Start a PostgreSQL database:
   - Local install, or
   - Docker DB only: `docker compose up -d db`
4. Ensure `.env` uses `localhost` in `DB_URL`.
5. (Optional) Run migrations manually:
   - `alembic upgrade head`
6. Start the API:
   - `python run.py`

The API will be available on `http://localhost:8000` and health check on
`http://localhost:8000/health`.

## Run with Docker Compose (API + DB)

1. Ensure `.env` uses `db` as the host in `DB_URL` (see above).
2. Build and start:
   - `docker compose up --build`
3. Stop containers:
   - `docker compose down`

The API will be available on `http://localhost:8000`.
