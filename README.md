# FlowSpace

FlowSpace is a full-stack educational simulation platform:
- `backend`: FastAPI + SQLAlchemy + Alembic + PostgreSQL
- `frontend`: React + TypeScript + Vite

This guide is designed for a clean first-time setup and day-to-day development.

## Table of Contents

1. [What You Get](#what-you-get)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Quick Start (Docker, Recommended)](#quick-start-docker-recommended)
6. [Local Development (Without Docker)](#local-development-without-docker)
7. [Environment Variables](#environment-variables)
8. [Database Migrations](#database-migrations)
9. [Running Tests](#running-tests)
10. [OAuth Setup (Google/GitHub)](#oauth-setup-googlegithub)
11. [Useful Endpoints](#useful-endpoints)
12. [Troubleshooting](#troubleshooting)

## What You Get

- JWT authentication (email/password)
- OAuth login support (Google, GitHub)
- Lesson/task/system management APIs
- Simulation runs API
- React frontend UI (Vite dev server)
- Alembic migrations for schema management

## Tech Stack

### Backend
- Python `3.13`
- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL 17

### Frontend
- Node.js `22` (recommended)
- React 18
- TypeScript
- Vite 5

## Project Structure

```text
FlowSpace/
├─ src/                   # Backend application code
├─ alembic/               # DB migrations
├─ tests/                 # Backend tests
├─ frontend/              # Frontend app
├─ run.py                 # Backend entrypoint (runs migrations optionally)
├─ docker-compose.yml     # Full stack (db + api + frontend)
└─ docker-compose.test.yml# Test stack
```

## Prerequisites

Install before you start:
- Docker + Docker Compose (for easiest setup)
- OR for local run:
  - Python `3.13`
  - Node.js `22`
  - PostgreSQL `17` (or compatible)

## Quick Start (Docker, Recommended)

This is the fastest way to run everything from zero.

1. Clone repository and open it:
   ```bash
   git clone <your-repo-url>
   cd FlowSpace
   ```
2. Start all services:
   ```bash
   docker compose up --build
   ```
3. Open apps:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:8000`
   - Swagger docs: `http://localhost:8000/docs`
4. Stop services:
   ```bash
   docker compose down
   ```

Notes:
- Backend uses `.env.docker` in Docker mode.
- Database migrations run automatically in container startup (`RUN_MIGRATIONS=true`).

## Local Development (Without Docker)

Run backend and frontend separately for fastest iteration.

### 1. Backend setup

1. Create backend env file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set at least:
   - `DB_URL` to your local PostgreSQL
   - `SECRET_KEY` to a strong random value
3. Create virtual environment and install dependencies:
   ```bash
   python3.13 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. Run migrations:
   ```bash
   alembic upgrade head
   ```
5. Start backend:
   ```bash
   python run.py
   ```

Backend runs on `http://localhost:8000`.

### 2. Frontend setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Create frontend env file:
   ```bash
   cp .env.example .env.local
   ```
3. Start frontend dev server:
   ```bash
   npm run dev
   ```

Frontend runs on `http://localhost:5173`.

## Environment Variables

### Backend (`.env`)

Use `.env.example` as a template.

Required:
- `DB_URL`
- `SECRET_KEY`

Commonly used:
- `RUN_MIGRATIONS` (`true`/`false`)
- `ALGORITHM` (default `HS256`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default `300`)
- `DB_ECHO` (`true` for SQL logs)
- `CORS_ORIGINS` (comma-separated)

Optional (OAuth):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

### Frontend (`frontend/.env.local`)

Use `frontend/.env.example` as a template.

- `VITE_API_BASE_URL` (default `http://localhost:8000`)
- `VITE_ADMIN_EMAILS` (comma-separated list of admin emails)

## Database Migrations

Apply latest migrations:

```bash
alembic upgrade head
```

Create a new migration after model changes:

```bash
alembic revision --autogenerate -m "describe_change"
```

Rollback one migration:

```bash
alembic downgrade -1
```

## Running Tests

### Option A: Local

```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

### Option B: Docker test stack

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

## OAuth Setup (Google/GitHub)

OAuth is optional. Email/password auth works without it.

Configure provider credentials in backend `.env`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

Use these callback URLs in provider settings:
- Google: `http://localhost:8000/auth/oauth/google/callback`
- GitHub: `http://localhost:8000/auth/oauth/github/callback`

## Useful Endpoints

- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /openapi.json`
- Auth login: `POST /auth/login`
- Auth register: `POST /auth/register`
- OAuth start: `GET /auth/oauth/{provider}/login`

Main authenticated resource groups:
- `/users`
- `/systems`
- `/lessons`
- `/sections`
- `/lesson-tasks`
- `/progress`
- `/task-progress`
- `/runs`

## Troubleshooting

### Database connection error on startup

- Verify PostgreSQL is running.
- Check `DB_URL` host/port/credentials.
- For Docker mode, host must be `db` (not `localhost`).

### CORS errors in browser

- Ensure frontend URL is included in backend `CORS_ORIGINS`.
- Default local values include `http://localhost:5173` and `http://127.0.0.1:5173`.

### OAuth says provider not configured

- Missing or empty provider credentials in `.env`.
- Restart backend after changing env vars.

### Port already in use

- Backend default: `8000`
- Frontend default: `5173`
- PostgreSQL default: `5432`

Stop conflicting processes or remap ports.

## Development Best Practices Used in This Project

- Keep secrets out of git (`.env` is ignored).
- Use migration files for all schema changes.
- Keep local and Docker environments consistent.
- Prefer `RUN_MIGRATIONS=false` in production and run migrations explicitly in CI/CD.
