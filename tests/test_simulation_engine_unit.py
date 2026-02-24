from math import isclose

from src.services.simulation_engine.engine import simulate


def test_delay_changes_dynamics():
    graph = {
        "nodes": [
            {"id": "x", "initial": 1.0, "decay": 1.0, "bias": 0.0},
            {"id": "y", "initial": 0.0, "decay": 0.0, "bias": 0.0},
        ],
        "edges": [
            {"id": "x_to_y", "source": "x", "target": "y", "weight": 1.0, "delay_steps": 1},
        ],
    }
    steps = simulate(graph_json=graph, dt=1.0, steps=3, engine_version="euler_v2")

    assert isclose(steps[0]["values"]["x"], 1.0, abs_tol=1e-12)
    assert isclose(steps[1]["values"]["x"], 0.0, abs_tol=1e-12)
    assert isclose(steps[2]["values"]["y"], 2.0, abs_tol=1e-12)


def test_policy_tracks_goal_target():
    graph = {
        "nodes": [{"id": "temp", "initial": 0.0, "decay": 0.2, "bias": 0.0}],
        "edges": [],
        "goals": [{"key": "temp_goal", "node": "temp", "target": 10.0}],
        "policies": [
            {
                "id": "temp_controller",
                "observed": "temp",
                "goal_key": "temp_goal",
                "control": "bias",
                "target_node": "temp",
                "kp": 0.4,
                "ki": 0.05,
                "kd": 0.0,
                "min": -5.0,
                "max": 5.0,
            }
        ],
    }
    steps = simulate(graph_json=graph, dt=0.1, steps=20, engine_version="rk4_v2")
    assert steps[-1]["values"]["temp"] > steps[0]["values"]["temp"]


def test_rules_apply_discrete_interventions():
    graph = {
        "nodes": [{"id": "s", "initial": 0.0, "decay": 0.0, "bias": 0.0}],
        "edges": [],
        "rules": [
            {
                "id": "kickstart",
                "if": {"left": {"time": True}, "op": "gte", "right": {"const": 0.0}},
                "then": [{"type": "add_state", "target": "s", "value": 1.0}],
            }
        ],
    }
    steps = simulate(graph_json=graph, dt=1.0, steps=3, engine_version="euler_v2")
    assert isclose(steps[0]["values"]["s"], 0.0, abs_tol=1e-12)
    assert isclose(steps[1]["values"]["s"], 1.0, abs_tol=1e-12)
    assert isclose(steps[2]["values"]["s"], 2.0, abs_tol=1e-12)


def test_adaptive_edge_updates_weight_and_effect():
    graph = {
        "nodes": [
            {"id": "a", "initial": 1.0, "decay": 0.0, "bias": 0.0},
            {"id": "b", "initial": 1.0, "decay": 0.0, "bias": 0.0},
        ],
        "edges": [
            {
                "id": "a_to_b",
                "source": "a",
                "target": "b",
                "weight": 0.1,
                "adaptive": {"mode": "hebbian", "learning_rate": 0.2},
                "max": 2.0,
            }
        ],
        "settings": {"observe_extended": True},
    }
    steps = simulate(graph_json=graph, dt=0.1, steps=5, engine_version="euler_v2")
    w0 = steps[0]["values"]["_edge_weight:a_to_b"]
    w4 = steps[-1]["values"]["_edge_weight:a_to_b"]
    assert w4 > w0
