from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class RunStepCreate(BaseModel):
    step_index: int = Field(ge=0)
    time: float
    values: dict


class RunCreate(BaseModel):
    model_id: int | None = None
    graph_json: dict | None = None
    dt: float = Field(gt=0)
    steps: int = Field(gt=0)
    engine_version: str = "euler_v1"
    seed: int | None = None
    steps_data: list[RunStepCreate]


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    model_id: int | None
    dt: float
    steps: int
    engine_version: str
    seed: int | None
    status: str
    duration_ms: int | None
    error_message: str | None
    created_at: datetime


class RunDetail(RunSummary):
    model_snapshot: dict


class RunStepPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_index: int
    time: float
    values: dict
