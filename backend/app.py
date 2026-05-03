from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from backend.routers.lessons import router as lessons_router
from backend.routers.sections import router as sections_router
from backend.routers.lesson_tasks import router as lesson_tasks_router
from backend.routers.progress import router as progress_router
from backend.routers.task_progress import router as task_progress_router
from backend.routers.systems import router as systems_router
from backend.routers.simulations import router as simulations_router
from backend.routers.users import router as users_router
from backend.routers.auth import router as auth_router
from backend.routers.notifications import router as notifications_router
from backend.routers.settings import router as settings_router
from backend.config import settings
from backend.seed import run_seed
from backend.storage_paths import get_files_dir
from backend.utils.errors import DomainError, domain_error_handler

app = FastAPI()
app.add_exception_handler(DomainError, domain_error_handler)


@app.on_event("startup")
def run_startup_seed() -> None:
    """Idempotent: Intro + systems-thinking sections/lessons/tasks (see backend/seed.py)."""
    run_seed()

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
FILES_DIR = get_files_dir()
app.mount("/files", StaticFiles(directory=FILES_DIR), name="files")

app.include_router(lessons_router)
app.include_router(sections_router)
app.include_router(lesson_tasks_router)
app.include_router(progress_router)
app.include_router(task_progress_router)
app.include_router(systems_router)
app.include_router(simulations_router)
app.include_router(users_router)
app.include_router(auth_router)
app.include_router(notifications_router)
app.include_router(settings_router)
