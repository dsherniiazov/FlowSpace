import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app import app
from backend.db import Base
from backend.utils.dependencies import get_db


@pytest.fixture(scope="session")
def engine():
    db_url = os.getenv("TEST_DB_URL") or os.getenv("DB_URL")
    if not db_url or not db_url.startswith("postgresql"):
        pytest.skip("Postgres DB_URL required for tests")
    engine = create_engine(db_url)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_schema(engine):
    schema = f"test_{uuid.uuid4().hex}"
    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.execute(text(f'SET search_path TO "{schema}"'))
        Base.metadata.create_all(bind=conn)
        conn.commit()

    yield schema

    with engine.connect() as conn:
        conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        conn.commit()


@pytest.fixture()
def client(engine, db_schema):
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_db():
        db = SessionLocal()
        db.execute(text(f'SET search_path TO "{db_schema}"'))
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
