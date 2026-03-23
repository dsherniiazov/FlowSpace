# FlowSpace

FlowSpace is a full-stack educational simulation platform.

- Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL
- Frontend: React + TypeScript + Vite

For expanded step-by-step instructions (including hosting context), see:

- <https://davinci.fmph.uniba.sk/~sherniiazov1/docs/index.html>

## Contents

1. Overview
2. Tech Stack
3. Project Structure
4. Prerequisites
5. Docker Deployment on Localhost
6. Docker Deployment on a Server and Domain
7. Local Deployment Without Docker
8. Environment Variables
9. Database Migrations
10. Testing
11. Troubleshooting
12. Security and Deployment Best Practices

## Overview

Main features:

- JWT authentication with email/password
- Optional OAuth login (Google and GitHub)
- Lessons, tasks, systems, progress, simulation runs
- Auto-seeding of initial learning content
- Docker-first workflow

## Tech Stack

Backend:

- Python 3.13
- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL 17

Frontend:

- Node.js 22
- React 18
- TypeScript
- Vite 5

## Project Structure

~~~text
flowspace_dev/
├─ backend/
│  ├─ alembic/
│  ├─ alembic.ini
│  ├─ run.py
│  └─ Dockerfile
├─ frontend/
├─ test/
│  ├─ backend/
│  └─ frontend/
├─ docker-compose.yml
├─ requirements.txt
├─ .env.example
└─ .env
~~~

## Prerequisites

For Docker deployment:

- Docker Engine 24+
- Docker Compose v2

For local non-Docker deployment:

- Python 3.13
- Node.js 22
- PostgreSQL 17

## Docker Deployment on Localhost

This is the recommended path for development and quick validation.

1. Clone repository.

~~~bash
git clone <repo-url>
cd flowspace_dev
~~~

1. Create environment file.

~~~bash
cp .env.example .env
~~~

1. Ensure Docker-safe bind host in .env.

- BACKEND_HOST must be 0.0.0.0 in Docker
- DB_URL host must be db (service name), not localhost

1. Build and start all services.

~~~bash
docker compose up -d --build
~~~

1. Verify services.

~~~bash
docker compose ps
~~~

1. Open application.

- Frontend: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>

1. Stop stack when needed.

~~~bash
docker compose down
~~~

## Docker Deployment on a Server and Domain

This section describes a production-style deployment using Docker Compose.

### A. Server Preparation

1. Prepare Linux server (Ubuntu/Debian recommended).
2. Install Docker and Compose plugin.
3. Open firewall ports:

- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS)

Only expose 5173 and 8000 directly if you explicitly need them.

### B. DNS Setup

Create DNS records pointing to server IP.

Typical options:

- app.example.com -> frontend
- api.example.com -> backend

Or use one domain and route by reverse proxy paths.

### C. Application Configuration

Use .env in project root.

Important values for Docker on server:

- BACKEND_HOST=0.0.0.0
- BACKEND_PORT=8000
- RUN_MIGRATIONS=true for first deploy
- DB_URL=postgresql+psycopg://admin:admin@db:5432/flowspace
- CORS_ORIGINS must include your real frontend domain(s)

Example:

~~~dotenv
CORS_ORIGINS=https://app.example.com,https://www.app.example.com
~~~

### D. Start Services

~~~bash
docker compose up -d --build
~~~

### E. Reverse Proxy and TLS

Recommended: place Nginx or Caddy in front of containers.

Example Nginx virtual host approach:

- app.example.com -> proxy to frontend:5173
- api.example.com -> proxy to api:8000

Then issue TLS certificates (for example, Certbot for Nginx).

If you prefer one domain, route by path:

- / -> frontend
- /api -> backend

In that case, make sure frontend API base URL aligns with proxy routing.

### F. Post-Deploy Validation

Check:

- <https://api.example.com/docs> opens
- Frontend can login/register
- No CORS errors in browser console
- docker compose logs api has no startup exceptions

## Local Deployment Without Docker

Use this mode when you need direct backend/frontend debugging.

### 1. Backend

~~~bash
cp .env.example .env
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic -c backend/alembic.ini upgrade head
python -m backend.run
~~~

Backend runs on <http://localhost:8000>

### 2. Frontend

~~~bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
~~~

Frontend runs on <http://localhost:5173>

## Environment Variables

Use .env.example as source of truth.

Core required:

- DB_URL
- SECRET_KEY

Runtime:

- RUN_MIGRATIONS
- BACKEND_HOST
- BACKEND_PORT
- CORS_ORIGINS

Storage:

- FILES_DIR
- FILES_HOST_DIR (used by docker-compose bind mount)

Optional OAuth:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET

Note about OAuth buttons:

- Login/register pages show Google or GitHub buttons only when matching provider credentials are configured on backend.

## Database Migrations

Apply latest:

~~~bash
alembic -c backend/alembic.ini upgrade head
~~~

Create new migration:

~~~bash
alembic -c backend/alembic.ini revision --autogenerate -m "describe_change"
~~~

Rollback one revision:

~~~bash
alembic -c backend/alembic.ini downgrade -1
~~~

## Testing

Backend tests:

~~~bash
pytest -q test/backend
~~~

Docker smoke check:

~~~bash
docker compose up -d --build
docker compose logs --tail=100 api
~~~

## Troubleshooting

### Error: Cannot assign requested address

Symptom:

- backend log contains Errno 99

Cause:

- BACKEND_HOST set to external host IP inside Docker container

Fix:

- set BACKEND_HOST=0.0.0.0

### CORS errors in browser

Cause:

- frontend origin missing in CORS_ORIGINS

Fix:

- add exact frontend URL(s) to CORS_ORIGINS and restart api

### OAuth provider not configured

Cause:

- provider keys are empty or commented out

Fix:

- set provider credentials in .env and restart api

### DB schema errors on startup

Cause:

- migrations not applied

Fix:

- set RUN_MIGRATIONS=true in Docker, or run alembic upgrade head manually

## Security and Deployment Best Practices

- Keep .env out of git and use strong SECRET_KEY in production.
- Use HTTPS on public deployments.
- Restrict CORS_ORIGINS to real domains only.
- Prefer reverse proxy (Nginx/Caddy) over exposing internal service ports directly.
- Keep RUN_MIGRATIONS=true for bootstrap, then move to explicit migration step in CI/CD for controlled production rollouts.

## More Detailed Documentation

- <https://davinci.fmph.uniba.sk/~sherniiazov1/docs/index.html>
