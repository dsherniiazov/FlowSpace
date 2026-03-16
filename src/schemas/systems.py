from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemCreate(BaseModel):
    owner_id: int | None = None
    lesson_id: int | None = None
    title: str
    graph_json: dict
    is_public: bool = False
    is_template: bool = False


class SystemUpdate(BaseModel):
    title: str | None = None
    graph_json: dict | None = None
    owner_id: int | None = None
    lesson_id: int | None = None
    source_system_id: int | None = None
    is_public: bool | None = None
    is_template: bool | None = None


class SystemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int | None = None
    lesson_id: int | None = None
    source_system_id: int | None = None
    title: str
    graph_json: dict
    is_public: bool | None = None
    is_template: bool | None = None
    created_at: datetime | None = None
