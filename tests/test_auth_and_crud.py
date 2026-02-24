from fastapi import status
from math import isclose


def register_user(client, email="user@example.com", password="secret123"):
    payload = {
        "email": email,
        "name": "Test",
        "last_name": "User",
        "password": password,
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == status.HTTP_200_OK
    return response.json()


def login_user(client, email="user@example.com", password="secret123"):
    response = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_register_and_login(client):
    register_user(client, email="auth1@example.com")
    token = login_user(client, email="auth1@example.com")
    assert token


def test_register_duplicate_email(client):
    register_user(client, email="dup@example.com")
    response = client.post(
        "/auth/register",
        json={
            "email": "dup@example.com",
            "name": "Test",
            "last_name": "User",
            "password": "secret123",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_protected_requires_auth(client):
    response = client.get("/lessons")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_lessons_crud(client):
    user = register_user(client, email="lesson@example.com")
    token = login_user(client, email="lesson@example.com")
    headers = auth_headers(token)

    create = client.post(
        "/lessons",
        json={"title": "Intro", "content_markdown": "Hello"},
        headers=headers,
    )
    assert create.status_code == status.HTTP_200_OK
    lesson_id = create.json()["id"]

    update = client.put(
        f"/lessons/{lesson_id}",
        json={"title": "Updated"},
        headers=headers,
    )
    assert update.status_code == status.HTTP_200_OK
    assert update.json()["title"] == "Updated"

    get_one = client.get(f"/lessons/{lesson_id}", headers=headers)
    assert get_one.status_code == status.HTTP_200_OK

    delete = client.delete(f"/lessons/{lesson_id}", headers=headers)
    assert delete.status_code == status.HTTP_200_OK


def test_systems_crud(client):
    user = register_user(client, email="system@example.com")
    token = login_user(client, email="system@example.com")
    headers = auth_headers(token)

    create = client.post(
        "/systems",
        json={
            "owner_id": user["id"],
            "title": "System A",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=headers,
    )
    assert create.status_code == status.HTTP_200_OK
    system_id = create.json()["id"]

    update = client.put(
        f"/systems/{system_id}",
        json={"title": "System B"},
        headers=headers,
    )
    assert update.status_code == status.HTTP_200_OK
    assert update.json()["title"] == "System B"

    delete = client.delete(f"/systems/{system_id}", headers=headers)
    assert delete.status_code == status.HTTP_200_OK


def test_runs_flow(client):
    user = register_user(client, email="sim@example.com")
    token = login_user(client, email="sim@example.com")
    headers = auth_headers(token)

    system = client.post(
        "/systems",
        json={
            "owner_id": user["id"],
            "title": "Sim System",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=headers,
    )
    system_id = system.json()["id"]

    create = client.post(
        "/runs",
        json={
            "model_id": system_id,
            "dt": 0.1,
            "steps": 3,
            "steps_data": [
                {"step_index": 0, "time": 0.0, "values": {"x": 1}},
                {"step_index": 1, "time": 0.1, "values": {"x": 2}},
                {"step_index": 2, "time": 0.2, "values": {"x": 3}},
            ],
        },
        headers=headers,
    )
    assert create.status_code == status.HTTP_200_OK
    run_id = create.json()["id"]
    assert create.json()["status"] == "completed"

    list_runs = client.get("/runs", headers=headers)
    assert list_runs.status_code == status.HTTP_200_OK
    assert any(run["id"] == run_id for run in list_runs.json())

    get_run = client.get(f"/runs/{run_id}", headers=headers)
    assert get_run.status_code == status.HTTP_200_OK
    assert get_run.json()["id"] == run_id

    list_steps = client.get(f"/runs/{run_id}/steps", headers=headers)
    assert list_steps.status_code == status.HTTP_200_OK
    assert len(list_steps.json()) == 3

    step = client.get(f"/runs/{run_id}/steps/1", headers=headers)
    assert step.status_code == status.HTTP_200_OK
    assert step.json()["step_index"] == 1

    delete = client.delete(f"/runs/{run_id}", headers=headers)
    assert delete.status_code == status.HTTP_200_OK


def test_progress_summary(client):
    user = register_user(client, email="progress@example.com")
    token = login_user(client, email="progress@example.com")
    headers = auth_headers(token)

    lesson = client.post(
        "/lessons",
        json={"title": "Progress", "content_markdown": "Body"},
        headers=headers,
    )
    lesson_id = lesson.json()["id"]

    summary = client.get("/progress", headers=headers)
    assert summary.status_code == status.HTTP_200_OK
    assert summary.json()["total_lessons"] == 1
    assert summary.json()["completed_lessons"] == 0
    assert summary.json()["progress_percent"] == 0.0

    complete = client.post(f"/progress/{lesson_id}/complete", headers=headers)
    assert complete.status_code == status.HTTP_200_OK

    summary = client.get("/progress", headers=headers)
    assert summary.status_code == status.HTTP_200_OK
    assert summary.json()["total_lessons"] == 1
    assert summary.json()["completed_lessons"] == 1
    assert summary.json()["progress_percent"] == 100.0

    completed = client.get("/progress/completed", headers=headers)
    assert completed.status_code == status.HTTP_200_OK
    assert any(item["lesson_id"] == lesson_id for item in completed.json())


def test_runs_auto_simulation_euler(client):
    user = register_user(client, email="sim-euler@example.com")
    token = login_user(client, email="sim-euler@example.com")
    headers = auth_headers(token)

    create = client.post(
        "/runs",
        json={
            "graph_json": {
                "nodes": [{"id": "x", "initial": 1.0, "decay": 1.0, "bias": 0.0}],
                "edges": [],
            },
            "dt": 0.1,
            "steps": 3,
            "engine_version": "euler_v1",
        },
        headers=headers,
    )
    assert create.status_code == status.HTTP_200_OK
    assert create.json()["status"] == "completed"

    run_id = create.json()["id"]
    list_steps = client.get(f"/runs/{run_id}/steps", headers=headers)
    assert list_steps.status_code == status.HTTP_200_OK
    steps = list_steps.json()
    assert len(steps) == 3

    assert isclose(steps[0]["values"]["x"], 1.0, rel_tol=0.0, abs_tol=1e-12)
    assert isclose(steps[1]["values"]["x"], 0.9, rel_tol=0.0, abs_tol=1e-12)
    assert isclose(steps[2]["values"]["x"], 0.81, rel_tol=0.0, abs_tol=1e-12)


def test_runs_auto_simulation_rk4(client):
    user = register_user(client, email="sim-rk4@example.com")
    token = login_user(client, email="sim-rk4@example.com")
    headers = auth_headers(token)

    create = client.post(
        "/runs",
        json={
            "graph_json": {
                "nodes": [{"id": "x", "initial": 1.0, "decay": 1.0, "bias": 0.0}],
                "edges": [],
            },
            "dt": 0.1,
            "steps": 3,
            "engine_version": "rk4_v1",
        },
        headers=headers,
    )
    assert create.status_code == status.HTTP_200_OK
    assert create.json()["status"] == "completed"

    run_id = create.json()["id"]
    list_steps = client.get(f"/runs/{run_id}/steps", headers=headers)
    assert list_steps.status_code == status.HTTP_200_OK
    steps = list_steps.json()
    assert len(steps) == 3

    assert isclose(steps[0]["values"]["x"], 1.0, rel_tol=0.0, abs_tol=1e-12)
    assert isclose(steps[1]["values"]["x"], 0.9048375, rel_tol=0.0, abs_tol=1e-7)
    assert isclose(steps[2]["values"]["x"], 0.8187309014, rel_tol=0.0, abs_tol=1e-7)
