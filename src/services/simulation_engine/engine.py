from __future__ import annotations

from collections import deque
import math
from typing import Callable

from src.services.simulation_engine.calculations import (
    PreparedModel,
    RuntimeContext,
    apply_policies,
    apply_rules,
    apply_state_constraints,
    apply_structural_adaptation,
    derivatives,
    init_runtime,
    initial_state,
    observe,
    prepare_model,
    update_metrics,
)


ENGINE_METHODS: dict[str, str] = {
    "euler": "euler",
    "euler_v1": "euler",
    "euler_v2": "euler",
    "rk4": "rk4",
    "rk4_v1": "rk4",
    "rk4_v2": "rk4",
    "mk4": "rk4",
    "mk4_v1": "rk4",
    "mk4_v2": "rk4",
}


def _resolve_method(engine_version: str) -> str:
    method = ENGINE_METHODS.get(engine_version.lower())
    if not method:
        supported = ", ".join(sorted(ENGINE_METHODS))
        raise ValueError(f"Unsupported engine_version: {engine_version}. Supported: {supported}")
    return method


def _assert_finite(values: dict[str, float], context: str) -> None:
    for key, value in values.items():
        if not math.isfinite(value):
            raise ValueError(f"Non-finite value detected for '{key}' in {context}")


def _combine(state: dict[str, float], k: dict[str, float], scale: float) -> dict[str, float]:
    return {key: state[key] + scale * k[key] for key in state}


def _build_edge_inputs(
    model: PreparedModel,
    history: dict[str, deque[float]],
    state: dict[str, float],
) -> dict[str, float]:
    edge_inputs: dict[str, float] = {}
    for edge in model.edges:
        if edge.delay_steps <= 0:
            edge_inputs[edge.edge_id] = state[edge.source]
            continue

        source_history = history[edge.source]
        if len(source_history) > edge.delay_steps:
            edge_inputs[edge.edge_id] = source_history[-1 - edge.delay_steps]
        else:
            edge_inputs[edge.edge_id] = source_history[0]
    return edge_inputs


def step_euler(
    state: dict[str, float],
    t: float,
    dt: float,
    model: PreparedModel,
    runtime: RuntimeContext,
) -> dict[str, float]:
    k1 = derivatives(state, t, model, runtime)
    return _combine(state, k1, dt)


def step_rk4(
    state: dict[str, float],
    t: float,
    dt: float,
    model: PreparedModel,
    runtime: RuntimeContext,
) -> dict[str, float]:
    # Delay inputs and policy/rule outputs are treated as piecewise-constant within dt.
    k1 = derivatives(state, t, model, runtime)
    k2 = derivatives(_combine(state, k1, 0.5 * dt), t + 0.5 * dt, model, runtime)
    k3 = derivatives(_combine(state, k2, 0.5 * dt), t + 0.5 * dt, model, runtime)
    k4 = derivatives(_combine(state, k3, dt), t + dt, model, runtime)

    next_state: dict[str, float] = {}
    for key in state:
        next_state[key] = state[key] + (dt / 6.0) * (
            k1[key] + 2.0 * k2[key] + 2.0 * k3[key] + k4[key]
        )
    return next_state


def simulate(
    graph_json: dict,
    dt: float,
    steps: int,
    seed: int | None = None,
    engine_version: str = "euler_v1",
) -> list[dict]:
    if dt <= 0:
        raise ValueError("dt must be > 0")
    if steps <= 0:
        raise ValueError("steps must be > 0")

    method = _resolve_method(engine_version)
    model = prepare_model(graph_json=graph_json, seed=seed)
    state = initial_state(model)
    runtime = init_runtime(model)

    global_min = graph_json.get("global_min")
    global_max = graph_json.get("global_max")
    global_min = None if global_min is None else float(global_min)
    global_max = None if global_max is None else float(global_max)

    max_delay = max((edge.delay_steps for edge in model.edges), default=0)
    history = {
        node_id: deque([state[node_id]], maxlen=max_delay + 1 if max_delay > 0 else 1)
        for node_id in model.node_ids
    }

    integrator: Callable[
        [dict[str, float], float, float, PreparedModel, RuntimeContext],
        dict[str, float],
    ]
    integrator = step_rk4 if method == "rk4" else step_euler

    steps_data: list[dict] = []
    for i in range(steps):
        t = i * dt
        update_metrics(state, runtime, model)
        values = observe(state, t, model, runtime)
        _assert_finite(values, context=f"observe(step={i})")
        steps_data.append({"step_index": i, "time": t, "values": values})

        if i >= steps - 1:
            continue

        apply_rules(state, runtime, model, t)
        apply_policies(state, runtime, model, dt)
        runtime.edge_inputs = _build_edge_inputs(model, history, state)

        next_state = integrator(state, t, dt, model, runtime)
        next_state = apply_state_constraints(next_state, model, global_min=global_min, global_max=global_max)
        _assert_finite(next_state, context=f"integrate(step={i})")

        apply_structural_adaptation(next_state, runtime, model, dt)

        state = next_state
        for node_id in model.node_ids:
            history[node_id].append(state[node_id])

    return steps_data
