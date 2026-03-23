from __future__ import annotations

from dataclasses import dataclass, field
import math
from typing import Any


@dataclass(frozen=True)
class NodeSpec:
    node_id: str
    initial: float
    decay: float
    bias: float
    minimum: float | None = None
    maximum: float | None = None
    nonlinearity: dict[str, Any] | None = None


@dataclass(frozen=True)
class EdgeSpec:
    edge_id: str
    source: str
    target: str
    weight: float
    delay_steps: int = 0
    info_only: bool = False
    minimum: float | None = None
    maximum: float | None = None
    nonlinearity: dict[str, Any] | None = None
    adaptive: dict[str, Any] | None = None


@dataclass(frozen=True)
class GoalSpec:
    key: str
    node: str
    target: float
    weight: float = 1.0


@dataclass(frozen=True)
class PolicySpec:
    policy_id: str
    observed: str
    target: float | None = None
    goal_key: str | None = None
    control: str = "bias"
    target_node: str | None = None
    kp: float = 0.0
    ki: float = 0.0
    kd: float = 0.0
    minimum: float | None = None
    maximum: float | None = None


@dataclass(frozen=True)
class RuleSpec:
    rule_id: str
    condition: dict[str, Any]
    actions: list[dict[str, Any]]


@dataclass(frozen=True)
class PreparedModel:
    node_ids: list[str]
    nodes: dict[str, NodeSpec]
    edges: list[EdgeSpec]
    edge_index_by_id: dict[str, int]
    goals: dict[str, GoalSpec]
    policies: list[PolicySpec]
    rules: list[RuleSpec]
    settings: dict[str, Any]


@dataclass
class RuntimeContext:
    node_bias: dict[str, float]
    edge_weights: list[float]
    edge_inputs: dict[str, float] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)
    policy_integral: dict[str, float] = field(default_factory=dict)
    policy_prev_error: dict[str, float] = field(default_factory=dict)


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return default
        return float(value)
    raise ValueError(f"Cannot parse float from value: {value!r}")


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return default
        return int(float(value))
    raise ValueError(f"Cannot parse int from value: {value!r}")


def _node_id(node: dict[str, Any], index: int) -> str:
    node_key = node.get("id") or node.get("name") or node.get("key")
    if node_key is None:
        node_key = f"node_{index}"
    return str(node_key)


def _edge_id(edge: dict[str, Any], index: int) -> str:
    edge_key = edge.get("id") or edge.get("key")
    if edge_key is None:
        edge_key = f"edge_{index}"
    return str(edge_key)


def _clamp(value: float, minimum: float | None, maximum: float | None) -> float:
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _apply_nonlinearity(value: float, config: dict[str, Any] | None) -> float:
    if not config:
        return value
    kind = str(config.get("type", "identity")).lower()

    if kind in {"identity", "none"}:
        return value
    if kind == "tanh":
        gain = _as_float(config.get("gain"), 1.0)
        return math.tanh(gain * value)
    if kind == "sigmoid":
        gain = _as_float(config.get("gain"), 1.0)
        midpoint = _as_float(config.get("midpoint"), 0.0)
        return 1.0 / (1.0 + math.exp(-gain * (value - midpoint)))
    if kind == "relu":
        return max(0.0, value)
    if kind == "clamp":
        min_v = config.get("min")
        max_v = config.get("max")
        minimum = None if min_v is None else _as_float(min_v)
        maximum = None if max_v is None else _as_float(max_v)
        return _clamp(value, minimum, maximum)
    raise ValueError(f"Unsupported nonlinearity type: {kind}")


