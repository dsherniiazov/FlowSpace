from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.services.simulation import SimulationRunService
from backend.schemas.simulations import RunCreate, RunDetail, RunStepPublic, RunSummary
from backend.auth.dependencies import get_current_user
from backend.models.users import User
from backend.services.system import SystemAccessDeniedError, SystemModelService
from backend.services.simulation_engine import simulate
from backend.utils.dependencies import get_db

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
    try:
        return SimulationRunService.get_for_user(db, run_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("", response_model=RunDetail)
def create_run(
    data: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.model_id and not data.graph_json:
        raise HTTPException(status_code=400, detail="model_id or graph_json required")
    if data.model_id and data.graph_json:
        raise HTTPException(status_code=400, detail="Provide only one of model_id or graph_json")

    if data.model_id:
        try:
            model = SystemModelService.get(db, data.model_id)
            SystemModelService.ensure_view_access(model, current_user.id, is_admin=bool(current_user.is_admin))
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        except SystemAccessDeniedError as e:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        model_snapshot = model.graph_json
        model_id = model.id
    else:
        model_snapshot = data.graph_json or {}
        model_id = None

    if data.steps_data is None:
        try:
            steps_payload = simulate(
                graph_json=model_snapshot,
                dt=data.dt,
                steps=data.steps,
                seed=data.seed,
                engine_version=data.engine_version,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        steps_payload = [step.model_dump() for step in data.steps_data]

    return SimulationRunService.create_run(
        db,
        user_id=current_user.id,
        model_id=model_id,
        model_snapshot=model_snapshot,
        dt=data.dt,
        steps=data.steps,
        engine_version=data.engine_version,
        seed=data.seed,
        steps_data=steps_payload,
    )


@router.get("/{run_id}/steps", response_model=list[RunStepPublic])
def list_steps(
    run_id: int,
    from_index: int | None = Query(default=None, alias="from"),
    to_index: int | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        SimulationRunService.get_for_user(db, run_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return SimulationRunService.list_steps(db, run_id, from_index=from_index, to_index=to_index)


@router.get("/{run_id}/steps/{step_index}", response_model=RunStepPublic)
def get_step(
    run_id: int,
    step_index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        SimulationRunService.get_for_user(db, run_id, current_user.id)
        return SimulationRunService.get_step(db, run_id, step_index)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{run_id}", response_model=RunSummary)
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return SimulationRunService.delete(db, run_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
