from sqlalchemy.orm import Session

from backend.models.runs import SimulationRun
from backend.models.run_steps import SimulationRunStep


class SimulationRunService:

    @staticmethod
    def create_run(
        db: Session,
        user_id: int,
        model_id: int | None,
        model_snapshot: dict,
        dt: float,
        steps: int,
        engine_version: str,
        seed: int | None,
        steps_data: list[dict] | None,
    ) -> SimulationRun:
        run = SimulationRun(
            user_id=user_id,
            model_id=model_id,
            model_snapshot=model_snapshot,
            dt=dt,
            steps=steps,
            engine_version=engine_version,
            seed=seed,
            status="running",
        )
        db.add(run)
        try:
            db.commit()
            db.refresh(run)
        except Exception:
            db.rollback()
            raise

        if not steps_data:
            run.status = "failed"
            run.error_message = "Simulation engine not implemented"
            try:
                db.commit()
                db.refresh(run)
            except Exception:
                db.rollback()
                raise
            return run

        step_rows = [
            SimulationRunStep(
                run_id=run.id,
                step_index=step["step_index"],
                time=step["time"],
                values=step["values"],
            )
            for step in steps_data
        ]
        db.add_all(step_rows)
        run.status = "completed"
        try:
            db.commit()
            db.refresh(run)
        except Exception as exc:
            db.rollback()
            run.status = "failed"
            run.error_message = str(exc)
            try:
                db.add(run)
                db.commit()
                db.refresh(run)
            except Exception:
                db.rollback()
                raise
        return run

    @staticmethod
    def get_for_user(db: Session, run_id: int, user_id: int) -> SimulationRun:
        run = (
            db.query(SimulationRun)
            .filter(SimulationRun.id == run_id, SimulationRun.user_id == user_id)
            .first()
        )
        if not run:
            raise ValueError(f"Run with id {run_id} not found")
        return run

    @staticmethod
    def list_for_user(db: Session, user_id: int, model_id: int | None = None) -> list[SimulationRun]:
        query = db.query(SimulationRun).filter(SimulationRun.user_id == user_id)
        if model_id is not None:
            query = query.filter(SimulationRun.model_id == model_id)
        return query.order_by(SimulationRun.created_at.desc()).all()

    @staticmethod
    def list_steps(
        db: Session,
        run_id: int,
        from_index: int | None = None,
        to_index: int | None = None,
    ) -> list[SimulationRunStep]:
        query = db.query(SimulationRunStep).filter(SimulationRunStep.run_id == run_id)
        if from_index is not None:
            query = query.filter(SimulationRunStep.step_index >= from_index)
        if to_index is not None:
            query = query.filter(SimulationRunStep.step_index <= to_index)
        return query.order_by(SimulationRunStep.step_index.asc()).all()

    @staticmethod
    def get_step(db: Session, run_id: int, step_index: int) -> SimulationRunStep:
        step = (
            db.query(SimulationRunStep)
            .filter(
                SimulationRunStep.run_id == run_id,
                SimulationRunStep.step_index == step_index,
            )
            .first()
        )
        if not step:
            raise ValueError("Step not found")
        return step

    @staticmethod
    def delete(db: Session, run_id: int, user_id: int) -> SimulationRun:
        run = SimulationRunService.get_for_user(db, run_id, user_id)
        db.delete(run)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return run