def validate_graph(graph_json: dict[str, Any]) -> None:
    if not isinstance(graph_json, dict):
        raise ValueError("graph_json must be a dict")

    nodes = graph_json.get("nodes", [])
    edges = graph_json.get("edges", [])
    policies = graph_json.get("policies", [])
    rules = graph_json.get("rules", [])
    goals = graph_json.get("goals", [])

    if not isinstance(nodes, list):
        raise ValueError("graph_json.nodes must be a list")
    if not isinstance(edges, list):
        raise ValueError("graph_json.edges must be a list")
    if not isinstance(policies, list):
        raise ValueError("graph_json.policies must be a list")
    if not isinstance(rules, list):
        raise ValueError("graph_json.rules must be a list")
    if not isinstance(goals, list):
        raise ValueError("graph_json.goals must be a list")

    node_ids: set[str] = set()
    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise ValueError(f"Node at index {idx} must be a dict")
        node_ids.add(_node_id(node, idx))

    for idx, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise ValueError(f"Edge at index {idx} must be a dict")
        source = edge.get("source")
        target = edge.get("target")
        if source is None or target is None:
            raise ValueError(f"Edge at index {idx} must contain source and target")
        if node_ids and (str(source) not in node_ids or str(target) not in node_ids):
            raise ValueError(
                f"Edge at index {idx} references unknown node: {source!r} -> {target!r}"
            )
        delay_steps = _as_int(edge.get("delay_steps"), 0)
        if delay_steps < 0:
            raise ValueError(f"Edge at index {idx} has negative delay_steps")

    for idx, goal in enumerate(goals):
        if not isinstance(goal, dict):
            raise ValueError(f"Goal at index {idx} must be a dict")
        node = goal.get("node")
        if node is None:
            raise ValueError(f"Goal at index {idx} must define node")
        if node_ids and str(node) not in node_ids:
            raise ValueError(f"Goal at index {idx} references unknown node {node!r}")
        if goal.get("target") is None:
            raise ValueError(f"Goal at index {idx} must define target")

    goal_keys = {
        str(goal.get("key", goal.get("id", f"goal_{idx}")))
        for idx, goal in enumerate(goals)
    }
    for idx, policy in enumerate(policies):
        if not isinstance(policy, dict):
            raise ValueError(f"Policy at index {idx} must be a dict")
        observed = policy.get("observed")
        target_node = policy.get("target_node")
        if observed is None or target_node is None:
            raise ValueError(f"Policy at index {idx} must define observed and target_node")
        if node_ids and str(observed) not in node_ids:
            raise ValueError(f"Policy at index {idx} observed unknown node {observed!r}")
        if node_ids and str(target_node) not in node_ids:
            raise ValueError(f"Policy at index {idx} target_node unknown {target_node!r}")
        goal_key = policy.get("goal_key")
        if goal_key is not None and str(goal_key) not in goal_keys:
            raise ValueError(f"Policy at index {idx} goal_key references unknown goal {goal_key!r}")
        if goal_key is None and policy.get("target") is None:
            raise ValueError(f"Policy at index {idx} requires target or goal_key")

    for idx, rule in enumerate(rules):
        if not isinstance(rule, dict):
            raise ValueError(f"Rule at index {idx} must be a dict")
        condition = rule.get("if")
        actions = rule.get("then")
        if not isinstance(condition, dict):
            raise ValueError(f"Rule at index {idx} must include dict 'if'")
        if not isinstance(actions, list) or not actions:
            raise ValueError(f"Rule at index {idx} must include non-empty list 'then'")


def prepare_model(graph_json: dict[str, Any], seed: int | None = None) -> PreparedModel:
    del seed  # deterministic by default; seed reserved for stochastic extensions
    validate_graph(graph_json)

    nodes_data = graph_json.get("nodes", [])
    edges_data = graph_json.get("edges", [])
    goals_data = graph_json.get("goals", [])
    policies_data = graph_json.get("policies", [])
    rules_data = graph_json.get("rules", [])
    settings = graph_json.get("settings", {}) if isinstance(graph_json.get("settings", {}), dict) else {}

    node_ids: list[str] = []
    nodes: dict[str, NodeSpec] = {}
    for idx, raw_node in enumerate(nodes_data):
        node_id = _node_id(raw_node, idx)
        node_ids.append(node_id)
        min_raw = raw_node.get("min")
        max_raw = raw_node.get("max")
        minimum = None if min_raw is None else _as_float(min_raw)
        maximum = None if max_raw is None else _as_float(max_raw)
        nodes[node_id] = NodeSpec(
            node_id=node_id,
            initial=_as_float(raw_node.get("initial", raw_node.get("value", 0.0))),
            decay=_as_float(raw_node.get("decay"), 1.0),
            bias=_as_float(raw_node.get("bias"), 0.0),
            minimum=minimum,
            maximum=maximum,
            nonlinearity=raw_node.get("nonlinearity"),
        )

    edges: list[EdgeSpec] = []
    edge_index_by_id: dict[str, int] = {}
    for idx, raw_edge in enumerate(edges_data):
        edge_id = _edge_id(raw_edge, idx)
        min_raw = raw_edge.get("min")
        max_raw = raw_edge.get("max")
        edge = EdgeSpec(
            edge_id=edge_id,
            source=str(raw_edge["source"]),
            target=str(raw_edge["target"]),
            weight=_as_float(raw_edge.get("weight"), 0.0),
            delay_steps=max(0, _as_int(raw_edge.get("delay_steps"), 0)),
            info_only=bool(raw_edge.get("info_only", False)),
            minimum=None if min_raw is None else _as_float(min_raw),
            maximum=None if max_raw is None else _as_float(max_raw),
            nonlinearity=raw_edge.get("nonlinearity"),
            adaptive=raw_edge.get("adaptive"),
        )
        edge_index_by_id[edge_id] = idx
        edges.append(edge)

    goals: dict[str, GoalSpec] = {}
    for idx, raw_goal in enumerate(goals_data):
        key = str(raw_goal.get("key", raw_goal.get("id", f"goal_{idx}")))
        goals[key] = GoalSpec(
            key=key,
            node=str(raw_goal["node"]),
            target=_as_float(raw_goal["target"]),
            weight=_as_float(raw_goal.get("weight"), 1.0),
        )

    policies: list[PolicySpec] = []
    for idx, raw_policy in enumerate(policies_data):
        policy_id = str(raw_policy.get("id", raw_policy.get("key", f"policy_{idx}")))
        min_raw = raw_policy.get("min")
        max_raw = raw_policy.get("max")
        goal_key = raw_policy.get("goal_key")
        policies.append(
            PolicySpec(
                policy_id=policy_id,
                observed=str(raw_policy["observed"]),
                target=None if raw_policy.get("target") is None else _as_float(raw_policy["target"]),
                goal_key=None if goal_key is None else str(goal_key),
                control=str(raw_policy.get("control", "bias")),
                target_node=str(raw_policy["target_node"]),
                kp=_as_float(raw_policy.get("kp"), 0.0),
                ki=_as_float(raw_policy.get("ki"), 0.0),
                kd=_as_float(raw_policy.get("kd"), 0.0),
                minimum=None if min_raw is None else _as_float(min_raw),
                maximum=None if max_raw is None else _as_float(max_raw),
            )
        )

    rules: list[RuleSpec] = []
    for idx, raw_rule in enumerate(rules_data):
        rule_id = str(raw_rule.get("id", raw_rule.get("key", f"rule_{idx}")))
        rules.append(
            RuleSpec(
                rule_id=rule_id,
                condition=raw_rule["if"],
                actions=list(raw_rule["then"]),
            )
        )

    return PreparedModel(
        node_ids=node_ids,
        nodes=nodes,
        edges=edges,
        edge_index_by_id=edge_index_by_id,
        goals=goals,
        policies=policies,
        rules=rules,
        settings=settings,
    )


