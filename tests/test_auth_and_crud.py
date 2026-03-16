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


def test_avatar_upload_accepts_popular_image_formats(client):
    user = register_user(client, email="avatar@example.com")
    token = login_user(client, email="avatar@example.com")
    headers = auth_headers(token)

    one_pixel_gif = (
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
        b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02L\x01\x00;"
    )

    upload = client.post(
        f"/users/{user['id']}/avatar",
        headers=headers,
        files={"file": ("avatar.gif", one_pixel_gif, "image/gif")},
    )

    assert upload.status_code == status.HTTP_200_OK
    assert upload.json()["avatar_path"].endswith(".gif")


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


def test_systems_duplicate_title_not_allowed(client):
    user = register_user(client, email="system-dup@example.com")
    token = login_user(client, email="system-dup@example.com")
    headers = auth_headers(token)

    create_first = client.post(
        "/systems",
        json={
            "owner_id": user["id"],
            "title": "System A",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=headers,
    )
    assert create_first.status_code == status.HTTP_200_OK

    create_duplicate = client.post(
        "/systems",
        json={
            "owner_id": user["id"],
            "title": "  system   a  ",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=headers,
    )
    assert create_duplicate.status_code == status.HTTP_409_CONFLICT


def test_systems_list_is_scoped_to_current_user(client):
    first_user = register_user(client, email="systems-first@example.com")
    first_token = login_user(client, email="systems-first@example.com")
    first_headers = auth_headers(first_token)

    create_first = client.post(
        "/systems",
        json={
            "owner_id": first_user["id"],
            "title": "First user system",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=first_headers,
    )
    assert create_first.status_code == status.HTTP_200_OK
    first_system_id = create_first.json()["id"]

    second_user = register_user(client, email="systems-second@example.com")
    second_token = login_user(client, email="systems-second@example.com")
    second_headers = auth_headers(second_token)

    second_user_systems = client.get("/systems", headers=second_headers)
    assert second_user_systems.status_code == status.HTTP_200_OK
    assert second_user_systems.json() == []

    create_second = client.post(
        "/systems",
        json={
            "owner_id": second_user["id"],
            "title": "Second user system",
            "graph_json": {"nodes": [], "edges": []},
        },
        headers=second_headers,
    )
    assert create_second.status_code == status.HTTP_200_OK
    second_system_id = create_second.json()["id"]

    first_user_systems = client.get("/systems", headers=first_headers)
    assert first_user_systems.status_code == status.HTTP_200_OK
    assert [item["id"] for item in first_user_systems.json()] == [first_system_id]

    second_user_systems = client.get("/systems", headers=second_headers)
    assert second_user_systems.status_code == status.HTTP_200_OK
    assert [item["id"] for item in second_user_systems.json()] == [second_system_id]


def test_task_templates_create_per_user_copies(client):
    user = register_user(client, email="task-owner@example.com")
    token = login_user(client, email="task-owner@example.com")
    headers = auth_headers(token)

    lesson = client.post(
        "/lessons",
        json={"title": "Task lesson", "content_markdown": "Body"},
        headers=headers,
    )
    assert lesson.status_code == status.HTTP_200_OK
    lesson_id = lesson.json()["id"]

    task = client.post(
        "/lesson-tasks",
        json={"lesson_id": lesson_id, "title": "Model task", "description": "Build the model"},
        headers=headers,
    )
    assert task.status_code == status.HTTP_200_OK
    task_payload = task.json()
    template_id = task_payload["system_id"]
    assert isinstance(template_id, int)

    systems_before_start = client.get("/systems", headers=headers)
    assert systems_before_start.status_code == status.HTTP_200_OK
    assert systems_before_start.json() == []

    template_access = client.get(f"/systems/{template_id}", headers=headers)
    assert template_access.status_code == status.HTTP_403_FORBIDDEN

    start_first = client.post(f"/lesson-tasks/{task_payload['id']}/start", headers=headers)
    assert start_first.status_code == status.HTTP_200_OK
    first_copy = start_first.json()
    assert first_copy["owner_id"] == user["id"]
    assert first_copy["source_system_id"] == template_id
    assert first_copy["is_template"] is False

    start_again = client.post(f"/lesson-tasks/{task_payload['id']}/start", headers=headers)
    assert start_again.status_code == status.HTTP_200_OK
    assert start_again.json()["id"] == first_copy["id"]

    systems_after_start = client.get("/systems", headers=headers)
    assert systems_after_start.status_code == status.HTTP_200_OK
    assert [item["id"] for item in systems_after_start.json()] == [first_copy["id"]]

    second_user = register_user(client, email="task-second@example.com")
    second_token = login_user(client, email="task-second@example.com")
    second_headers = auth_headers(second_token)

    second_start = client.post(f"/lesson-tasks/{task_payload['id']}/start", headers=second_headers)
    assert second_start.status_code == status.HTTP_200_OK
    second_copy = second_start.json()
    assert second_copy["owner_id"] == second_user["id"]
    assert second_copy["source_system_id"] == template_id
    assert second_copy["id"] != first_copy["id"]

    second_systems = client.get("/systems", headers=second_headers)
    assert second_systems.status_code == status.HTTP_200_OK
    assert [item["id"] for item in second_systems.json()] == [second_copy["id"]]

    first_user_systems = client.get("/systems", headers=headers)
    assert first_user_systems.status_code == status.HTTP_200_OK
    assert [item["id"] for item in first_user_systems.json()] == [first_copy["id"]]


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
    register_user(client, email="progress@example.com")
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
    assert summary.json()["total_tasks"] == 0
    assert summary.json()["completed_tasks"] == 0
    assert summary.json()["total_lessons"] == 1
    assert summary.json()["completed_lessons"] == 0
    assert summary.json()["progress_percent"] == 100.0

    first_task = client.post(
        "/lesson-tasks",
        json={"lesson_id": lesson_id, "title": "Task 1", "description": "First task"},
        headers=headers,
    )
    assert first_task.status_code == status.HTTP_200_OK
    first_task_id = first_task.json()["id"]

    second_task = client.post(
        "/lesson-tasks",
        json={"lesson_id": lesson_id, "title": "Task 2", "description": "Second task"},
        headers=headers,
    )
    assert second_task.status_code == status.HTTP_200_OK
    second_task_id = second_task.json()["id"]

    summary = client.get("/progress", headers=headers)
    assert summary.status_code == status.HTTP_200_OK
    assert summary.json()["total_tasks"] == 2
    assert summary.json()["completed_tasks"] == 0
    assert summary.json()["total_lessons"] == 1
    assert summary.json()["completed_lessons"] == 0
    assert summary.json()["progress_percent"] == 0.0

    complete_first_task = client.post(f"/task-progress/{first_task_id}/complete", headers=headers)
    assert complete_first_task.status_code == status.HTTP_200_OK

    summary = client.get("/progress", headers=headers)
    assert summary.status_code == status.HTTP_200_OK
    assert summary.json()["total_tasks"] == 2
    assert summary.json()["completed_tasks"] == 1
    assert summary.json()["total_lessons"] == 1
    assert summary.json()["completed_lessons"] == 0
    assert summary.json()["progress_percent"] == 50.0

    complete_second_task = client.post(f"/task-progress/{second_task_id}/complete", headers=headers)
    assert complete_second_task.status_code == status.HTTP_200_OK

    summary = client.get("/progress", headers=headers)
    assert summary.status_code == status.HTTP_200_OK
    assert summary.json()["total_tasks"] == 2
    assert summary.json()["completed_tasks"] == 2
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
