from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.models.users import User
from backend.schemas.simulations import RunCreate, RunDetail, RunStepPublic, RunSummary
from backend.services.simulation import SimulationRunService
from backend.services.system import SystemModelService
from backend.utils.dependencies import get_db
from backend.utils.errors import ValidationError

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[RunSummary])
def list_runs(
    model_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SimulationRunService.list_for_user(db, user_id=current_user.id, model_id=model_id)


@router.get("/{run_id}", response_model=RunDetail)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SimulationRunService.get_for_user(db, run_id, current_user.id)


@router.post("", response_model=RunDetail)
def create_run(
    data: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if bool(data.model_id) == bool(data.graph_json):
        raise ValidationError("Provide exactly one of model_id or graph_json")

    if data.model_id:
        model = SystemModelService.get(db, data.model_id)
        SystemModelService.ensure_view_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        model_snapshot = model.graph_json
        model_id: int | None = model.id
    else:
        model_snapshot = data.graph_json or {}
        model_id = None

    return SimulationRunService.create_run(
        db,
        user_id=current_user.id,
        model_id=model_id,
        model_snapshot=model_snapshot,
        dt=data.dt,
        steps=data.steps,
        engine_version=data.engine_version,
        seed=data.seed,
        steps_data=[step.model_dump() for step in data.steps_data],
    )


@router.get("/{run_id}/steps", response_model=list[RunStepPublic])
def list_steps(
    run_id: int,
    from_index: int | None = Query(default=None, alias="from"),
    to_index: int | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    SimulationRunService.get_for_user(db, run_id, current_user.id)
    return SimulationRunService.list_steps(db, run_id, from_index=from_index, to_index=to_index)


@router.get("/{run_id}/steps/{step_index}", response_model=RunStepPublic)
def get_step(
    run_id: int,
    step_index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    SimulationRunService.get_for_user(db, run_id, current_user.id)
    return SimulationRunService.get_step(db, run_id, step_index)


@router.delete("/{run_id}", response_model=RunSummary)
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SimulationRunService.delete(db, run_id, current_user.id)