def init_runtime(model: PreparedModel) -> RuntimeContext:
    return RuntimeContext(
        node_bias={node_id: spec.bias for node_id, spec in model.nodes.items()},
        edge_weights=[edge.weight for edge in model.edges],
    )


def initial_state(model: PreparedModel) -> dict[str, float]:
    return {node_id: spec.initial for node_id, spec in model.nodes.items()}


def _resolve_operand(
    operand: Any,
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
    t: float,
) -> float:
    del model
    if isinstance(operand, (int, float)):
        return float(operand)
    if isinstance(operand, str):
        if operand in state:
            return state[operand]
        if operand in runtime.metrics:
            return runtime.metrics[operand]
        if operand == "time":
            return t
        return _as_float(operand)
    if isinstance(operand, dict):
        if "const" in operand:
            return _as_float(operand["const"])
        if "node" in operand:
            return state[str(operand["node"])]
        if "metric" in operand:
            return runtime.metrics.get(str(operand["metric"]), 0.0)
        if "time" in operand:
            return t
    raise ValueError(f"Unsupported operand in rule condition: {operand!r}")


def _evaluate_condition(
    condition: dict[str, Any],
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
    t: float,
) -> bool:
    op = str(condition.get("op", "gt")).lower()
    left = _resolve_operand(condition.get("left"), state, runtime, model, t)
    right = _resolve_operand(condition.get("right"), state, runtime, model, t)

    if op == "gt":
        return left > right
    if op == "lt":
        return left < right
    if op == "gte":
        return left >= right
    if op == "lte":
        return left <= right
    if op == "eq":
        return left == right
    if op == "neq":
        return left != right
    raise ValueError(f"Unsupported rule operator: {op}")


def _apply_action(
    action: dict[str, Any],
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
) -> None:
    action_type = str(action.get("type", "")).lower()
    target = action.get("target")
    value = _as_float(action.get("value"), 0.0)

    if action_type == "add_state":
        state[str(target)] += value
        return
    if action_type == "set_state":
        state[str(target)] = value
        return
    if action_type == "add_bias":
        runtime.node_bias[str(target)] += value
        return
    if action_type == "set_bias":
        runtime.node_bias[str(target)] = value
        return
    if action_type in {"set_weight", "scale_weight"}:
        edge_idx: int | None = None
        if isinstance(target, int):
            edge_idx = target
        elif isinstance(target, str):
            edge_idx = model.edge_index_by_id.get(target)
        if edge_idx is None or edge_idx < 0 or edge_idx >= len(runtime.edge_weights):
            raise ValueError(f"Rule references unknown edge target: {target!r}")

        if action_type == "set_weight":
            runtime.edge_weights[edge_idx] = value
        else:
            runtime.edge_weights[edge_idx] *= value

        edge = model.edges[edge_idx]
        runtime.edge_weights[edge_idx] = _clamp(
            runtime.edge_weights[edge_idx],
            edge.minimum,
            edge.maximum,
        )
        return

    raise ValueError(f"Unsupported rule action type: {action_type}")


