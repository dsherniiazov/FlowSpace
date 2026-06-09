# FlowSpace

A web application for teaching systems thinking.

**Installation options:**

- [Docker Compose (Recommended)](#docker-compose-installation)
- [Local Installation](#local-installation)

---

## Prerequisites

Before installing FlowSpace, ensure that the following software is installed on your system:

- **Docker and Docker Compose** (for Docker-based installation)
- **Python 3.13+** and **Node.js 22+** (for local development)
- **PostgreSQL 17** (required for local installation; provided automatically in Docker)
- Git

---

## Environment Variables

FlowSpace requires several environment variables to be configured before running. These variables control database connectivity, security, and application behaviour.

The following variables are particularly important:

| Variable              | Required | Description                                                                 | Recommended Value (Docker)                  | Recommended Value (Local)                     | Notes |
|-----------------------|----------|-----------------------------------------------------------------------------|---------------------------------------------|-----------------------------------------------|-------|
| `DB_URL`              | Yes      | Full PostgreSQL connection string using the `psycopg` dialect.              | `postgresql+psycopg://admin:admin@db:5432/flowspace` | `postgresql+psycopg://admin:admin@localhost:5432/flowspace` | The most critical variable. In Docker Compose, the hostname must be `db` (the service name). Using `localhost` inside containers will cause connection failures. |
| `SECRET_KEY`          | Yes      | Cryptographic secret used to sign and verify JWT authentication tokens.     | A long, random, secure string (minimum 32 characters) | Same as Docker                              | Must be unique and kept confidential. Weak or default values pose a serious security risk. |
| `RUN_MIGRATIONS`      | No       | When set to `true`, the application automatically applies pending Alembic database migrations on startup. | `true` (first run)                          | `true` (first run)                            | Recommended for development and initial deployment. In production, it is preferable to run migrations explicitly rather than automatically. |
| `CORS_ORIGINS`        | No       | Comma-separated list of allowed origins for Cross-Origin Resource Sharing.  | `http://localhost:5173,http://127.0.0.1:5173` | Same as Docker                                | Must include the exact URL where the frontend is served. Missing origins will result in CORS errors in the browser. |
| `BACKEND_HOST`        | No       | Network interface to which the backend server binds.                        | `0.0.0.0`                                   | `127.0.0.1` or `0.0.0.0`                      | Must be `0.0.0.0` when running inside Docker or when the application needs to be accessible from outside the host machine. |
| `BACKEND_PORT`        | No       | Port on which the backend API listens.                                      | `8000`                                      | `8000`                                        | Must match the port exposed in Docker Compose and any reverse proxy configuration. |
| `RELOAD`              | No       | Enables automatic server restart when Python files are changed (hot reload). | `false`                                     | `false` (or `true` during active development) | Useful only for local development. Increases resource usage and is not recommended inside Docker containers. |

### Optional Environment Variables

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Required to enable Google OAuth login buttons. If left empty, Google authentication will be disabled.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — Required to enable GitHub OAuth login buttons.
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — Required to enable password reset emails and other transactional emails. If not configured, email-based features will be unavailable.
- `FILES_HOST_DIR` — Host directory mounted into the container for persistent file storage (avatars, exports, etc.). Used only in Docker Compose.

---

## Docker Compose Installation

This is the recommended method for most users.

### Steps

1. Extract the provided archive and navigate into the project root directory (e.g. `cd flowspace`).

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit the `.env` file and configure at minimum the following variables:

   ```env
   SECRET_KEY=your-long-random-secret-key-here
   DB_URL=postgresql+psycopg://admin:admin@db:5432/flowspace
   RUN_MIGRATIONS=true
   RELOAD=false
   ```

4. Build and start all services:

   ```bash
   docker compose up -d --build
   ```

5. Wait for the containers to initialise (typically 30–60 seconds on first run). The application will automatically apply migrations and seed initial learning content.

6. Access the application:

   - Frontend: [http://localhost:5173](http://localhost:5173)
   - API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Local Installation

This method is suitable for active development of the backend or frontend.

Extract the provided archive and open the project root directory in your terminal (e.g. `cd flowspace`).

### Backend

1. Create and activate a Python virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Configure the `.env` file for local use (example):

   ```env
   DB_URL=postgresql+psycopg://admin:admin@localhost:5432/flowspace
   SECRET_KEY=dev-secret-key-change-in-production
   RUN_MIGRATIONS=true
   ```

4. Start the backend:

   ```bash
   python -m backend.run
   ```

### Frontend

Open a new terminal and run:

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

---

## Post-Installation Notes

- On first startup, the application automatically seeds introductory lessons and systems-thinking content.
- If `RUN_MIGRATIONS=true` was not set in the `.env` file, database migrations can be applied manually using:

  ```bash
  alembic -c backend/alembic.ini upgrade head
  ```

- To generate a new migration after model changes:

  ```bash
  alembic -c backend/alembic.ini revision --autogenerate -m "description of changes"
  ```

---

## Troubleshooting

**Connection refused to the database**

- Verify that `DB_URL` uses the correct hostname (`db` inside Docker Compose, `localhost` for local installation).
- Ensure PostgreSQL is running when using local installation.

**CORS errors in the browser console**

- Add the frontend URL to the `CORS_ORIGINS` variable and restart the backend.

**Authentication not working**

- Ensure `SECRET_KEY` is set to a strong, unique value.

**OAuth buttons are missing**

- OAuth provider credentials (`GOOGLE_*` or `GITHUB_*`) must be configured in `.env`.

**Changes not visible after code modifications (Docker)**

- Rebuild the images using `docker compose up -d --build`.
