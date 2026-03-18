from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from starlette.middleware.sessions import SessionMiddleware
from src.routers.lessons import router as lessons_router
from src.routers.sections import router as sections_router
from src.routers.lesson_tasks import router as lesson_tasks_router
from src.routers.progress import router as progress_router
from src.routers.task_progress import router as task_progress_router
from src.routers.systems import router as systems_router
from src.routers.simulations import router as simulations_router
from src.routers.users import router as users_router
from src.routers.auth import router as auth_router
from src.config import settings
from src.seed import seed_intro
from src.db import SessionLocal

app = FastAPI()


@app.on_event("startup")
def _run_seeds() -> None:
    db = SessionLocal()
    try:
        seed_intro(db)
    finally:
        db.close()

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
BASE_DIR = Path(__file__).resolve().parents[1]
FILES_DIR = BASE_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)
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