def apply_rules(
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
    t: float,
) -> None:
    for rule in model.rules:
        if _evaluate_condition(rule.condition, state, runtime, model, t):
            for action in rule.actions:
                _apply_action(action, state, runtime, model)


def _resolve_policy_target(policy: PolicySpec, model: PreparedModel) -> float:
    if policy.goal_key:
        goal = model.goals[policy.goal_key]
        return goal.target
    if policy.target is not None:
        return policy.target
    return 0.0


def apply_policies(
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
    dt: float,
) -> None:
    for policy in model.policies:
        observed = state[policy.observed]
        target = _resolve_policy_target(policy, model)
        error = target - observed

        integral = runtime.policy_integral.get(policy.policy_id, 0.0) + error * dt
        prev_error = runtime.policy_prev_error.get(policy.policy_id, error)
        derivative = (error - prev_error) / dt if dt > 0 else 0.0

        control_signal = policy.kp * error + policy.ki * integral + policy.kd * derivative

        if policy.control == "bias":
            node_id = str(policy.target_node)
            runtime.node_bias[node_id] += control_signal
            runtime.node_bias[node_id] = _clamp(
                runtime.node_bias[node_id],
                policy.minimum,
                policy.maximum,
            )
        else:
            raise ValueError(f"Unsupported policy control type: {policy.control}")

        runtime.policy_integral[policy.policy_id] = integral
        runtime.policy_prev_error[policy.policy_id] = error


def update_metrics(state: dict[str, float], runtime: RuntimeContext, model: PreparedModel) -> None:
    metrics: dict[str, float] = {}
    for goal in model.goals.values():
        error = goal.target - state[goal.node]
        metrics[f"goal_error:{goal.key}"] = error
    runtime.metrics = metrics


def derivatives(
    state: dict[str, float],
    t: float,
    model: PreparedModel,
    runtime: RuntimeContext,
) -> dict[str, float]:
    del t
    result: dict[str, float] = {}
    for node_id in model.node_ids:
        spec = model.nodes[node_id]
        base = -spec.decay * state[node_id] + runtime.node_bias[node_id]
        result[node_id] = _apply_nonlinearity(base, spec.nonlinearity)

    for idx, edge in enumerate(model.edges):
        if edge.info_only:
            continue
        source_value = runtime.edge_inputs.get(edge.edge_id, state[edge.source])
        weighted = runtime.edge_weights[idx] * source_value
        weighted = _apply_nonlinearity(weighted, edge.nonlinearity)
        result[edge.target] += weighted

    return result


def apply_state_constraints(
    state: dict[str, float],
    model: PreparedModel,
    global_min: float | None = None,
    global_max: float | None = None,
) -> dict[str, float]:
    constrained: dict[str, float] = {}
    for node_id, value in state.items():
        spec = model.nodes[node_id]
        node_min = spec.minimum if spec.minimum is not None else global_min
        node_max = spec.maximum if spec.maximum is not None else global_max
        constrained[node_id] = _clamp(value, node_min, node_max)
    return constrained


def apply_structural_adaptation(
    state: dict[str, float],
    runtime: RuntimeContext,
    model: PreparedModel,
    dt: float,
) -> None:
    for idx, edge in enumerate(model.edges):
        if not edge.adaptive:
            continue
        mode = str(edge.adaptive.get("mode", "hebbian")).lower()
        lr = _as_float(edge.adaptive.get("learning_rate"), 0.0)
        delta = 0.0

        if mode == "hebbian":
            delta = lr * state[edge.source] * state[edge.target] * dt
        elif mode == "goal_seek":
            goal_key = edge.adaptive.get("goal_key")
            if goal_key is not None and str(goal_key) in model.goals:
                goal = model.goals[str(goal_key)]
                error = goal.target - state[goal.node]
                delta = lr * error * state[edge.source] * dt
            else:
                delta = 0.0
        else:
            raise ValueError(f"Unsupported adaptive mode: {mode}")

        runtime.edge_weights[idx] += delta
        runtime.edge_weights[idx] = _clamp(
            runtime.edge_weights[idx],
            edge.minimum,
            edge.maximum,
        )


def observe(
    state: dict[str, float],
    t: float,
    model: PreparedModel,
    runtime: RuntimeContext,
) -> dict[str, float]:
    values = {key: float(value) for key, value in state.items()}
    extended = bool(model.settings.get("observe_extended", False))
    if not extended:
        return values

    values["_time"] = float(t)
    for key, metric in runtime.metrics.items():
        values[f"_metric:{key}"] = float(metric)
    for idx, edge in enumerate(model.edges):
        values[f"_edge_weight:{edge.edge_id}"] = float(runtime.edge_weights[idx])
    return values
