from __future__ import annotations

from copy import deepcopy

from sqlalchemy.orm import Session

from backend.models.lesson_tasks import LessonTask
from backend.models.lessons import Lesson
from backend.models.progress import UserProgress
from backend.models.sections import Section
from backend.models.systems import SystemModel
from backend.models.user_task_progress import UserTaskProgress

C_STOCK = "#1E40AF"
C_AUX = "#8B5CF6"
C_REINFORCING = "#F59E0B"
C_DELAY = "#EAB308"
C_STOCK_PALETTE = ["#2563EB", "#0891B2", "#16A34A", "#EA580C", "#DC2626", "#7C3AED", "#DB2777", "#0D9488"]
C_FLOW_IN_PALETTE = ["#10B981", "#22C55E", "#14B8A6", "#06B6D4"]
C_FLOW_OUT_PALETTE = ["#EF4444", "#F97316", "#E11D48", "#D97706"]
C_FLOW_TRANSFER_PALETTE = ["#38BDF8", "#A855F7", "#F59E0B", "#84CC16"]
C_AUX_PALETTE = ["#8B5CF6", "#0EA5E9", "#EC4899", "#F97316", "#14B8A6", "#EAB308"]


def cycle_item(items: list[str], index: int) -> str:
    return items[index % len(items)]


def sentence_case(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    return text[0].upper() + text[1:]


def remove_task_leading_phrases(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    prefixes = (
        "Reference graph: inspect the structure, run the simulation, and use it as an example. ",
        "Use this finished graph. Run it and use it as an example. ",
        "Almost complete: most stock and flow nodes are placed, but a couple of stock and flow connections are missing. ",
        "Almost complete: most nodes are placed, but one formula and a couple of connections are missing. ",
        "Add the missing stock and flow links. ",
        "Add the missing formula and links. ",
        "Almost done: ",
        "Blank canvas: build the model from the brief, run it, and explain the result. ",
        "Blank canvas: build the model, run it, and explain what happens. ",
        "Start from an **empty graph**. ",
        "Start from an empty graph. ",
        "Start from a **blank canvas**. ",
        "Start from a blank canvas. ",
        "Start from a **blank canvas**, ",
        "Start from a blank canvas, ",
        "Start from a blank canvas and ",
        "On a **blank canvas**, ",
        "On a blank canvas, ",
        "In a **new blank lab model** (or your notes), ",
        "In a new blank lab model (or your notes), ",
        "The canvas is **almost ready**: ",
        "The canvas is almost ready: ",
        "Open the **finished reference** graph ",
        "Open the finished reference graph ",
        "Open the finished graph ",
    )
    changed = True
    while changed:
        changed = False
        for prefix in prefixes:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
                changed = True
    if cleaned.startswith("("):
        closing = cleaned.find(")")
        if closing > 0:
            cleaned = f"Use the finished graph with {cleaned[1:closing]}{cleaned[closing + 1:]}"
        else:
            cleaned = f"Use the finished graph {cleaned}"
    return sentence_case(cleaned)


def blank_canvas_task_body(text: str) -> str:
    cleaned = remove_task_leading_phrases(text)
    replacements = (
        ("In the shared pasture graph, identify", "Build a shared pasture model and identify"),
        ("In the qualitative model, explain", "Build a qualitative model and explain"),
        ("Using the forest diagram as a template, sketch (on paper or in a new lab file) how", "Build a model showing how"),
        ("Run the ", "Build and run the "),
        ("Run ", "Build and run "),
        ("Simulate ", "Build and simulate "),
        ("Map the model to ", "Build a model of "),
        ("Map the commons structure to ", "Build a commons model for "),
        ("Relabel the story mentally as ", "Build a new version of the story as "),
        ("Interpret the stocks as ", "Build a version where the stocks are "),
        ("Compare modeling ", "Build a boundary comparison for "),
    )
    for old, new in replacements:
        if cleaned.startswith(old):
            cleaned = new + cleaned[len(old):]
            break
    return sentence_case(cleaned)


SIMPLE_TEXT_REPLACEMENTS = {
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
    "–": "-",
    "—": "-",
    "→": " to ",
    "←": " from ",
    "↔": " both ways ",
    "×": " x ",
    "∝": " depends on ",
    "≈": "about",
    "°": " deg ",
    "…": "...",
    "  ": " ",
}

SIMPLE_PHRASE_REPLACEMENTS = {
    "Learning objective": "Goal",
    "bounded rationality": "limited view",
    "Bounded rationality": "Limited view",
    "endogenous": "inside the model",
    "Endogenous": "Inside the model",
    "exogenous": "outside the model",
    "Exogenous": "Outside the model",
    "Leverage point": "Useful change",
    "leverage point": "useful change",
    "pervasive": "common",
    "Pervasive": "Common",
    "utilize": "use",
    "Utilize": "Use",
    "approximately": "about",
    "Approximately": "About",
    "corrective action": "correction",
    "Corrective action": "Correction",
    "Corrective": "Correction",
    "discrepancy": "gap",
    "Discrepancy": "Gap",
    "dynamic equilibrium": "steady balance",
    "Dynamic equilibrium": "Steady balance",
    "self enhancing": "self strengthening",
    "Self enhancing": "Self strengthening",
    "amplifying": "growing",
    "Amplifying": "Growing",
    "deteriorated": "worse",
    "Deteriorated": "Worse",
    "intervenor": "helper",
    "Intervenor": "Helper",
}


def simplify_student_text(text: str) -> str:
    if not isinstance(text, str) or not text:
        return text
    cleaned = text
    for old, new in SIMPLE_TEXT_REPLACEMENTS.items():
        cleaned = cleaned.replace(old, new)
    for old, new in SIMPLE_PHRASE_REPLACEMENTS.items():
        cleaned = cleaned.replace(old, new)
    while "  " in cleaned:
        cleaned = cleaned.replace("  ", " ")
    cleaned = cleaned.replace(" .", ".").replace(" ,", ",").replace(" :", ":")
    cleaned = cleaned.replace("( ", "(").replace(" )", ")")
    return cleaned


def simplify_graph_text(graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            for key in ("label", "student_tooltip", "comment_text", "unit"):
                if isinstance(node.get(key), str):
                    node[key] = simplify_student_text(node[key])
    if isinstance(edges, list):
        for edge in edges:
            if isinstance(edge, dict) and isinstance(edge.get("label"), str):
                edge["label"] = simplify_student_text(edge["label"])
    return graph


def remove_starter_comment_nodes(graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not isinstance(nodes, list):
        return graph

    kept_nodes = [
        node
        for node in nodes
        if not (
            isinstance(node, dict)
            and node.get("kind") == "commentNode"
            and not node.get("boundary_mode")
        )
    ]
    removed_ids = {
        str(node.get("id"))
        for node in nodes
        if isinstance(node, dict)
        and node.get("kind") == "commentNode"
        and not node.get("boundary_mode")
    }
    graph["nodes"] = kept_nodes

    if removed_ids and isinstance(edges, list):
        graph["edges"] = [
            edge
            for edge in edges
            if not (
                isinstance(edge, dict)
                and (str(edge.get("source")) in removed_ids or str(edge.get("target")) in removed_ids)
            )
        ]
    return graph


def colorize_graph(graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return graph

    node_by_id = {str(node.get("id")): node for node in nodes if isinstance(node, dict)}
    flow_roles: dict[str, set[str]] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source", ""))
        target = str(edge.get("target", ""))
        source_kind = node_by_id.get(source, {}).get("kind")
        target_kind = node_by_id.get(target, {}).get("kind")
        if source_kind == "flowNode" and target_kind == "stockNode":
            flow_roles.setdefault(source, set()).add("in")
        if source_kind == "stockNode" and target_kind == "flowNode":
            flow_roles.setdefault(target, set()).add("out")

    stock_index = flow_in_index = flow_out_index = flow_transfer_index = aux_index = 0
    for node in nodes:
        if not isinstance(node, dict):
            continue
        kind = node.get("kind")
        if kind == "stockNode":
            node["color"] = cycle_item(C_STOCK_PALETTE, stock_index)
            stock_index += 1
        elif kind == "flowNode":
            roles = flow_roles.get(str(node.get("id")), set())
            if roles == {"in", "out"}:
                node["color"] = cycle_item(C_FLOW_TRANSFER_PALETTE, flow_transfer_index)
                flow_transfer_index += 1
            elif "out" in roles:
                node["color"] = cycle_item(C_FLOW_OUT_PALETTE, flow_out_index)
                flow_out_index += 1
            else:
                node["color"] = cycle_item(C_FLOW_IN_PALETTE, flow_in_index)
                flow_in_index += 1
        elif kind in {"constantNode", "variableNode"}:
            existing = str(node.get("color", "")).strip()
            semantic = node.get("feedback_loop_type") == "reinforcing" or existing == C_DELAY
            if not semantic:
                node["color"] = cycle_item(C_AUX_PALETTE, aux_index)
                aux_index += 1
    return graph


def graph_node_size(node: dict) -> tuple[float, float]:
    kind = node.get("kind")
    if kind == "flowNode":
        return 260, 88
    if kind == "stockNode":
        return 240, 96
    if kind in {"constantNode", "variableNode"}:
        return 235, 86
    if kind == "commentNode" and node.get("boundary_mode"):
        return float(node.get("frame_width", 400)), float(node.get("frame_height", 280))
    if kind == "commentNode":
        return 230, 58
    return 230, 86


def graph_nodes_overlap(a: dict, b: dict, *, padding: float = 70) -> bool:
    ax, ay = float(a.get("x", 0)), float(a.get("y", 0))
    bx, by = float(b.get("x", 0)), float(b.get("y", 0))
    aw, ah = graph_node_size(a)
    bw, bh = graph_node_size(b)
    return ax < bx + bw + padding and ax + aw + padding > bx and ay < by + bh + padding and ay + ah + padding > by


def beautify_graph_layout(graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    if not isinstance(nodes, list) or len(nodes) < 2:
        return graph

    layout_nodes = [node for node in nodes if isinstance(node, dict)]
    if not layout_nodes:
        return graph

    min_x = min(float(node.get("x", 0)) for node in layout_nodes)
    min_y = min(float(node.get("y", 0)) for node in layout_nodes)
    margin = 64
    scale_x = 1.75
    scale_y = 1.95

    for node in layout_nodes:
        node["x"] = round(margin + (float(node.get("x", 0)) - min_x) * scale_x)
        node["y"] = round(margin + (float(node.get("y", 0)) - min_y) * scale_y)
        if node.get("kind") == "commentNode" and node.get("boundary_mode"):
            node["frame_width"] = round(float(node.get("frame_width", 400)) * scale_x)
            node["frame_height"] = round(float(node.get("frame_height", 280)) * scale_y)

    movable = [
        node
        for node in layout_nodes
        if not (node.get("kind") == "commentNode" and node.get("boundary_mode"))
    ]
    movable.sort(key=lambda node: (float(node.get("y", 0)), float(node.get("x", 0)), str(node.get("id", ""))))

    placed: list[dict] = []
    for node in movable:
        attempts = 0
        while attempts < 140:
            collider = next((other for other in placed if graph_nodes_overlap(other, node)), None)
            if collider is None:
                break
            nx, ny = float(node.get("x", 0)), float(node.get("y", 0))
            cx, cy = float(collider.get("x", 0)), float(collider.get("y", 0))
            cw, ch = graph_node_size(collider)
            move_right = cx + cw + 96 - nx
            move_down = cy + ch + 96 - ny
            if move_right < move_down and nx < cx + cw:
                node["x"] = round(nx + max(96, move_right))
            else:
                node["y"] = round(ny + max(96, move_down))
            attempts += 1
        placed.append(node)

    if placed:
        min_x = min(float(node.get("x", 0)) for node in layout_nodes)
        min_y = min(float(node.get("y", 0)) for node in layout_nodes)
        if min_x != margin or min_y != margin:
            for node in layout_nodes:
                node["x"] = round(float(node.get("x", 0)) - min_x + margin)
                node["y"] = round(float(node.get("y", 0)) - min_y + margin)

    return graph

def build_graph_node(
    kind: str,
    node_id: str,
    label: str,
    x: int,
    y: int,
    *,
    quantity: float = 0,
    bottleneck: float = 0,
    expression: str = "",
    base_flow_expression: str = "",
    loop_id: str = "",
    loop_role: str = "",
    feedback_loop_type: str = "",
    feedback_loop_persistent: bool = False,
    reinforcing_text_only: bool = False,
    reinforcing_marker: bool = False,
    unit: str = "",
    color: str = "",
    student_tooltip: str = "",
    visual_theme: str = "",
    fill_cap: float = 0,
) -> dict:
    row: dict = {
        "id": node_id,
        "kind": kind,
        "x": x,
        "y": y,
        "initial": quantity,
        "quantity": quantity,
        "bottleneck": bottleneck if kind == "flowNode" else 0,
        "expression": expression,
        "base_flow_expression": base_flow_expression,
        "loop_id": loop_id,
        "loop_role": loop_role,
        "feedback_loop_type": feedback_loop_type,
        "feedback_loop_persistent": feedback_loop_persistent,
        "reinforcing_text_only": reinforcing_text_only,
        "reinforcing_marker": reinforcing_marker,
        "unit": unit,
        "color": color,
        "student_tooltip": student_tooltip,
        "decay": 0,
        "bias": 0,
        "label": label,
    }
    if visual_theme:
        row["visual_theme"] = visual_theme
    if fill_cap and kind == "stockNode":
        row["fill_cap"] = fill_cap

    if row.get("student_tooltip"):
        row["student_tooltip"] = remove_task_leading_phrases(row["student_tooltip"])

    return row


def make_stock_node(
    node_id: str,
    label: str,
    x: int,
    y: int,
    *,
    quantity: float = 100,
    unit: str = "",
    color: str = C_STOCK,
    student_tooltip: str = "",
    visual_theme: str = "",
    fill_cap: float = 0,
) -> dict:
    return build_graph_node(
        "stockNode",
        node_id,
        label,
        x,
        y,
        quantity=quantity,
        unit=unit,
        color=color,
        student_tooltip=student_tooltip,
        visual_theme=visual_theme,
        fill_cap=fill_cap,
    )


def make_flow_node(
    node_id: str,
    label: str,
    x: int,
    y: int,
    *,
    bottleneck: float = 10,
    expression: str = "",
    base_flow_expression: str = "",
    unit: str = "",
    color: str = "",
    student_tooltip: str = "",
) -> dict:
    return build_graph_node(
        "flowNode",
        node_id,
        label,
        x,
        y,
        quantity=bottleneck,
        bottleneck=bottleneck,
        expression=expression,
        base_flow_expression=base_flow_expression,
        unit=unit,
        color=color,
        student_tooltip=student_tooltip,
    )


def make_variable_node(
    node_id: str,
    label: str,
    x: int,
    y: int,
    *,
    expression: str = "",
    loop_id: str = "",
    loop_role: str = "",
    fb_type: str = "",
    persistent: bool = False,
    reinforcing_text_only: bool = False,
    unit: str = "",
    color: str = "",
    student_tooltip: str = "",
) -> dict:
    return build_graph_node(
        "variableNode",
        node_id,
        label,
        x,
        y,
        expression=expression,
        loop_id=loop_id,
        loop_role=loop_role,
        feedback_loop_type=fb_type,
        feedback_loop_persistent=persistent,
        reinforcing_text_only=reinforcing_text_only,
        unit=unit,
        color=color,
        student_tooltip=student_tooltip,
    )


def make_constant_node(
    node_id: str,
    label: str,
    x: int,
    y: int,
    *,
    quantity: float = 0,
    loop_id: str = "",
    loop_role: str = "",
    fb_type: str = "",
    persistent: bool = False,
    unit: str = "",
    color: str = C_AUX,
    student_tooltip: str = "",
) -> dict:
    return build_graph_node(
        "constantNode",
        node_id,
        label,
        x,
        y,
        quantity=quantity,
        bottleneck=quantity,
        expression=str(quantity),
        loop_id=loop_id,
        loop_role=loop_role,
        feedback_loop_type=fb_type,
        feedback_loop_persistent=persistent,
        unit=unit,
        color=color,
        student_tooltip=student_tooltip,
    )


def make_inflow_edge(edge_id: str, flow_id: str, stock_id: str) -> dict:
    return {
        "id": edge_id,
        "source": flow_id,
        "target": stock_id,
        "source_handle": "source-right",
        "target_handle": "target-left",
        "kind": "inflow",
        "op": "add",
        "weight": 1,
        "feedback_loop": False,
        "feedback_loop_type": "",
        "reinforcing_polarity": "",
        "feedback_loop_persistent": False,
    }


def make_outflow_edge(edge_id: str, stock_id: str, flow_id: str) -> dict:
    return {
        "id": edge_id,
        "source": stock_id,
        "target": flow_id,
        "source_handle": "source-right",
        "target_handle": "target-left",
        "kind": "outflow",
        "op": "add",
        "weight": -1,
        "feedback_loop": False,
        "feedback_loop_type": "",
        "reinforcing_polarity": "",
        "feedback_loop_persistent": False,
    }


def make_feedback_edge(
    edge_id: str,
    source: str,
    target: str,
    *,
    op: str = "add",
    fb_type: str = "",
    polarity: str = "",
    persistent: bool = False,
) -> dict:
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "source_handle": "",
        "target_handle": "",
        "kind": "neutral",
        "op": op,
        "weight": 1,
        "feedback_loop": True,
        "feedback_loop_type": fb_type,
        "reinforcing_polarity": polarity,
        "feedback_loop_persistent": persistent,
    }


def make_balancing_loop(
    loop_id: str,
    stock_id: str,
    goal_id: str,
    discrepancy_id: str,
    corrective_id: str,
    flow_id: str,
    edge_ids: list[str],
    *,
    boundary_type: str = "lower",
    goal_value: float = 0,
    adjustment_time: float = 3,
    operation: str = "add",
    delay_enabled: bool = False,
    delay_steps: int = 0,
) -> dict:
    return {
        "id": loop_id,
        "type": "balancing",
        "stockId": stock_id,
        "goalNodeId": goal_id,
        "discrepancyNodeId": discrepancy_id,
        "correctiveNodeId": corrective_id,
        "controlledFlowId": flow_id,
        "boundaryType": boundary_type,
        "goalValue": goal_value,
        "adjustmentTime": adjustment_time,
        "operation": operation,
        "delayEnabled": delay_enabled,
        "delaySteps": delay_steps,
        "clampNonNegative": True,
        "baseFlowExpression": "0",
        "edgeIds": edge_ids,
    }


def make_reinforcing_loop(
    loop_id: str,
    stock_id: str,
    multiplier_id: str,
    flow_id: str,
    edge_ids: list[str],
    *,
    k: float = 0.1,
    polarity: str = "positive",
    delay_enabled: bool = False,
    delay_steps: int = 0,
    growth_limit_id: str | None = None,
) -> dict:
    loop: dict = {
        "id": loop_id,
        "type": "reinforcing",
        "stockId": stock_id,
        "multiplierNodeId": multiplier_id,
        "controlledFlowId": flow_id,
        "k": k,
        "polarity": polarity,
        "delayEnabled": delay_enabled,
        "delaySteps": delay_steps,
        "clampNonNegative": True,
        "baseFlowExpression": "0",
        "edgeIds": edge_ids,
    }
    if growth_limit_id is not None:
        loop["growthLimitNodeId"] = growth_limit_id
    return loop


def compose_graph(
    nodes: list[dict],
    edges: list[dict],
    feedback_loops: list[dict] | None = None,
    *,
    lesson_ui: dict | None = None,
) -> dict:
    g: dict = {"nodes": nodes, "edges": edges, "feedbackLoops": feedback_loops or []}
    if lesson_ui:
        g["lessonUi"] = lesson_ui
    return g


def make_comment_node(
    node_id: str,
    text: str,
    x: int,
    y: int,
    *,
    boundary_mode: bool = False,
    frame_width: int = 400,
    frame_height: int = 280,
) -> dict:
    row: dict = {
        "id": node_id,
        "kind": "commentNode",
        "x": x,
        "y": y,
        "comment_text": text,
        "author_id": 0,
        "author_name": "",
        "author_email": "",
        "author_avatar_path": None,
    }
    if boundary_mode:
        row["boundary_mode"] = True
        row["frame_width"] = frame_width
        row["frame_height"] = frame_height

    if row.get("comment_text"):
        row["comment_text"] = remove_task_leading_phrases(row["comment_text"])

    return row


EMPTY_GRAPH: dict = compose_graph([], [])


def make_almost_done_graph(
    base_graph: dict,
    *,
    note: str,
    clear_one_expression: bool = True,
) -> dict:
    graph = deepcopy(base_graph)
    nodes = graph.setdefault("nodes", [])
    edges = graph.setdefault("edges", [])

    nodes.insert(
        0,
        make_comment_node(
            f"todo_{len(nodes) + 1}",
            note,
            20,
            20,
        ),
    )

    if clear_one_expression:
        for node in reversed(nodes):
            if node.get("kind") in {"variableNode", "flowNode"} and str(node.get("expression", "")).strip():
                node["label"] = f"{node.get('label', 'Finish this node')} (finish)"
                node["expression"] = ""
                node["student_tooltip"] = (
                    "This is one of the intentionally missing details for Task 2: add the formula, "
                    "then reconnect the missing information link(s) and run the simulation."
                )
                break

    if len(edges) > 2:
        feedback_edge_ids = [
            str(edge.get("id"))
            for edge in reversed(edges)
            if edge.get("feedback_loop") is True or edge.get("kind") == "neutral"
        ]
        fallback_edge_ids = [str(edge.get("id")) for edge in reversed(edges)]
        remove_ids = set((feedback_edge_ids or fallback_edge_ids)[:2])
        graph["edges"] = [edge for edge in edges if str(edge.get("id")) not in remove_ids]
        graph["feedbackLoops"] = []

    return graph


# =============================================================================
# Section 1: The Basics
# =============================================================================

# ===========================================================================
# Lesson 1: Stocks and Flows
# ===========================================================================

STOCKS_FLOWS_CONTENT = """\

Let’s start with one of the simplest and most powerful ideas in systems thinking.

A **stock** is simply the amount of something that has built up over time.  
It is a quantity you can measure right now, at any single moment, like taking a snapshot.  

### Examples of Stocks

- the amount of water in a bathtub
- the money sitting in your bank account
- the number of trees in a forest
- the number of people living in a city

If you can ask “How much is there *right now*?”, that’s a stock.

A **flow** is what *changes* a stock. It is the *rate* at which something is added to or taken away from the stock over time.  
Flows are always moving, they are never “frozen” at one moment.  

### Examples of Flows

- water pouring in from the faucet (inflow)
- water going down the drain (outflow)
- salary being deposited into your account (inflow)
- money you spend every day (outflow)
- babies being born (inflow to population)
- people dying (outflow from population)

Here is the most important rule:  
**A stock can only change through its flows.** Nothing else affects the stock. If there are no flows, the stock stays exactly the same.

### The Bathtub Metaphor

The easiest way to understand this is to picture a bathtub:

- The **water level** = the stock
- The **faucet** = the inflow (adds water)
- The **drain** = the outflow (removes water)

What happens to the water level?  
- If the faucet runs faster than the drain, the level **rises**.
- If the drain pulls water out faster than the faucet adds it, the level **falls**.
- If the inflow and outflow are exactly equal, the level **stays the same**, even though water is still flowing through the tub.

This last situation, where the stock looks steady but things are still moving, is called **dynamic equilibrium**.

### Why Stocks Matter

Stocks give a system **inertia** and stability. They act like buffers or shock absorbers.  
You cannot instantly empty a full bathtub, nor can you double the population of a city in a single day. Stocks take time to fill up or empty out. Those built in delays are what make real systems behave in ways that often surprise us.

Because stocks exist, inflows and outflows don’t have to happen at the same time or at the same speed.  
You can receive your salary once a month but spend money every single day, the stock in your bank account makes that possible.

You can increase a stock in two ways:  
- by increasing the inflow, **or**
- by decreasing the outflow.

Stocks are the **memory** of the system. They remember the entire history of all the inflows and outflows that have ever passed through it.

> **Key insight:** If you want to change a stock quickly, you have to make big changes to its flows. Tiny adjustments to the flows will only cause very slow changes in the stock.

### In the Lab

Use the lab to connect each diagram to the simulation chart.

- **Task 1: Town water supply**  
  Observe a finished town water system and trace how water moves through reservoir, treatment, household storage, use, evaporation, waste, and leaks.
- **Task 2: Personal budget transfers**  
  Finish a personal budget transfer model by reconnecting the missing stock and flow links.
- **Task 3: Household energy**  
    Build a household energy model using only stocks and flows.
- **Task 4: Population age groups**  
  Build population age groups with births, aging, and deaths.
"""

STOCKS_FLOWS_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "tw_reservoir",
            "Reservoir water",
            420,
            150,
            quantity=900,
            unit="ML",
            student_tooltip="Stock: raw water stored before treatment. Rain and river intake add water; evaporation and treatment transfer remove it.",
            visual_theme="water",
            fill_cap=1200,
        ),
        make_stock_node(
            "tw_treated",
            "Treated water tank",
            420,
            300,
            quantity=180,
            unit="ML",
            student_tooltip="Stock: clean water ready for distribution.",
            visual_theme="water",
            fill_cap=350,
        ),
        make_stock_node(
            "tw_home",
            "Household water storage",
            420,
            450,
            quantity=70,
            unit="ML",
            student_tooltip="Stock: water currently available to households.",
            visual_theme="water",
            fill_cap=180,
        ),
        make_flow_node(
            "tw_rain",
            "Rain and river intake",
            130,
            150,
            bottleneck=42,
            unit="ML/day",
            student_tooltip="Inflow: water entering the reservoir.",
        ),
        make_flow_node(
            "tw_evap",
            "Evaporation and seepage",
            700,
            150,
            bottleneck=9,
            unit="ML/day",
            student_tooltip="Outflow: water lost from the reservoir.",
        ),
        make_flow_node(
            "tw_to_treatment",
            "Pumped to treatment",
            220,
            235,
            bottleneck=28,
            unit="ML/day",
            student_tooltip="Flow: water moves from the reservoir into the treatment tank.",
        ),
        make_flow_node(
            "tw_treatment_loss",
            "Treatment waste",
            700,
            300,
            bottleneck=3,
            unit="ML/day",
            student_tooltip="Outflow: water lost during treatment.",
        ),
        make_flow_node(
            "tw_delivery",
            "Delivery to homes",
            220,
            385,
            bottleneck=24,
            unit="ML/day",
            student_tooltip="Flow: treated water moves into household storage.",
        ),
        make_flow_node(
            "tw_use",
            "Showers, cooking, cleaning",
            700,
            450,
            bottleneck=18,
            unit="ML/day",
            student_tooltip="Outflow: household water use.",
        ),
        make_flow_node(
            "tw_leaks",
            "Pipe leaks",
            220,
            535,
            bottleneck=4,
            unit="ML/day",
            student_tooltip="Outflow: losses after water reaches the local network.",
        ),
    ],
    edges=[
        make_inflow_edge("tw_e1", "tw_rain", "tw_reservoir"),
        make_outflow_edge("tw_e2", "tw_reservoir", "tw_evap"),
        make_outflow_edge("tw_e3", "tw_reservoir", "tw_to_treatment"),
        make_inflow_edge("tw_e4", "tw_to_treatment", "tw_treated"),
        make_outflow_edge("tw_e5", "tw_treated", "tw_treatment_loss"),
        make_outflow_edge("tw_e6", "tw_treated", "tw_delivery"),
        make_inflow_edge("tw_e7", "tw_delivery", "tw_home"),
        make_outflow_edge("tw_e8", "tw_home", "tw_use"),
        make_outflow_edge("tw_e9", "tw_home", "tw_leaks"),
    ],
)

STOCKS_FLOWS_BANK = compose_graph(
    nodes=[
        make_stock_node(
            "pb_wallet",
            "Wallet / checking balance",
            360,
            250,
            quantity=420,
            unit="$",
            student_tooltip="Stock: money available for everyday spending.",
            visual_theme="money",
            fill_cap=1200,
        ),
        make_stock_node(
            "pb_savings",
            "Savings jar",
            610,
            250,
            quantity=260,
            unit="$",
            student_tooltip="Stock: money set aside for later.",
            visual_theme="money",
            fill_cap=900,
        ),
        make_flow_node(
            "pb_income",
            "Allowance / income",
            90,
            250,
            bottleneck=55,
            unit="$/week",
            student_tooltip="Inflow: money arriving into the wallet.",
        ),
        make_flow_node(
            "pb_spending",
            "Food, transport, subscriptions",
            360,
            420,
            bottleneck=38,
            unit="$/week",
            student_tooltip="Outflow: everyday spending from the wallet.",
        ),
        make_flow_node(
            "pb_save",
            "Move money to savings",
            485,
            160,
            bottleneck=20,
            unit="$/week",
            student_tooltip="Flow: transfer money from wallet into savings.",
        ),
        make_flow_node(
            "pb_withdraw",
            "Emergency withdrawal",
            485,
            340,
            bottleneck=8,
            unit="$/week",
            student_tooltip="Flow: money can move back from savings into the wallet.",
        ),
        make_flow_node(
            "pb_big_purchase",
            "Big purchase from savings",
            780,
            250,
            bottleneck=12,
            unit="$/week",
            student_tooltip="Outflow: planned larger spending from savings.",
        ),
    ],
    edges=[
        make_inflow_edge("pb_e1", "pb_income", "pb_wallet"),
        make_outflow_edge("pb_e2", "pb_wallet", "pb_spending"),
        make_outflow_edge("pb_e3", "pb_wallet", "pb_save"),
        make_inflow_edge("pb_e4", "pb_save", "pb_savings"),
        make_outflow_edge("pb_e5", "pb_savings", "pb_withdraw"),
        make_inflow_edge("pb_e6", "pb_withdraw", "pb_wallet"),
        make_outflow_edge("pb_e7", "pb_savings", "pb_big_purchase"),
    ],
)

STOCKS_FLOWS_BANK_ALMOST = deepcopy(STOCKS_FLOWS_BANK)
STOCKS_FLOWS_BANK_ALMOST["edges"] = [
    edge
    for edge in STOCKS_FLOWS_BANK_ALMOST["edges"]
    if edge["id"] not in {"pb_e4", "pb_e6"}
]

STOCKS_FLOWS_ENERGY = compose_graph(
    nodes=[
        make_stock_node(
            "se",
            "Energy in home (usable)",
            400,
            250,
            quantity=48,
            unit="kWh",
            student_tooltip="Teaching stock: energy available for lights, heat, and appliances right now (aggregate).",
        ),
        make_flow_node(
            "fe_in",
            "Grid & solar supply",
            120,
            250,
            bottleneck=9,
            unit="kWh/h",
            student_tooltip="Inflow: electricity and other energy delivered into the home.",
        ),
        make_flow_node(
            "fe_out",
            "Appliances & heat loss",
            680,
            250,
            bottleneck=7,
            unit="kWh/h",
            student_tooltip="Outflow: energy consumed or lost each step.",
        ),
    ],
    edges=[
        make_inflow_edge("ee1", "fe_in", "se"),
        make_outflow_edge("ee2", "se", "fe_out"),
    ],
)

STOCKS_FLOWS_POPULATION = compose_graph(
    nodes=[
        make_stock_node(
            "sp",
            "Population",
            400,
            250,
            quantity=1.2,
            unit="M people",
            student_tooltip="Stock: number of people in the region. Only births and deaths change it in this starter model.",
        ),
        make_flow_node(
            "fp_b",
            "Births (inflow)",
            120,
            250,
            bottleneck=0.012,
            unit="M/yr",
            student_tooltip="Inflow: births per step (scaled). Increase or decrease to see population rise or fall.",
        ),
        make_flow_node(
            "fp_d",
            "Deaths (outflow)",
            680,
            250,
            bottleneck=0.009,
            unit="M/yr",
            student_tooltip="Outflow: deaths per step (scaled).",
        ),
    ],
    edges=[
        make_inflow_edge("ep1", "fp_b", "sp"),
        make_outflow_edge("ep2", "sp", "fp_d"),
    ],
)

LESSON_STOCKS_FLOWS = {
    "title": "Stocks and Flows",
    "order_index": 0,
    "content_markdown": STOCKS_FLOWS_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Town water supply",
            "description": (
                "Trace rain and intake into the reservoir, pumping into treatment, delivery to households, and losses "
                "through use, evaporation, and leaks. Use only stock and flow language."
            ),
            "graph": STOCKS_FLOWS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Personal budget transfers",
            "description": (
                "Finish the nearly complete budget graph. Wallet and savings are already placed; connect the missing "
                "transfer ends so money can move into savings and back to the wallet, then run the simulation."
            ),
            "graph": STOCKS_FLOWS_BANK_ALMOST,
            "order_index": 1,
        },
        {
            "title": "Task 3: Household energy",
            "description": (
                "Run the household energy graph using only stocks and flows. Identify stored energy, the grid and solar "
                "supply inflow, and the appliance and heat loss outflow."
            ),
            "graph": STOCKS_FLOWS_ENERGY,
            "order_index": 2,
        },
        {
            "title": "Task 4: Population births and deaths",
            "description": (
                "Run the one-stock population graph. Births are the inflow and deaths are the outflow. Explain when the "
                "population rises, falls, or stays close to steady."
            ),
            "graph": STOCKS_FLOWS_POPULATION,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Lesson: Constants and Variables
# ===========================================================================

CONSTANTS_VARIABLES_CONTENT = """\

After this lesson you will be able to clearly tell a **stock** and a **flow** apart from a **constant** (parameter) and an **auxiliary variable**.

Only **stocks** accumulate history. A **flow** is a rate that changes a stock. A **constant** (parameter) is a number you can adjust like a dial, for example an interest rate, a price, or a goal. An **auxiliary variable** is something you calculate from other parts of the model so the diagram stays clean and readable.

### The four building blocks

- **Stocks** are the “memory” of the system, measured in units at a point in time (e.g. balance in €).
- **Flows** are rates that add to or subtract from a stock, measured per time unit (e.g. € per year).
- **Constants** are fixed numbers or policy levers you can change (they have no memory).
- **Variables (auxiliary)** are intermediate calculations that make the logic easier to see and understand.

### How this works in the lab

In the FlowSpace editor:
- Use **stock** nodes for anything that accumulates,
- Use **flow** nodes for rates that actually change a stock,
- Use **constant** nodes for parameters and policy dials,
- Use **variable** nodes for named calculations (e.g. “interest this year”).

**Pro tip:** When a flow depends on a stock through a formula, route it through a **variable** node. This keeps your diagram readable.

> **Key idea:** If you are not integrating it over time, it is **not** a stock.  
> If it is not a rate that directly changes a stock, it is **not** a flow.  
> Everything else is either a constant or an auxiliary variable.

### In the Lab

Each task asks you to separate stocks, flows, constants, and variables in a different context.


- **Task 1: Bakery production parameters**  
    Identify oven count and loaves per oven as constants, baking rate as a variable, and bread inventory as a stock in the bakery graph.
- **Task 2: Cafeteria lunch prep**  
  Finish the cafeteria model by adding the missing serving formula and information arrow.
- **Task 3: Pasture carrying capacity**  
  Build a pasture model with grass as a stock, carrying capacity as a constant, and headroom as a variable.
- **Task 4: Workload and wellbeing**  
  Build a workload and wellbeing model with constants, a strain index variable, and a wellbeing stock.
"""

CONSTANTS_VARIABLES_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "bakery_stock",
            "Bread inventory",
            400,
            240,
            quantity=64,
            unit="loaves",
            student_tooltip="Stock: finished bread ready for sale.",
            fill_cap=160,
        ),
        make_flow_node(
            "bakery_in",
            "Baking output",
            100,
            240,
            bottleneck=0,
            expression="max(0, (0) + (bakery_rate))",
            base_flow_expression="0",
            unit="loaves/step",
            student_tooltip="Flow: finished bread added each step. The rate comes from the baking-rate variable.",
        ),
        make_constant_node(
            "bakery_ovens",
            "Ovens running",
            260,
            80,
            quantity=2,
            unit="ovens",
            color=C_AUX,
            student_tooltip="Constant: number of ovens available in this scenario.",
        ),
        make_constant_node(
            "bakery_batch",
            "Loaves per oven",
            540,
            80,
            quantity=18,
            unit="loaves/step",
            color=C_AUX,
            student_tooltip="Constant: output per oven per step.",
        ),
        make_variable_node(
            "bakery_rate",
            "Baking rate = ovens × loaves/oven",
            390,
            160,
            expression="(bakery_ovens) * (bakery_batch)",
            unit="loaves/step",
            color=C_AUX,
            student_tooltip="Variable: named calculation from constants, used by the baking output flow.",
        ),
        make_flow_node(
            "bakery_out",
            "Customer purchases",
            700,
            240,
            bottleneck=28,
            unit="loaves/step",
            student_tooltip="Outflow: bread sold each step.",
        ),
    ],
    edges=[
        make_inflow_edge("edge_1", "bakery_in", "bakery_stock"),
        make_outflow_edge("edge_2", "bakery_stock", "bakery_out"),
        make_feedback_edge("edge_3", "bakery_ovens", "bakery_rate"),
        make_feedback_edge("edge_4", "bakery_batch", "bakery_rate"),
        make_feedback_edge("edge_5", "bakery_rate", "bakery_in", op="add"),
    ],
)

CONSTANTS_ROOM_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "crm_s",
            "Room temperature",
            400,
            260,
            quantity=10,
            unit="°C",
            student_tooltip="Stock: current indoor temperature: what the thermostat is trying to steer.",
        ),
        make_flow_node(
            "crm_fh",
            "Heating",
            90,
            260,
            bottleneck=0,
            expression="max(0, (0) + (crm_vc))",
            base_flow_expression="0",
            unit="°C/step",
            student_tooltip="Inflow of warmth when the room is colder than the purple goal.",
        ),
        make_flow_node(
            "crm_fc",
            "Cooling (AC)",
            710,
            260,
            bottleneck=0,
            expression="max(0, (0) + (crm_cc))",
            base_flow_expression="0",
            unit="°C/step",
            student_tooltip="Outflow of heat when the room is warmer than the goal.",
        ),
        make_constant_node(
            "crm_goal",
            "Desired temperature (constant goal)",
            400,
            70,
            quantity=20,
            loop_id="crm_l1",
            loop_role="goal",
            fb_type="balancing",
            unit="°C",
            color=C_AUX,
            student_tooltip="Constant goal: the thermostat setpoint: a parameter, not a stock.",
        ),
        make_variable_node(
            "crm_dc",
            "Gap (too cold)",
            400,
            170,
            expression="(crm_s < crm_goal ? (crm_goal - crm_s) : 0)",
            loop_id="crm_l1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Auxiliary: how far below the goal the room is.",
        ),
        make_variable_node(
            "crm_vc",
            "Heating correction",
            90,
            170,
            expression="(max(0, (crm_dc))) / (3)",
            loop_id="crm_l1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective heating strength from the cold gap.",
        ),
        make_variable_node(
            "crm_dh",
            "Gap (too hot)",
            400,
            360,
            expression="(crm_s > crm_goal ? (crm_s - crm_goal) : 0)",
            loop_id="crm_l2",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "crm_cc",
            "Cooling correction",
            620,
            360,
            expression="(max(0, (crm_dh))) / (3)",
            loop_id="crm_l2",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("crm_e1", "crm_fh", "crm_s"),
        make_outflow_edge("crm_e6", "crm_s", "crm_fc"),
        make_feedback_edge("crm_e2", "crm_goal", "crm_dc", fb_type="balancing"),
        make_feedback_edge("crm_e3", "crm_s", "crm_dc", fb_type="balancing"),
        make_feedback_edge("crm_e4", "crm_dc", "crm_vc", fb_type="balancing"),
        make_feedback_edge("crm_e5", "crm_vc", "crm_fh", op="add", fb_type="balancing"),
        make_feedback_edge("crm_e7", "crm_goal", "crm_dh", fb_type="balancing"),
        make_feedback_edge("crm_e8", "crm_s", "crm_dh", fb_type="balancing"),
        make_feedback_edge("crm_e9", "crm_dh", "crm_cc", fb_type="balancing"),
        make_feedback_edge("crm_e10", "crm_cc", "crm_fc", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "crm_l1",
            "crm_s",
            "crm_goal",
            "crm_dc",
            "crm_vc",
            "crm_fh",
            ["crm_e2", "crm_e3", "crm_e4", "crm_e5"],
            boundary_type="lower",
            goal_value=20,
            adjustment_time=3,
        ),
        make_balancing_loop(
            "crm_l2",
            "crm_s",
            "crm_goal",
            "crm_dh",
            "crm_cc",
            "crm_fc",
            ["crm_e7", "crm_e8", "crm_e9", "crm_e10"],
            boundary_type="upper",
            goal_value=20,
            adjustment_time=3,
        ),
    ],
)

CONSTANTS_PASTURE_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "cp_grass",
            "Grass on pasture",
            400,
            260,
            quantity=320,
            unit="index",
            student_tooltip="Stock: usable grass: the commons everyone shares in this teaching story.",
            visual_theme="grass",
            fill_cap=500,
        ),
        make_constant_node(
            "cp_K",
            "Carrying capacity (constant)",
            400,
            80,
            quantity=420,
            unit="index",
            color=C_AUX,
            student_tooltip="Purple constant: ecological ceiling: not a flow, a parameter you can change to test ideas.",
        ),
        make_flow_node(
            "cp_in",
            "Regrowth (rain & rest)",
            120,
            260,
            bottleneck=0,
            expression="max(0, (0) + (cp_rg))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: grass returning when there is headroom below carrying capacity.",
        ),
        make_flow_node(
            "cp_out",
            "Grazing pressure",
            680,
            260,
            bottleneck=22,
            unit="index/step",
            student_tooltip="Outflow: animals eating grass each step.",
        ),
        make_variable_node(
            "cp_rg",
            "Headroom regrowth",
            260,
            170,
            expression="(0.06) * max(0, (cp_K) - (cp_grass))",
            unit="index/step",
            color=C_AUX,
            student_tooltip="Variable: regrowth scales with how far grass is below carrying capacity.",
        ),
    ],
    edges=[
        make_inflow_edge("cp_e1", "cp_in", "cp_grass"),
        make_outflow_edge("cp_e2", "cp_grass", "cp_out"),
        make_feedback_edge("cp_e3", "cp_K", "cp_rg"),
        make_feedback_edge("cp_e4", "cp_grass", "cp_rg"),
        make_feedback_edge("cp_e5", "cp_rg", "cp_in", op="add"),
    ],
)

CONSTANTS_QUAL_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "cq_wb",
            "Team wellbeing",
            400,
            280,
            quantity=72,
            unit="index",
            student_tooltip="Stock: collective wellbeing: drained by perceived overload in this toy model.",
        ),
        make_constant_node(
            "cq_load",
            "Workload (1=low, 2=med, 3=high)",
            220,
            100,
            quantity=2,
            unit="ordinal",
            color=C_AUX,
            student_tooltip="Purple constant: qualitative load encoded as 1/2/3: edit to explore scenarios.",
        ),
        make_constant_node(
            "cq_buf",
            "Support buffer (1 to 3)",
            580,
            100,
            quantity=2,
            unit="lvl",
            color=C_AUX,
            student_tooltip="Constant: support capacity; higher values shrink the strain index.",
        ),
        make_variable_node(
            "cq_risk",
            "Strain index = load ÷ support",
            400,
            190,
            expression="(cq_load) / max(0.5, (cq_buf))",
            unit="index",
            color=C_AUX,
            student_tooltip="Variable: named calculation from constants: not a stock, not a raw parameter.",
        ),
        make_flow_node(
            "cq_out",
            "Burnout drain",
            400,
            400,
            bottleneck=0,
            expression="max(0, (0) + (cq_risk)) * 0.35",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Outflow: wellbeing lost per step; driven by the strain variable.",
        ),
    ],
    edges=[
        make_outflow_edge("cq_e1", "cq_wb", "cq_out"),
        make_feedback_edge("cq_e2", "cq_load", "cq_risk"),
        make_feedback_edge("cq_e3", "cq_buf", "cq_risk"),
        make_feedback_edge("cq_e6", "cq_risk", "cq_out", op="add"),
    ],
)

CONSTANTS_CAFE_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "cafe_todo",
            "Add the missing serving formula and reconnect serving pressure to the serving flow.",
            20,
            20,
        ),
        make_stock_node(
            "cafe_trays",
            "Prepared meal trays",
            420,
            260,
            quantity=85,
            unit="trays",
            student_tooltip="Stock: meals ready before lunch service.",
        ),
        make_flow_node(
            "cafe_cook",
            "Kitchen cooking",
            120,
            260,
            bottleneck=0,
            expression="max(0, (0) + (cafe_capacity))",
            base_flow_expression="0",
            unit="trays/step",
            student_tooltip="Inflow: cooking adds prepared meals. The rate comes from a constant.",
        ),
        make_flow_node(
            "cafe_serve",
            "Lunch service",
            700,
            260,
            bottleneck=0,
            expression="",
            base_flow_expression="0",
            unit="trays/step",
            student_tooltip="Finish this flow: it should use the serving pressure variable.",
        ),
        make_constant_node(
            "cafe_capacity",
            "Cooking capacity",
            120,
            90,
            quantity=18,
            unit="trays/step",
            student_tooltip="Constant: kitchen output per step.",
        ),
        make_constant_node(
            "cafe_expected",
            "Expected student demand",
            620,
            90,
            quantity=22,
            unit="trays/step",
            student_tooltip="Constant: expected lunch demand for the scenario.",
        ),
        make_variable_node(
            "cafe_pressure",
            "Serving pressure",
            560,
            170,
            expression="min((cafe_expected), (cafe_trays))",
            unit="trays/step",
            student_tooltip="Variable: named calculation that limits serving by demand and available trays.",
        ),
    ],
    edges=[
        make_feedback_edge("cafe_e1", "cafe_capacity", "cafe_cook", op="add"),
        make_inflow_edge("cafe_e2", "cafe_cook", "cafe_trays"),
        make_outflow_edge("cafe_e3", "cafe_trays", "cafe_serve"),
        make_feedback_edge("cafe_e4", "cafe_expected", "cafe_pressure"),
        make_feedback_edge("cafe_e5", "cafe_trays", "cafe_pressure"),
    ],
)

LESSON_CONSTANTS_AND_VARIABLES = {
    "title": "Constants and Variables",
    "order_index": 1,
    "content_markdown": CONSTANTS_VARIABLES_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Bakery production",
            "description": (
                "In the bakery graph, identify the **Ovens running** and **Loaves per oven** constants, then explain "
                "how the **Baking rate** variable drives the inventory inflow."
            ),
            "graph": CONSTANTS_VARIABLES_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Cafeteria lunch prep",
            "description": (
                "Finish the cafeteria model. The stock, constants, and serving-pressure variable are placed; add the "
                "missing serving formula and reconnect the missing information arrow."
            ),
            "graph": CONSTANTS_CAFE_ALMOST,
            "order_index": 1,
        },
        {
            "title": "Task 3: Carrying capacity on a pasture",
            "description": (
                "In the shared pasture graph, identify **carrying capacity** as a constant. "
                "Explain in your own words how it interacts with the grass stock, regrowth, and grazing."
            ),
            "graph": CONSTANTS_PASTURE_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Qualitative levels vs variables",
            "description": (
                "In the qualitative model, explain the difference between the **workload ordinal constant** "
                "(1/2/3), the **strain index** variable, and the **wellbeing** stock. Which one remembers history?"
            ),
            "graph": CONSTANTS_QUAL_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Lesson 2: Balancing Feedback Loops
# ===========================================================================

BALANCING_LOOPS_CONTENT = """\

**Learning objective:** You can recognize a balancing (goal seeking) feedback loop, explain how it works, and understand why it brings stability to systems.

Balancing feedback loops are also called negative feedback loops or stabilizing loops. They are one of the most common and important structures in natural, social, and technical systems.

### What Is a Balancing Loop?

A balancing loop is a **goal seeking** structure. It constantly compares the current state of a **stock** with a **desired goal** and then acts to close the gap between them.

It works like a thermostat:
- When the stock is **below** the goal, the loop **increases** the inflow (or decreases the outflow).
- When the stock is **above** the goal, the loop **decreases** the inflow (or increases the outflow).
- As the gap shrinks, the corrective action automatically weakens.

The system gradually approaches the goal and settles near it, this is called **dynamic equilibrium**.

### The Four Core Elements of Every Balancing Loop

1. **Stock**, the actual state of the system (e.g. room temperature, water level in a reservoir, bank balance).
2. **Goal**, the desired state (e.g. 20 °C, target inventory level).
3. **Discrepancy / Gap**, the difference between the actual stock and the goal.
4. **Corrective Action**, a flow that reduces the gap (heating, ordering more goods, saving more money).

### Classic Example: The Thermostat

- **Stock**: Room temperature
- **Goal**: Thermostat setting (e.g. 20 °C)
- **Discrepancy**: Goal temperature minus actual temperature
- **Corrective action**: Heat from the furnace (inflow)

The bigger the gap, the stronger the heating. As the room warms up, the furnace gradually turns down. The loop self corrects.

### Key Properties of Balancing Loops

- They are **stabilizing**, they resist change and try to keep the stock steady.
- They oppose whatever direction you push the system.
- The **strength** of the loop and the **adjustment time** (how quickly it reacts) determine how well it works.
- **Delays** in balancing loops often cause oscillations or overshoot (the system swings past the goal and back again).

> **Key insight:**  
> “Balancing feedback loops are goal seeking or stability seeking. Each tries to keep a stock at a given value or within a range of values. A balancing feedback loop opposes whatever direction of change is imposed on the system.”

### Why This Matters

Balancing loops are the main reason many systems are stable. But if the goal is wrong, the loop is too weak, or there are long delays, they can create problems (e.g. constant oscillations, policy resistance, or failure to reach the real target).

### In the Lab

The lab moves from a finished reference graph to guided completion and then blank canvas modeling.


- **Task 1: Thermostat stability**  
    Trace goal, gap, corrective action, heating, and cooling in the thermostat model.
- **Task 2: Student self evaluation**  
  Finish the student performance loop so study effort moves performance toward the target grade.
- **Task 3: Shop inventory**  
    Build a shop inventory balancing loop.
- **Task 4: Body temperature**  
  Build body temperature regulation with heat generation and heat loss around a setpoint.

Mastering balancing loops is essential, almost every stable system you encounter (body temperature, inventory, budgets, ecosystems) relies on them.
"""

BALANCING_LOOP_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_1",
            "Room Temperature",
            400,
            260,
            quantity=10,
            unit="°C",
            student_tooltip="Stock: how warm the room is right now. Too cold → heating inflow; too hot → cooling outflow.",
        ),
        make_flow_node(
            "flow_1",
            "Heating (inflow of warmth)",
            90,
            260,
            bottleneck=0,
            expression="max(0, (0) + (variable_2))",
            base_flow_expression="0",
            unit="°C/step",
            student_tooltip="Inflow (green): warmth added per step when the room is below the goal.",
        ),
        make_flow_node(
            "flow_2",
            "Cooling (AC outflow)",
            710,
            260,
            bottleneck=0,
            expression="max(0, (0) + (variable_4))",
            base_flow_expression="0",
            unit="°C/step",
            student_tooltip="Outflow (red): heat removed per step when the room is above the goal.",
        ),
        make_constant_node(
            "constant_1",
            "Desired Temperature (goal)",
            400,
            70,
            quantity=20,
            loop_id="loop_1",
            loop_role="goal",
            fb_type="balancing",
            unit="°C",
            color=C_AUX,
            student_tooltip="Goal (purple): thermostat setpoint. Use the lesson slider or edit the value: the room should move toward it.",
        ),
        make_variable_node(
            "variable_1",
            "Gap (too cold)",
            400,
            170,
            expression="(stock_1 < constant_1 ? (constant_1 - stock_1) : 0)",
            loop_id="loop_1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Gap when the room is colder than the goal. Drives heating.",
        ),
        make_variable_node(
            "variable_2",
            "Corrective heating rate",
            90,
            170,
            expression="(max(0, (variable_1))) / (3)",
            loop_id="loop_1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective action: stronger heating when the cold gap is large.",
        ),
        make_variable_node(
            "variable_3",
            "Gap (too hot)",
            400,
            360,
            expression="(stock_1 > constant_1 ? (stock_1 - constant_1) : 0)",
            loop_id="loop_2",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Gap when the room is warmer than the goal. Drives cooling.",
        ),
        make_variable_node(
            "variable_4",
            "Corrective cooling rate",
            620,
            360,
            expression="(max(0, (variable_3))) / (3)",
            loop_id="loop_2",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective action: stronger cooling when the hot gap is large.",
        ),
    ],
    edges=[
        make_inflow_edge("edge_1", "flow_1", "stock_1"),
        make_outflow_edge("edge_6", "stock_1", "flow_2"),
        make_feedback_edge("edge_2", "constant_1", "variable_1", fb_type="balancing"),
        make_feedback_edge("edge_3", "stock_1", "variable_1", fb_type="balancing"),
        make_feedback_edge("edge_4", "variable_1", "variable_2", fb_type="balancing"),
        make_feedback_edge("edge_5", "variable_2", "flow_1", op="add", fb_type="balancing"),
        make_feedback_edge("edge_7", "constant_1", "variable_3", fb_type="balancing"),
        make_feedback_edge("edge_8", "stock_1", "variable_3", fb_type="balancing"),
        make_feedback_edge("edge_9", "variable_3", "variable_4", fb_type="balancing"),
        make_feedback_edge("edge_10", "variable_4", "flow_2", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "loop_1",
            "stock_1",
            "constant_1",
            "variable_1",
            "variable_2",
            "flow_1",
            ["edge_2", "edge_3", "edge_4", "edge_5"],
            boundary_type="lower",
            goal_value=20,
            adjustment_time=3,
        ),
        make_balancing_loop(
            "loop_2",
            "stock_1",
            "constant_1",
            "variable_3",
            "variable_4",
            "flow_2",
            ["edge_7", "edge_8", "edge_9", "edge_10"],
            boundary_type="upper",
            goal_value=20,
            adjustment_time=3,
        ),
    ],
)

BAL_STUDENT_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "bs_s",
            "Course performance (%)",
            400,
            260,
            quantity=58,
            unit="%",
            student_tooltip="Stock: measured performance: the loop tries to pull it toward the goal.",
        ),
        make_flow_node(
            "bs_fin",
            "Study effort (gain)",
            90,
            260,
            bottleneck=0,
            expression="max(0, (0) + (bs_c1))",
            base_flow_expression="0",
            unit="%/wk",
            student_tooltip="Inflow: learning gain from extra effort when you are below target.",
        ),
        make_flow_node(
            "bs_fout",
            "Slippage / forgetting",
            710,
            260,
            bottleneck=4,
            unit="%/wk",
            student_tooltip="Outflow: drift from distractions: keeps the story realistic.",
        ),
        make_constant_node(
            "bs_g",
            "Target grade (goal)",
            400,
            70,
            quantity=78,
            loop_id="bs_l1",
            loop_role="goal",
            fb_type="balancing",
            unit="%",
            color=C_AUX,
            student_tooltip="Purple goal: the performance you are aiming for.",
        ),
        make_variable_node(
            "bs_d",
            "Gap below goal",
            400,
            170,
            expression="(bs_s < bs_g ? (bs_g - bs_s) : 0)",
            loop_id="bs_l1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "bs_c1",
            "Extra study response",
            90,
            170,
            expression="(max(0, (bs_d))) / (4)",
            loop_id="bs_l1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective: bigger study push when the gap is large.",
        ),
    ],
    edges=[
        make_inflow_edge("bs_e1", "bs_fin", "bs_s"),
        make_outflow_edge("bs_e2", "bs_s", "bs_fout"),
        make_feedback_edge("bs_e3", "bs_g", "bs_d", fb_type="balancing"),
        make_feedback_edge("bs_e4", "bs_s", "bs_d", fb_type="balancing"),
        make_feedback_edge("bs_e5", "bs_d", "bs_c1", fb_type="balancing"),
        make_feedback_edge("bs_e6", "bs_c1", "bs_fin", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "bs_l1",
            "bs_s",
            "bs_g",
            "bs_d",
            "bs_c1",
            "bs_fin",
            ["bs_e3", "bs_e4", "bs_e5", "bs_e6"],
            boundary_type="lower",
            goal_value=78,
            adjustment_time=4,
        ),
    ],
)

BAL_SHOP_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "sh_s",
            "Units on shelf",
            400,
            260,
            quantity=42,
            unit="boxes",
            student_tooltip="Stock: inventory the shopkeeper watches.",
        ),
        make_flow_node(
            "sh_in",
            "Reorder arrivals",
            90,
            260,
            bottleneck=0,
            expression="max(0, (0) + (sh_c))",
            base_flow_expression="0",
            unit="boxes/wk",
            student_tooltip="Inflow: deliveries triggered by the gap below target stock.",
        ),
        make_flow_node(
            "sh_out",
            "Customer purchases",
            710,
            260,
            bottleneck=11,
            unit="boxes/wk",
            student_tooltip="Outflow: sales steadily drain the shelf.",
        ),
        make_constant_node(
            "sh_g",
            "Target shelf stock",
            400,
            70,
            quantity=55,
            loop_id="sh_l1",
            loop_role="goal",
            fb_type="balancing",
            unit="boxes",
            color=C_AUX,
        ),
        make_variable_node(
            "sh_d",
            "Stockout gap",
            400,
            170,
            expression="(sh_s < sh_g ? (sh_g - sh_s) : 0)",
            loop_id="sh_l1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "sh_c",
            "Order correction",
            90,
            170,
            expression="(max(0, (sh_d))) / (3)",
            loop_id="sh_l1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("sh_e1", "sh_in", "sh_s"),
        make_outflow_edge("sh_e2", "sh_s", "sh_out"),
        make_feedback_edge("sh_e3", "sh_g", "sh_d", fb_type="balancing"),
        make_feedback_edge("sh_e4", "sh_s", "sh_d", fb_type="balancing"),
        make_feedback_edge("sh_e5", "sh_d", "sh_c", fb_type="balancing"),
        make_feedback_edge("sh_e6", "sh_c", "sh_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "sh_l1",
            "sh_s",
            "sh_g",
            "sh_d",
            "sh_c",
            "sh_in",
            ["sh_e3", "sh_e4", "sh_e5", "sh_e6"],
            boundary_type="lower",
            goal_value=55,
            adjustment_time=3,
        ),
    ],
)

BAL_BODY_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "bd_s",
            "Core body temperature",
            400,
            260,
            quantity=36.9,
            unit="°C",
            student_tooltip="Stock: deep core temperature: tightly regulated.",
        ),
        make_flow_node(
            "bd_in",
            "Heat generation (metabolism)",
            90,
            260,
            bottleneck=0,
            expression="max(0, (0) + (bd_c1))",
            base_flow_expression="0",
            unit="°C/h",
            student_tooltip="Inflow: metabolic heat when you are cooler than the setpoint.",
        ),
        make_flow_node(
            "bd_out",
            "Heat loss (sweat & environment)",
            710,
            260,
            bottleneck=0,
            expression="max(0, (0) + (bd_c2))",
            base_flow_expression="0",
            unit="°C/h",
            student_tooltip="Outflow: cooling when you run warmer than the setpoint.",
        ),
        make_constant_node(
            "bd_g",
            "Setpoint (~37 °C)",
            400,
            70,
            quantity=37.0,
            loop_id="bd_l1",
            loop_role="goal",
            fb_type="balancing",
            unit="°C",
            color=C_AUX,
        ),
        make_variable_node(
            "bd_d1",
            "Too cold gap",
            400,
            170,
            expression="(bd_s < bd_g ? (bd_g - bd_s) : 0)",
            loop_id="bd_l1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "bd_c1",
            "Warm-up response",
            90,
            170,
            expression="(max(0, (bd_d1))) / (2.5)",
            loop_id="bd_l1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "bd_d2",
            "Too hot gap",
            400,
            360,
            expression="(bd_s > bd_g ? (bd_s - bd_g) : 0)",
            loop_id="bd_l2",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "bd_c2",
            "Cool-down response",
            620,
            360,
            expression="(max(0, (bd_d2))) / (2.5)",
            loop_id="bd_l2",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("bd_e1", "bd_in", "bd_s"),
        make_outflow_edge("bd_e6", "bd_s", "bd_out"),
        make_feedback_edge("bd_e2", "bd_g", "bd_d1", fb_type="balancing"),
        make_feedback_edge("bd_e3", "bd_s", "bd_d1", fb_type="balancing"),
        make_feedback_edge("bd_e4", "bd_d1", "bd_c1", fb_type="balancing"),
        make_feedback_edge("bd_e5", "bd_c1", "bd_in", op="add", fb_type="balancing"),
        make_feedback_edge("bd_e7", "bd_g", "bd_d2", fb_type="balancing"),
        make_feedback_edge("bd_e8", "bd_s", "bd_d2", fb_type="balancing"),
        make_feedback_edge("bd_e9", "bd_d2", "bd_c2", fb_type="balancing"),
        make_feedback_edge("bd_e10", "bd_c2", "bd_out", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "bd_l1",
            "bd_s",
            "bd_g",
            "bd_d1",
            "bd_c1",
            "bd_in",
            ["bd_e2", "bd_e3", "bd_e4", "bd_e5"],
            boundary_type="lower",
            goal_value=37,
            adjustment_time=2.5,
        ),
        make_balancing_loop(
            "bd_l2",
            "bd_s",
            "bd_g",
            "bd_d2",
            "bd_c2",
            "bd_out",
            ["bd_e7", "bd_e8", "bd_e9", "bd_e10"],
            boundary_type="upper",
            goal_value=37,
            adjustment_time=2.5,
        ),
    ],
)

LESSON_BALANCING_LOOPS = {
    "title": "Balancing Loop",
    "order_index": 0,
    "content_markdown": BALANCING_LOOPS_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Thermostat stability",
            "description": (
                "Run the thermostat model: keep **room temperature** near a **setpoint** using heating "
                "inflow and cooling outflow. Change the goal and describe how the stock follows."
            ),
            "graph": BALANCING_LOOP_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Student self-evaluation",
            "description": (
                "Run the student loop: **low performance** should increase **study effort** (inflow) "
                "so **performance** moves toward the purple goal. Explain the gap variable in words."
            ),
            "graph": BAL_STUDENT_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: Shop inventory",
            "description": (
                "Run the shop model: **inventory** should track a **target** via reorder inflow while "
                "sales drain the shelf. How does the balancing loop fight stockouts?"
            ),
            "graph": BAL_SHOP_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Body temperature",
            "description": (
                "Run the core **body temperature** regulation model: metabolic heat when too cold, heat loss "
                "when too hot, around a narrow setpoint."
            ),
            "graph": BAL_BODY_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Lesson 3: Reinforcing Feedback Loops
# ===========================================================================

REINFORCING_LOOPS_CONTENT = """\

**Learning objective:** You can recognize a reinforcing (amplifying) feedback loop, trace its polarity, and understand how it produces exponential growth or runaway decline.

Reinforcing loops, also called positive feedback loops, are the second fundamental type of feedback. While balancing loops seek stability, reinforcing loops *amplify* change. They are the engines behind exponential growth, success spirals, vicious cycles, and collapse.

### What Is a Reinforcing Loop?

A reinforcing loop occurs when a **stock** influences a **flow** that then changes the same stock in the *same direction*.  
More leads to more. Less leads to less.

The loop feeds on itself and makes small changes grow rapidly over time.

### Classic Example: Compound Interest

- **Stock**: Money in your savings account
- **Flow**: Interest added each year
- The more money you have (stock), the more interest you earn (flow).
- That interest is added back to the stock, even more interest next year.

This is pure reinforcement: the stock strengthens its own growth.

### How Reinforcing Loops Work in Both Directions

Reinforcing loops have **polarity**:

- **Growth direction** (positive polarity): More stock creates stronger inflow, which creates even more stock, producing exponential growth.
- **Decline direction** (negative polarity): Less stock creates weaker inflow, which creates even less stock, producing accelerating collapse.

**Real world examples:**
- Population growth: More people, more births, more people.
- Word of mouth sales: More customers, more recommendations, more customers.
- Vicious cycle: Failing company, fewer customers, less revenue, more failure.
- Soil erosion: Less soil, poorer grass, even less soil.

### Key Properties of Reinforcing Loops

- They are **self enhancing**, they amplify whatever direction of change is already happening.
- They generate **exponential behavior** (the famous hockey stick curve).
- They are extremely powerful, but rarely run forever unchecked.
- In real systems, reinforcing loops eventually meet **balancing loops** or physical limits, often creating **S shaped growth** or **overshoot and collapse**.

> **Key insight:**  
> “A reinforcing feedback loop enhances whatever direction of change is imposed on the system. It generates more input to a stock the more that is already there (and less input the less that is already there). Reinforcing feedback loops are self enhancing, leading to exponential growth or to runaway collapses over time.”

### Why This Matters

Reinforcing loops explain both miracles of growth and tragic downward spirals. Understanding them helps you spot where small interventions can have huge effects, either to accelerate good growth or to break destructive cycles.

### In the Lab

The lab separates a finished reinforcing reference from one completion task and two blank canvas challenges.

- **Task 1: Population growth (R)**  
    Trace stock, multiplier, inflow, and stock again in the population growth reference graph.
- **Task 2: Self confidence spiral**  
  Finish the self confidence spiral by adding the multiplier expression and reinforcing information links.
- **Task 3: Compound interest**  
    Build a compound interest reinforcing loop.
- **Task 4: Viral adoption**  
    Build a viral adoption reinforcing loop.

Mastering reinforcing loops is crucial, they drive most of the dramatic change we see in economies, populations, technologies, and ecosystems.
"""

REINFORCING_LOOP_DEMO = compose_graph(
    nodes=[
        make_comment_node(
            "r1_intro",
            "Reference: population (R). Orange links = the (R) loop. Gray **k → multiplier** link = that parameter feeds the **(r1_k)** in the expression (change **k** in the left panel, then Run).",
            20,
            20,
        ),
        make_comment_node(
            "r1_chart",
            "After **Run**, the population chart curves upward. Change **k** in the toolbar and re-run.",
            420,
            20,
        ),
        make_constant_node(
            "r1_k",
            "k (growth per person / step)",
            90,
            100,
            quantity=0.1,
            unit="1/step",
            color=C_AUX,
            student_tooltip="Gray arrow to the multiplier: this value is used in (r1_k)×(stock_1).",
        ),
        make_variable_node(
            "variable_1",
            "Implied net births = (r1_k) × P",
            280,
            130,
            expression="(r1_k) * (stock_1)",
            loop_id="loop_1",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
            student_tooltip="Multiplier in the (R) loop: inflow scales with the stock through k.",
        ),
        make_flow_node(
            "flow_1",
            "Net births (growth inflow)",
            90,
            300,
            bottleneck=0,
            expression="max(0, (0) + (variable_1))",
            base_flow_expression="0",
            unit="people/step",
            student_tooltip="Material inflow: net people added per step, reinforced by the loop.",
        ),
        make_stock_node(
            "stock_1",
            "Population P",
            400,
            300,
            quantity=100,
            unit="people",
            student_tooltip="Stock: people in the region. (R) means more P → more births → more P.",
        ),
    ],
    edges=[
        make_inflow_edge("edge_1", "flow_1", "stock_1"),
        make_feedback_edge("r1_e_k", "r1_k", "variable_1"),
        make_feedback_edge("edge_2", "stock_1", "variable_1", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("edge_3", "variable_1", "flow_1", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop(
            "loop_1",
            "stock_1",
            "variable_1",
            "flow_1",
            ["edge_2", "edge_3"],
            k=0.1,
            polarity="positive",
        )
    ],
)

REINFORCING_CONFIDENCE_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "cf_howto",
            "(1) Set the orange **multiplier** (e.g. `(0.12)*(cf_s)`). (2) Add the two **(R)** links or use *Create → Reinforcing loop* on the inflow, then run.",
            420,
            20,
        ),
        make_stock_node(
            "cf_s",
            "Self-confidence",
            400,
            300,
            quantity=40,
            unit="index",
            student_tooltip="Stock: confidence is reinforced when success arrives faster than it fades.",
        ),
        make_flow_node(
            "cf_f",
            "Successful attempts / week",
            90,
            300,
            bottleneck=0,
            expression="max(0, (0) + (cf_m))",
            base_flow_expression="0",
            unit="pts/wk",
            student_tooltip="Inflow: wins / positive feedback. Stays 0 until the multiplier (cf_m) is set.",
        ),
        make_variable_node(
            "cf_m",
            "Set: k × self confidence (empty)",
            260,
            120,
            expression="",
            color=C_REINFORCING,
            student_tooltip="Add your formula: k times the confidence stock, or pair this node with a reinforcing loop from the flow.",
        ),
    ],
    edges=[
        make_inflow_edge("cf_e1", "cf_f", "cf_s"),
    ],
    feedback_loops=[],
)

LESSON_REINFORCING_LOOPS = {
    "title": "Reinforcing Loop",
    "order_index": 1,
    "content_markdown": REINFORCING_LOOPS_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Population growth (R)",
            "description": (
                "Open the **finished reference** graph (notes, constant k, stock, inflow, multiplier, orange links). "
                "Run the simulation and explain how **more people → more births → more people** shows up in the **chart** "
                "(bending growth vs straight-line growth if k were zero)."
            ),
            "graph": REINFORCING_LOOP_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Self-confidence spiral",
            "description": (
                "The canvas is **almost ready**: stock and the success **inflow** are wired, but the **reinforcing link** is "
                "incomplete. Follow the on-canvas note: set the **orange multiplier** and add the two **(R) feedback** edges "
                "(or use *Create → Reinforcing loop* on the inflow), run the model, and describe the virtuous cycle in one short paragraph."
            ),
            "graph": REINFORCING_CONFIDENCE_ALMOST,
            "order_index": 1,
        },
        {
            "title": "Task 3: Compound interest",
            "description": (
                "Start from an **empty graph**. Build a **compound interest** reinforcing loop: **savings** as stock, **interest** "
                "as inflow that scales with the balance. Run the simulation, then **submit your model and a short write-up to your "
                "teacher** (how the curve differs from a fixed inflow). Optional: name how this differs from treating the interest "
                "rate as a *constant parameter* in other lessons."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 2,
        },
        {
            "title": "Task 4: Viral adoption",
            "description": (
                "Start from an **empty graph**. Build a **viral product adoption** loop: **active users** as stock, **new user** "
                "inflow that scales with the user base (reinforcing). Run the simulation, **submit the graph and explanation to your "
                "teacher**, and name one real product or idea that resembled this pattern early on."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Lesson: Delays (in feedback)
# ===========================================================================

DELAYS_CONTENT = """\

**Learning objective:** You can explain how delays in feedback loops (especially balancing ones) cause oscillation and overshoot, and you can experiment with delay length in models.

One of the most important lessons in systems thinking is the powerful and often underestimated role of **delays**. Delays are the time gaps between an action and its visible effect, and they are everywhere in real systems.

### The Classic Shower Example

You turn on the shower and it’s cold. You crank up the hot water. Nothing happens immediately, so you turn it even higher. Suddenly, scalding water! You quickly turn it down too far. Now it’s freezing again. You oscillate between too hot and too cold.

This everyday frustration perfectly illustrates what delays do in systems: they cause **overshoot** and **oscillation**.

### Why Delays Create Oscillation

In a balancing loop without delay, the system gently corrects toward the goal.  
Add a significant delay and the behavior changes dramatically:

1. The system detects a gap and takes strong corrective action.
2. Because of the delay, the effect of that action arrives **late**, after the gap has already started closing on its own.
3. The system has already overshot the goal.
4. The balancing loop now corrects in the opposite direction, often too strongly.
5. The result: persistent **oscillation** around the target.

A delay in a balancing feedback loop makes a system likely to oscillate.

### Common Real World Examples

- **Supply chains**: Orders placed based on current sales, but goods arrive weeks later, boom and bust inventory cycles.
- **Economics**: Policy decisions react to data that is already outdated, economic cycles.
- **Population**: Time between birth decisions and actual population impact, oscillations.
- **Ecosystems**: Predator prey cycles.

### Key Insights

- Delays are **pervasive** and strong determinants of system behavior.
- **Short delays** can still create overreaction and amplified oscillation.
- **Long delays** can create sluggish response, sustained oscillation, or exploding oscillation.
- **Leverage point**: You can often stabilize a system either by **shortening the delay** (faster information or response) **or** by **slowing down the corrective action** to match the delay.

> **Key insight:**  
> “Delays in feedback loops are critical relative to the rates of change in the system. They are a common cause of oscillations. Changing the length of a delay may (or may not) make a large change in the behavior of a system.”

Delays explain why well intentioned interventions often make things worse, and why patience and foresight are essential in complex systems.

### In the Lab

The lab uses delayed balancing loops in inventory, pollution, management, and supply chain settings.


- **Task 1: Car dealership**  
    Trace target inventory, delayed reorder correction, shipments, and customer sales in the car dealership model.
- **Task 2: Pollution visibility**  
  Finish the pollution visibility model by completing the delayed response path.
- **Task 3: Decision making lag**  
  Build a project quality model where late metrics cause delayed improvement initiatives and possible overcorrection.
- **Task 4: Supply chain**  
  Build a retail shelf model with customer purchases, target stock, delayed replenishment, and order to receipt delay.

Understanding delays is one of the most practical skills in systems thinking, it helps you stop fighting the system and start working with its natural timing.
"""

DELAYS_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_1",
            "Cars in Stock",
            420,
            260,
            quantity=55,
            unit="cars",
            student_tooltip="Inventory on the lot. Sales drain it; delayed shipments refill it: often too late, causing swings.",
        ),
        make_flow_node(
            "flow_in",
            "Shipments from factory",
            100,
            260,
            bottleneck=0,
            expression="max(0, (0) + (variable_2))",
            base_flow_expression="0",
            unit="cars/step",
            student_tooltip="Inflow: cars arriving per step after orders work through the pipeline.",
        ),
        make_flow_node(
            "flow_out",
            "Customer sales",
            720,
            260,
            bottleneck=13,
            unit="cars/step",
            student_tooltip="Outflow: cars sold per step: steady demand pulls inventory down.",
        ),
        make_constant_node(
            "constant_goal",
            "Target inventory on lot",
            420,
            70,
            quantity=85,
            loop_id="loop_1",
            loop_role="goal",
            fb_type="balancing",
            unit="cars",
            color=C_AUX,
            student_tooltip="Goal: how many cars management wants on hand. Edit to see how the target reshapes oscillation.",
        ),
        make_constant_node(
            "constant_delay",
            "Delay: order → delivery (6 steps)",
            620,
            40,
            quantity=6,
            unit="steps",
            color=C_DELAY,
            student_tooltip="Yellow delay marker (Delay lesson only): lag between placing orders and receiving cars: drives oscillation.",
        ),
        make_variable_node(
            "variable_1",
            "Stockout gap (target − on hand)",
            420,
            170,
            expression="(stock_1 < constant_goal ? (constant_goal - stock_1) : 0)",
            loop_id="loop_1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="How far below target you are. Drives ordering: but the effect is delayed.",
        ),
        make_variable_node(
            "variable_2",
            "Order rate (delayed correction)",
            100,
            170,
            expression='(max(0, (delay("variable_1", 6)))) / (4)',
            loop_id="loop_1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective orders: scaled from a *delayed* view of the gap: classic source of inventory cycles.",
        ),
    ],
    edges=[
        make_inflow_edge("e_in", "flow_in", "stock_1"),
        make_outflow_edge("e_out", "stock_1", "flow_out"),
        make_feedback_edge("e2", "constant_goal", "variable_1", fb_type="balancing"),
        make_feedback_edge("e3", "stock_1", "variable_1", fb_type="balancing"),
        make_feedback_edge("e4", "variable_1", "variable_2", fb_type="balancing"),
        make_feedback_edge("e5", "variable_2", "flow_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "loop_1",
            "stock_1",
            "constant_goal",
            "variable_1",
            "variable_2",
            "flow_in",
            ["e2", "e3", "e4", "e5"],
            boundary_type="lower",
            goal_value=85,
            adjustment_time=4,
            delay_enabled=True,
            delay_steps=6,
        )
    ],
)

DELAYS_POLLUTION_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "dp_s",
            "Water quality index",
            420,
            260,
            quantity=58,
            unit="index",
            student_tooltip="Stock: quality people care about: restoration funding reacts only after delayed reports.",
        ),
        make_flow_node(
            "dp_in",
            "Restoration & treatment (delayed)",
            100,
            260,
            bottleneck=0,
            expression="max(0, (0) + (dp_c))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: cleanup effort that finally arrives after decision-makers see the gap (delayed).",
        ),
        make_flow_node(
            "dp_out",
            "Ongoing emissions & runoff",
            720,
            260,
            bottleneck=9,
            unit="index/step",
            student_tooltip="Outflow: pollution stressors dragging quality down each step.",
        ),
        make_constant_node(
            "dp_goal",
            "Public health target",
            420,
            70,
            quantity=72,
            loop_id="dp_l",
            loop_role="goal",
            fb_type="balancing",
            unit="index",
            color=C_AUX,
        ),
        make_constant_node(
            "dp_delay",
            "Lag: emission → visible harm (6 steps)",
            620,
            40,
            quantity=6,
            unit="steps",
            color=C_DELAY,
            student_tooltip="Yellow: delay between causes and visible effects: only in Delay lesson graphs.",
        ),
        make_variable_node(
            "dp_d",
            "Gap above safe level",
            420,
            170,
            expression="(dp_s < dp_goal ? (dp_goal - dp_s) : 0)",
            loop_id="dp_l",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "dp_c",
            "Policy response (delayed)",
            100,
            170,
            expression='(max(0, (delay("dp_d", 6)))) / (4)',
            loop_id="dp_l",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("dp_i1", "dp_in", "dp_s"),
        make_outflow_edge("dp_o1", "dp_s", "dp_out"),
        make_feedback_edge("dp_f2", "dp_goal", "dp_d", fb_type="balancing"),
        make_feedback_edge("dp_f3", "dp_s", "dp_d", fb_type="balancing"),
        make_feedback_edge("dp_f4", "dp_d", "dp_c", fb_type="balancing"),
        make_feedback_edge("dp_f5", "dp_c", "dp_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "dp_l",
            "dp_s",
            "dp_goal",
            "dp_d",
            "dp_c",
            "dp_in",
            ["dp_f2", "dp_f3", "dp_f4", "dp_f5"],
            boundary_type="lower",
            goal_value=72,
            adjustment_time=4,
            delay_enabled=True,
            delay_steps=6,
        )
    ],
)

DELAYS_DECISION_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "dd_s",
            "Project quality",
            420,
            260,
            quantity=52,
            unit="index",
            student_tooltip="Stock: quality of the work: managers only see it through delayed reports.",
        ),
        make_flow_node(
            "dd_in",
            "Improvement initiatives",
            100,
            260,
            bottleneck=0,
            expression="max(0, (0) + (dd_c))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: fixes launched after metrics finally show a gap.",
        ),
        make_flow_node(
            "dd_out",
            "Scope churn / rework drag",
            720,
            260,
            bottleneck=11,
            unit="index/step",
        ),
        make_constant_node(
            "dd_goal",
            "Quality bar (target)",
            420,
            70,
            quantity=72,
            loop_id="dd_l",
            loop_role="goal",
            fb_type="balancing",
            unit="index",
            color=C_AUX,
        ),
        make_constant_node(
            "dd_delay",
            "Lag: action → measured result (6 steps)",
            620,
            40,
            quantity=6,
            unit="steps",
            color=C_DELAY,
        ),
        make_variable_node(
            "dd_d",
            "Quality gap",
            420,
            170,
            expression="(dd_s < dd_goal ? (dd_goal - dd_s) : 0)",
            loop_id="dd_l",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "dd_c",
            "Management correction (delayed)",
            100,
            170,
            expression='(max(0, (delay("dd_d", 6)))) / (4)',
            loop_id="dd_l",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("dd_i1", "dd_in", "dd_s"),
        make_outflow_edge("dd_o1", "dd_s", "dd_out"),
        make_feedback_edge("dd_f2", "dd_goal", "dd_d", fb_type="balancing"),
        make_feedback_edge("dd_f3", "dd_s", "dd_d", fb_type="balancing"),
        make_feedback_edge("dd_f4", "dd_d", "dd_c", fb_type="balancing"),
        make_feedback_edge("dd_f5", "dd_c", "dd_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "dd_l",
            "dd_s",
            "dd_goal",
            "dd_d",
            "dd_c",
            "dd_in",
            ["dd_f2", "dd_f3", "dd_f4", "dd_f5"],
            boundary_type="lower",
            goal_value=72,
            adjustment_time=4,
            delay_enabled=True,
            delay_steps=6,
        )
    ],
)

DELAYS_SUPPLY_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "ds_s",
            "Retail shelf stock",
            420,
            260,
            quantity=40,
            unit="cases",
            student_tooltip="Stock: finished goods at store: swings when warehouse shipments lag.",
        ),
        make_flow_node(
            "ds_in",
            "Warehouse shipments",
            100,
            260,
            bottleneck=0,
            expression="max(0, (0) + (ds_c))",
            base_flow_expression="0",
            unit="cases/step",
        ),
        make_flow_node(
            "ds_out",
            "Customer purchases",
            720,
            260,
            bottleneck=12,
            unit="cases/step",
        ),
        make_constant_node(
            "ds_goal",
            "Target on-shelf inventory",
            420,
            70,
            quantity=68,
            loop_id="ds_l",
            loop_role="goal",
            fb_type="balancing",
            unit="cases",
            color=C_AUX,
        ),
        make_constant_node(
            "ds_delay",
            "Lag: order → receipt (6 steps)",
            620,
            40,
            quantity=6,
            unit="steps",
            color=C_DELAY,
        ),
        make_variable_node(
            "ds_d",
            "Shelf gap",
            420,
            170,
            expression="(ds_s < ds_goal ? (ds_goal - ds_s) : 0)",
            loop_id="ds_l",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "ds_c",
            "Replenishment orders (delayed)",
            100,
            170,
            expression='(max(0, (delay("ds_d", 6)))) / (4)',
            loop_id="ds_l",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("ds_i1", "ds_in", "ds_s"),
        make_outflow_edge("ds_o1", "ds_s", "ds_out"),
        make_feedback_edge("ds_f2", "ds_goal", "ds_d", fb_type="balancing"),
        make_feedback_edge("ds_f3", "ds_s", "ds_d", fb_type="balancing"),
        make_feedback_edge("ds_f4", "ds_d", "ds_c", fb_type="balancing"),
        make_feedback_edge("ds_f5", "ds_c", "ds_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "ds_l",
            "ds_s",
            "ds_goal",
            "ds_d",
            "ds_c",
            "ds_in",
            ["ds_f2", "ds_f3", "ds_f4", "ds_f5"],
            boundary_type="lower",
            goal_value=68,
            adjustment_time=4,
            delay_enabled=True,
            delay_steps=6,
        )
    ],
)

LESSON_DELAYS = {
    "title": "Delay",
    "order_index": 2,
    "content_markdown": DELAYS_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Car dealership",
            "description": (
                "Run the dealership model with **delivery delay**. Show how **inventory** oscillates "
                "when reorders react to old shelf information (yellow delay node + delayed balancing link)."
            ),
            "graph": DELAYS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Pollution visibility",
            "description": (
                "Run the pollution story: **emissions → delayed visible harm → delayed policy response**. "
                "Explain why people might say ‘we only reacted once it was obvious.’"
            ),
            "graph": DELAYS_POLLUTION_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: Decision making lag",
            "description": (
                "Run the project-quality model: **metrics arrive late**, so management overshoots fixes. "
                "Describe one real project where that pattern appeared."
            ),
            "graph": DELAYS_DECISION_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Supply chain",
            "description": (
                "Run the supply-chain shelf model with **order to receipt delay**. "
                "Compare amplitude or frequency of swings when you imagine a faster supplier vs a slower one."
            ),
            "graph": DELAYS_SUPPLY_DEMO,
            "order_index": 3,
        },
    ],
}


# =============================================================================
# System properties
# =============================================================================


# ===========================================================================
# Resilience
# ===========================================================================

RESILIENCE_CONTENT = """\

**Learning objective:** You can define **resilience**, explain why it often conflicts with efficiency, and identify structural elements (buffers, redundancy, diversity) that build resilience in a system diagram.

Resilience is one of the most important properties of complex systems. It can be defined as:

> “The ability of a system to survive and persist within a variable environment. The opposite of brittleness or fragility.”

Resilient systems can take hits, absorb disturbances, and bounce back, sometimes even reorganizing into a better state.

### Efficiency vs. Resilience

Modern systems are often optimized for **maximum efficiency** (just in time production, minimal inventory, tight optimization). This comes at a high cost:

- Highly efficient systems run with almost no slack or spare capacity.
- When a shock hits (a supplier failure, a storm, a market crash), they break easily.
- Resilient systems deliberately keep **buffers**, **redundancy**, and **diversity**, even if it looks “wasteful” in the short term.

### What Builds Resilience?

Several structural features create resilience:

1. **Buffers / Extra Stocks**, spare inventory, savings, wetlands that store water, backup generators.
2. **Redundancy**, multiple pathways, backup suppliers, cross trained people.
3. **Diversity**, many different species, suppliers, ideas, or strategies.
4. **Self repair and Self organization**, the system’s ability to heal and adapt without external help.

**Toy model in this lesson:**
- An **operating stock** (what you normally see and use) is under constant pressure.
- A **redundant buffer stock** can release capacity when the main stock is depleted.
- This buffer represents real world resilience mechanisms: emergency funds, spare parts, biodiversity, social safety nets.

### Key Insight

> “Resilience is not the same thing as being static or constant over time. Resilient systems can be very dynamic… A system that can recover from perturbation is resilient.”

Resilience is often invisible when everything is going well, but it becomes obvious the moment a disturbance hits. Systems that look highly productive in good times can prove dangerously fragile when conditions change.

### In the Lab

The lab uses resilience examples from ecosystems, cities, health, and biodiversity.


- **Task 1: Forest after fire**  
    Identify tree cover, soil organic matter, animal activity, the fire shock, and parallel recovery paths in the forest model.
- **Task 2: City economy after crisis**  
  Finish the city recovery model by adding the missing recovery formula and connecting the support path.
- **Task 3: Personal health recovery**  
  Build a personal health recovery model with a health stock, illness drain, restorative inflows, and at least one buffer or support stock.
- **Task 4: Biodiversity resistance**  
  Build a biodiversity model with at least two species or function stocks and parallel recovery paths after disturbance.

**Important reminder:** Building resilience almost always involves a trade off with short term efficiency. The art of good system design is knowing when to optimize for productivity and when to invest in resilience.
"""

RESILIENCE_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_tr",
            "Tree cover (canopy)",
            420,
            260,
            quantity=62,
            unit="index",
            student_tooltip="Forest canopy / living biomass. Fire removes it; regrowth loop pulls it toward the teal goal.",
        ),
        make_stock_node(
            "stock_sl",
            "Soil organic matter",
            200,
            260,
            quantity=58,
            unit="index",
            student_tooltip="Soil fertility stock. The second balancing loop rebuilds organic matter after disturbance.",
        ),
        make_stock_node(
            "stock_an",
            "Animal activity",
            660,
            260,
            quantity=36,
            unit="index",
            student_tooltip="Wildlife supported by habitat quality. Tied to tree cover: diversity of stocks matters for resilience.",
        ),
        make_flow_node(
            "flow_fire",
            "Fire / drought damage",
            80,
            260,
            bottleneck=9,
            unit="index/step",
            student_tooltip="Outflow: acute stress on canopy (wildfire, die-off). Try adjusting severity in the editor.",
        ),
        make_flow_node(
            "flow_tr_in",
            "Natural regrowth",
            300,
            400,
            bottleneck=0,
            expression="max(0, (0) + (c_tr))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: canopy recovery driven by the first balancing loop (teal links).",
        ),
        make_flow_node(
            "flow_sl_in",
            "Soil rebuilding",
            520,
            400,
            bottleneck=0,
            expression="max(0, (0) + (c_sl))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: soil recovery: second balancing loop restoring organic matter.",
        ),
        make_flow_node(
            "flow_an_in",
            "Habitat → wildlife support",
            660,
            120,
            bottleneck=0,
            expression="max(0, (0.07) * (stock_tr))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow: better canopy supports more animal activity: coupling between stocks.",
        ),
        make_constant_node(
            "cg_tr",
            "Target healthy canopy",
            420,
            80,
            quantity=92,
            loop_id="loop_tr",
            loop_role="goal",
            fb_type="balancing",
            unit="index",
            color=C_AUX,
            student_tooltip="Goal for tree cover after disturbance: the regrowth loop seeks this level.",
        ),
        make_constant_node(
            "cg_sl",
            "Target soil fertility",
            200,
            80,
            quantity=72,
            loop_id="loop_sl",
            loop_role="goal",
            fb_type="balancing",
            unit="index",
            color=C_AUX,
            student_tooltip="Goal for soil organic matter: parallel recovery pathway.",
        ),
        make_variable_node(
            "d_tr",
            "Canopy gap",
            420,
            170,
            expression="(stock_tr < cg_tr ? (cg_tr - stock_tr) : 0)",
            loop_id="loop_tr",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="How far below healthy canopy the forest is.",
        ),
        make_variable_node(
            "c_tr",
            "Regrowth effort",
            300,
            170,
            expression="(max(0, (d_tr))) / (5)",
            loop_id="loop_tr",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Corrective regrowth rate from the canopy gap.",
        ),
        make_variable_node(
            "d_sl",
            "Soil gap",
            200,
            170,
            expression="(stock_sl < cg_sl ? (cg_sl - stock_sl) : 0)",
            loop_id="loop_sl",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Soil fertility shortfall after fire erosion.",
        ),
        make_variable_node(
            "c_sl",
            "Soil recovery effort",
            520,
            170,
            expression="(max(0, (d_sl))) / (6)",
            loop_id="loop_sl",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Processes that rebuild organic matter.",
        ),
    ],
    edges=[
        make_outflow_edge("e_fire", "stock_tr", "flow_fire"),
        make_inflow_edge("e_tri", "flow_tr_in", "stock_tr"),
        make_inflow_edge("e_sli", "flow_sl_in", "stock_sl"),
        make_inflow_edge("e_ani", "flow_an_in", "stock_an"),
        make_feedback_edge("et2", "cg_tr", "d_tr", fb_type="balancing"),
        make_feedback_edge("et3", "stock_tr", "d_tr", fb_type="balancing"),
        make_feedback_edge("et4", "d_tr", "c_tr", fb_type="balancing"),
        make_feedback_edge("et5", "c_tr", "flow_tr_in", op="add", fb_type="balancing"),
        make_feedback_edge("es2", "cg_sl", "d_sl", fb_type="balancing"),
        make_feedback_edge("es3", "stock_sl", "d_sl", fb_type="balancing"),
        make_feedback_edge("es4", "d_sl", "c_sl", fb_type="balancing"),
        make_feedback_edge("es5", "c_sl", "flow_sl_in", op="add", fb_type="balancing"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "loop_tr",
            "stock_tr",
            "cg_tr",
            "d_tr",
            "c_tr",
            "flow_tr_in",
            ["et2", "et3", "et4", "et5"],
            boundary_type="lower",
            goal_value=92,
            adjustment_time=5,
        ),
        make_balancing_loop(
            "loop_sl",
            "stock_sl",
            "cg_sl",
            "d_sl",
            "c_sl",
            "flow_sl_in",
            ["es2", "es3", "es4", "es5"],
            boundary_type="lower",
            goal_value=72,
            adjustment_time=6,
        ),
    ],
)

LESSON_RESILIENCE = {
    "title": "Resilience",
    "order_index": 0,
    "content_markdown": RESILIENCE_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Forest after fire",
            "description": (
                "Run the forest ecosystem model. Show **recovery** after the **fire outflow**: "
                "identify tree, soil, and animal stocks plus the teal balancing pathways."
            ),
            "graph": RESILIENCE_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: City economy after crisis",
            "description": (
                "In a **new blank lab model** (or your notes), build a city economy recovery diagram: at least two stocks "
                "and flows that represent bouncing back after a shock (contrast with a city that has no fiscal buffer)."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 1,
        },
        {
            "title": "Task 3: Personal health recovery",
            "description": (
                "Model personal **health** recovering after illness: include a health stock, a drain representing the illness, "
                "and restorative inflows (rest, care, nutrition). Relate to buffers in the forest lesson."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 2,
        },
        {
            "title": "Task 4: High biodiversity resistance",
            "description": (
                "Using the forest diagram as a template, explain how **high biodiversity** "
                "creates **parallel pathways** after disturbance. Name at least two species or functions that substitute for each other."
            ),
            "graph": RESILIENCE_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Self-organization
# ===========================================================================

SELF_ORGANIZATION_CONTENT = """\

**Learning objective:** You can explain **self organization** as a system’s ability to create new structure, rules, and patterns from within, without a central designer, and recognize why it is one of the most powerful properties of living systems.

Self organization can be defined as:

> “The ability of a system to structure itself, to create new structure, to learn, diversify, and complexify.”

Unlike a machine that is built once and stays the same, living systems (ecosystems, economies, organizations, cities, even languages) can **change their own structure** in response to internal and external conditions.

### What Self Organization Looks Like

- A flock of birds forms complex patterns without a leader.
- A neighborhood develops its own social norms and roles.
- An economy evolves new industries and technologies.
- An ecosystem develops new species interactions over time.
- A startup grows from two people into a structured company with specialized departments.

In all these cases, new structure emerges from **local interactions** and simple rules, not from top down commands.

### Why Self Organization Matters

- It allows systems to **adapt, learn, and evolve**.
- It is the source of creativity, innovation, and resilience.
- However, it requires **freedom, experimentation, and some disorder**. Too much control kills it.
- Self organization often leads to **hierarchy**, new levels of organization emerge naturally (e.g., cells, organs, organisms).

Many managers and governments try to suppress self organization because it feels messy and uncontrollable, but doing so makes systems brittle and less innovative.

### In the Lab Model

This simple model shows a basic template of self organization:
- Two stocks that **co produce** each other (a reinforcing mutual relationship).
- More of A helps create more of B.
- More of B helps create more of A.

This mutual reinforcement is a simplified stand in for real bootstrapping processes: startup ecosystems, knowledge networks, soil microbes and plants, or dialects evolving into new languages.

> **Key insight:**  
> “Self organization is basically a matter of an evolutionary raw material, a highly variable stock of information from which to select, and some consistent selection rules. Out of simple rules of self organization can grow enormous, diversifying crystals of technology, physical structures, organizations, and cultures.”

### In the Lab

The lab moves from ant hill emergence to markets, cities, and immune response.


- **Task 1: Ant hill emergence**  
    Explain how local rule constants and repeated worker deposition create global structure without a boss node in the ant hill model.
- **Task 2: Free market pricing**  
  Finish the market model by adding the missing price formula and reconnecting the signal path.
- **Task 3: Organic city growth**  
  Build a city growth model where neighborhoods, amenities, and migration interact from local incentives instead of a single central controller.
- **Task 4: Immune response**  
  Build an immune response model with threat stock, local activation, response capacity, and clearance flow.

Self organization is one of the deepest and most hopeful properties of systems, it is the reason life, societies, and economies keep surprising us with new possibilities.
"""

SELF_ORGANIZATION_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_hill",
            "Ant Hill (nest structure)",
            400,
            260,
            quantity=4,
            unit="rel. scale",
            student_tooltip="Emergent structure: no central command node: growth comes from repeated application of simple rules.",
            visual_theme="mound",
            fill_cap=80,
        ),
        make_constant_node(
            "rule_follow",
            "Local rule: follow pheromone trails",
            160,
            90,
            quantity=1,
            unit="weight",
            color=C_AUX,
            student_tooltip="Purple ‘rule’ constant: ants respond to chemical trails: a local interaction, not a blueprint.",
        ),
        make_constant_node(
            "rule_reinforce",
            "Local rule: reinforce busy paths",
            640,
            90,
            quantity=1,
            unit="weight",
            color=C_AUX,
            student_tooltip="Positive feedback on well-used routes: amplifies small random beginnings.",
        ),
        make_variable_node(
            "var_deposit",
            "Structure deposition rate",
            400,
            160,
            expression="(0.14) * (stock_hill) * (rule_follow) + (0.11) * (rule_reinforce)",
            unit="rel./step",
            color=C_AUX,
            student_tooltip="Combines rules with current mound size: bigger colony, more material moved (toy coupling).",
        ),
        make_flow_node(
            "flow_build",
            "Workers deposit material",
            400,
            380,
            bottleneck=0,
            expression="max(0, (0) + (var_deposit))",
            base_flow_expression="0",
            unit="rel./step",
            student_tooltip="Flow that builds the visible nest: driven only by local-rule constants and the hill stock.",
        ),
    ],
    edges=[
        make_feedback_edge("e1", "rule_follow", "var_deposit"),
        make_feedback_edge("e2", "rule_reinforce", "var_deposit"),
        make_feedback_edge("e3", "stock_hill", "var_deposit"),
        make_feedback_edge("e4", "var_deposit", "flow_build", op="add"),
        make_inflow_edge("e5", "flow_build", "stock_hill"),
    ],
)

LESSON_SELF_ORGANIZATION = {
    "title": "Self-Organization",
    "order_index": 1,
    "content_markdown": SELF_ORGANIZATION_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Ant hill emergence",
            "description": (
                "Run the ant hill graph 40 to 50 steps. Which **purple rule constants** create structure without a central "
                "command node? Summarize “local rule → global mound.”"
            ),
            "graph": SELF_ORGANIZATION_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Free market pricing",
            "description": (
                "Sketch a toy market: buyers, sellers, inventory, and a price variable that "
                "updates from local excess demand (no central planner)."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 1,
        },
        {
            "title": "Task 3: Organic city growth",
            "description": (
                "Model **city growth** emerging from neighborhood decisions (zoning, migration, amenities). "
                "Show at least two stocks interacting without a single “mayor” control loop."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 2,
        },
        {
            "title": "Task 4: Immune response",
            "description": (
                "Build a simplified **immune** diagram: threat stock, localized responses, and clearance flows: highlight "
                "distributed detection vs centralized coordination."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Hierarchy
# ===========================================================================

HIERARCHY_CONTENT = """\

**Learning objective:** You can recognize hierarchical structure in systems, nested stocks and flows where higher levels support (and are supported by) lower ones, and understand why healthy hierarchies are essential for resilience and function.

Nearly all complex systems are organized as **hierarchies**, systems nested inside larger systems. Cells inside organs, teams inside departments, departments inside companies, companies inside economies, ecosystems inside the biosphere.

This is not an accident. Hierarchy is one of the great systems inventions of nature and human organization.

### The Hora and Tempus Story

The story of two watchmakers:
- **Tempus** assembled watches from 1,000 tiny parts all at once. Every interruption destroyed his progress.
- **Hora** built his watches in stable subassemblies (modules). He could pause and resume without losing everything.

Hora’s hierarchical approach was far more resilient and efficient. This illustrates why complex systems almost always evolve as hierarchies.

### Key Principles of Healthy Hierarchy

- Hierarchies evolve **from the bottom up**. Lower levels self organize first.
- The purpose of the **upper levels** is to **serve** the lower levels, not the other way around.
- Good hierarchies give subsystems enough **independence** (freedom to self organize) while maintaining necessary coordination and information flow between levels.
- Information and resources should flow both ways: support downward, feedback and results upward.
- Pathological hierarchies starve or over control the lower levels, leading to brittleness, inefficiency, or collapse.

### In the Lab Model

This two level model demonstrates a simple healthy hierarchy:
- A **central stock** (higher level) allocates resources downward to support local operations.
- **Local stocks** (lower level) use those resources, generate results, and send a return flow (taxes, data, output, loyalty) back upward.

The two way exchange keeps both levels viable and creates overall system stability.

> **Key insight:**  
> “Hierarchical systems evolve from the bottom up. The purpose of the upper layers of the hierarchy is to serve the purposes of the lower layers.”  
> Healthy hierarchies balance the welfare, freedoms, and responsibilities of subsystems with the needs of the larger system.

### Why This Matters

Understanding hierarchy helps you see why:
- Over centralization kills innovation and resilience.
- Completely independent parts fail to coordinate.
- Good system design respects natural subsystem boundaries and information flows.

### In the Lab

The lab uses hierarchy stacks to show what changes when you move between levels.


- **Task 1: Environmental five level stack**  
    Trace how flows roll lower level activity into higher level stocks in the individual to planet hierarchy.
- **Task 2: Biological hierarchy**  
  Finish the biological hierarchy by reconnecting the missing roll up path.
- **Task 3: Company hierarchy**  
  Build a company hierarchy with employee, department, and company stocks plus upward result flows and downward support flows.
- **Task 4: Global issue ladder**  
  Build a local to global issue ladder for climate or health.

Mastering hierarchy is crucial for anyone who designs, manages, or intervenes in organizations, governments, or ecosystems.
"""

HIERARCHY_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "s_ind",
            "Individual",
            420,
            430,
            quantity=1200,
            unit="people",
            student_tooltip="Lowest level: individual people or agents.",
        ),
        make_stock_node(
            "s_comm",
            "Community",
            420,
            350,
            quantity=240,
            unit="groups",
            student_tooltip="Neighborhoods, organizations, or towns: meso level.",
        ),
        make_stock_node(
            "s_cty",
            "Country",
            420,
            270,
            quantity=48,
            unit="nation-scale",
            student_tooltip="National institutions and economy.",
        ),
        make_stock_node(
            "s_cont",
            "Continent",
            420,
            190,
            quantity=9,
            unit="macro",
            student_tooltip="Regional / continental interactions.",
        ),
        make_stock_node(
            "s_planet",
            "Planet",
            420,
            110,
            quantity=1,
            unit="global",
            student_tooltip="Whole-Earth / biosphere view: top of this teaching stack.",
        ),
        make_flow_node(
            "f_up1",
            "Roll-up to community",
            220,
            390,
            bottleneck=0,
            expression="(0.03) * (s_ind)",
            unit="/step",
            student_tooltip="Aggregation flow: individuals contribute to community-level stock (toy rates).",
        ),
        make_flow_node(
            "f_up2",
            "Roll-up to country",
            220,
            310,
            bottleneck=0,
            expression="(0.04) * (s_comm)",
            unit="/step",
        ),
        make_flow_node(
            "f_up3",
            "Roll-up to continent",
            220,
            230,
            bottleneck=0,
            expression="(0.05) * (s_cty)",
            unit="/step",
        ),
        make_flow_node(
            "f_up4",
            "Roll-up to planet",
            220,
            150,
            bottleneck=0,
            expression="(0.06) * (s_cont)",
            unit="/step",
        ),
    ],
    edges=[
        make_outflow_edge("o1", "s_ind", "f_up1"),
        make_inflow_edge("i1", "f_up1", "s_comm"),
        make_outflow_edge("o2", "s_comm", "f_up2"),
        make_inflow_edge("i2", "f_up2", "s_cty"),
        make_outflow_edge("o3", "s_cty", "f_up3"),
        make_inflow_edge("i3", "f_up3", "s_cont"),
        make_outflow_edge("o4", "s_cont", "f_up4"),
        make_inflow_edge("i4", "f_up4", "s_planet"),
    ],
)

HIERARCHY_BIO_DEMO = compose_graph(
    nodes=[
        make_stock_node("hb_cell", "Cells (billions)", 420, 400, quantity=3.5e12, unit="cells", student_tooltip="Microscopic scale: base of the biological stack."),
        make_stock_node("hb_org", "Organs & tissues", 420, 310, quantity=78, unit="major", student_tooltip="Meso scale: coordinated tissues."),
        make_stock_node("hb_body", "Organism", 420, 220, quantity=1, unit="individual", student_tooltip="Whole animal or plant."),
        make_stock_node("hb_eco", "Ecosystem", 420, 130, quantity=1, unit="landscape", student_tooltip="Populations + environment."),
        make_flow_node("hb_u1", "Roll-up to organs", 220, 355, bottleneck=0, expression="(0.02) * (hb_cell)", unit="/step"),
        make_flow_node("hb_u2", "Roll-up to organism", 220, 265, bottleneck=0, expression="(0.04) * (hb_org)", unit="/step"),
        make_flow_node("hb_u3", "Roll-up to ecosystem", 220, 175, bottleneck=0, expression="(0.05) * (hb_body)", unit="/step"),
    ],
    edges=[
        make_outflow_edge("hb_o1", "hb_cell", "hb_u1"),
        make_inflow_edge("hb_i1", "hb_u1", "hb_org"),
        make_outflow_edge("hb_o2", "hb_org", "hb_u2"),
        make_inflow_edge("hb_i2", "hb_u2", "hb_body"),
        make_outflow_edge("hb_o3", "hb_body", "hb_u3"),
        make_inflow_edge("hb_i3", "hb_u3", "hb_eco"),
    ],
)

HIERARCHY_COMPANY_DEMO = compose_graph(
    nodes=[
        make_stock_node("hc_emp", "Employees", 420, 360, quantity=480, unit="people"),
        make_stock_node("hc_dep", "Departments", 420, 260, quantity=12, unit="units"),
        make_stock_node("hc_co", "Company", 420, 160, quantity=1, unit="firm"),
        make_flow_node("hc_u1", "Teams → departments", 220, 310, bottleneck=0, expression="(0.03) * (hc_emp)", unit="/step"),
        make_flow_node("hc_u2", "Departments → company", 220, 210, bottleneck=0, expression="(0.06) * (hc_dep)", unit="/step"),
    ],
    edges=[
        make_outflow_edge("hc_o1", "hc_emp", "hc_u1"),
        make_inflow_edge("hc_i1", "hc_u1", "hc_dep"),
        make_outflow_edge("hc_o2", "hc_dep", "hc_u2"),
        make_inflow_edge("hc_i2", "hc_u2", "hc_co"),
    ],
)

HIERARCHY_GLOBAL_DEMO = compose_graph(
    nodes=[
        make_stock_node("hg_loc", "Local coalitions", 420, 320, quantity=120, unit="groups"),
        make_stock_node("hg_nat", "National policy", 420, 220, quantity=48, unit="programs"),
        make_stock_node("hg_int", "International agreements", 420, 120, quantity=9, unit="treaties"),
        make_flow_node("hg_u1", "Local → national agenda", 220, 270, bottleneck=0, expression="(0.04) * (hg_loc)", unit="/step"),
        make_flow_node("hg_u2", "National → global deals", 220, 170, bottleneck=0, expression="(0.05) * (hg_nat)", unit="/step"),
    ],
    edges=[
        make_outflow_edge("hg_o1", "hg_loc", "hg_u1"),
        make_inflow_edge("hg_i1", "hg_u1", "hg_nat"),
        make_outflow_edge("hg_o2", "hg_nat", "hg_u2"),
        make_inflow_edge("hg_i2", "hg_u2", "hg_int"),
    ],
)

LESSON_HIERARCHY = {
    "title": "Hierarchy",
    "order_index": 2,
    "content_markdown": HIERARCHY_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Environmental 5-level stack",
            "description": (
                "Run the **individual → planet** environmental hierarchy. Explain what behavior is visible "
                "only when you include higher levels."
            ),
            "graph": HIERARCHY_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Biological hierarchy",
            "description": (
                "Run **cell → organ → organism → ecosystem**. Describe one feedback you would miss if you "
                "only modeled cells."
            ),
            "graph": HIERARCHY_BIO_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: Company hierarchy",
            "description": (
                "Run **employee → department → company** roll-ups. Give one example of information that should travel "
                "upward and one resource that should travel downward."
            ),
            "graph": HIERARCHY_COMPANY_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Global issue ladder",
            "description": (
                "Run **local action → international agreement** for a global issue (climate, health, trade). "
                "Where is the leverage: bottom-up, top-down, or both?"
            ),
            "graph": HIERARCHY_GLOBAL_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Boundaries
# ===========================================================================

BOUNDARIES_CONTENT = """\

**Learning objective:** You can clearly distinguish **endogenous** variables (inside the model, especially stocks and feedback loops) from **exogenous** ones (outside inputs or constants), and you understand the risks of drawing boundaries too narrowly.

One of the most important and frequently overlooked decisions in systems thinking is **where to draw the boundary** of your system. Every model is a deliberate simplification. You decide what is **inside** the system (endogenous) and what is **outside** (exogenous).

### Endogenous vs Exogenous

- **Endogenous** elements inside the model, especially **stocks** and the **feedback loops** that connect them. These are the parts whose behavior the model tries to explain.
- **Exogenous** elements treated as external inputs: constants, parameters, or driving forces coming from “outside” the system (e.g. population growth rate, market price, government policy, climate).

A constant is not “wrong”, it is a **boundary choice**. It means you are assuming that factor does not change in response to what happens inside your model.

### The Danger of Narrow Boundaries

Drawing the boundary too narrowly is one of the most common modeling mistakes. When you leave important stocks or slow variables outside:

- The model can look stable or sustainable in the short term.
- In reality, the ignored parts may create dangerous feedback later.
- You miss delayed effects, unintended consequences, or policy resistance.

**Examples:**
- A company optimizing only its own inventory while ignoring supplier capacity.
- A city managing traffic without considering how new roads affect urban sprawl.
- An economy focused on GDP growth while treating natural resources and pollution as purely exogenous.

> **Key insight:**  
> “The boundary of a system is a decision made by the observer… The choice of boundaries is one of the most powerful modeling decisions. You can make a system look good or bad, stable or unstable, simply by where you choose to draw the boundary.”

A good modeler starts with a narrow boundary and then repeatedly asks: “What important stock or loop am I leaving out that could change the behavior in the long run?”

### In the Lab

The lab makes the boundary visible, then asks you to widen or shift it.


- **Task 1: University system**  
    Separate inside stocks and flows from outside drivers in the university boundary graph.
- **Task 2: City vs metro**  
  Finish the city vs metro boundary model by adding the missing metro stock and commuter connection.
- **Task 3: Personal to society**  
  Build nested boundaries for you, family, and society, then add one stock or feedback that appears only when the boundary widens.
- **Task 4: Watershed vs county**  
  Build two boundary frames for water pollution: watershed and county line.

**Practical tip:** When reviewing any model (yours or someone else’s), always ask:
- What is inside the boundary?
- What important things are left outside?
- Could bringing one more stock inside change the conclusions dramatically?

Mastering boundaries is a core skill of professional system thinking, it determines whether your model illuminates reality or hides the most important dynamics.
"""

BOUNDARIES_DEMO = compose_graph(
    nodes=[
        make_comment_node(
            "frame_univ",
            "University: inside this boundary",
            300,
            160,
            boundary_mode=True,
            frame_width=480,
            frame_height=320,
        ),
        make_stock_node(
            "stock_univ",
            "University (enrollment)",
            420,
            220,
            quantity=18,
            unit="k students",
            student_tooltip="Endogenous stock for this story: people on campus you try to explain with flows.",
        ),
        make_constant_node(
            "c_outside",
            "National demand for degrees (outside)",
            160,
            100,
            quantity=4.2,
            unit="index",
            color=C_AUX,
            student_tooltip="Exogenous driver: a boundary choice. Drag it away from the cluster to remind yourself it is *outside* this cut of the world.",
        ),
        make_variable_node(
            "v_apps",
            "Applications (auxiliary)",
            160,
            180,
            expression="(c_outside) * (3.2)",
            unit="k/yr",
            color=C_AUX,
            student_tooltip="Auxiliary: translates outside pressure into application pressure on the campus.",
        ),
        make_flow_node(
            "f_in",
            "New enrollment",
            160,
            280,
            bottleneck=0,
            expression="max(0, (0) + (v_apps)) * 0.07",
            base_flow_expression="0",
            unit="k/yr",
            student_tooltip="Inflow: new students: green arrow into the stock.",
        ),
        make_flow_node(
            "f_out",
            "Graduation & leaving",
            680,
            220,
            bottleneck=0,
            expression="0.055 * (stock_univ) + 0.03",
            base_flow_expression="0",
            unit="k/yr",
            student_tooltip="Outflow: people finishing or transferring: red arrow from the stock.",
        ),
    ],
    edges=[
        make_feedback_edge("e1", "c_outside", "v_apps"),
        make_feedback_edge("e2", "v_apps", "f_in", op="add"),
        make_inflow_edge("e3", "f_in", "stock_univ"),
        make_outflow_edge("e4", "stock_univ", "f_out"),
    ],
)

LESSON_BOUNDARIES = {
    "title": "Boundaries",
    "order_index": 3,
    "content_markdown": BOUNDARIES_CONTENT,
    "tasks": [
        {
            "title": "Task 1: University system",
            "description": (
                "Define and visualize the **university** boundary using the dashed frame. Label which nodes are "
                "**endogenous** vs **exogenous** for this cut of the world."
            ),
            "graph": BOUNDARIES_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: City vs metro",
            "description": (
                "Draw two frames: **city limits** vs **metropolitan region**. "
                "List at least one stock that appears only when you widen to the metro boundary."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 1,
        },
        {
            "title": "Task 3: Personal to society",
            "description": (
                "Sketch nested boundaries for **you → family → society**. Identify one feedback visible only when the "
                "outer societal boundary is included."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 2,
        },
        {
            "title": "Task 4: Ecosystem boundary shift",
            "description": (
                "Compare modeling a **watershed** vs a **county line** for water pollution. "
                "How does moving the boundary change which stocks and loops belong inside the model?"
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 3,
        },
    ],
}


# =============================================================================
# Traps and opportunities: book-rooted example modules
# =============================================================================

# ===========================================================================
# Example #1: Growth, limits, and the shape of the curve
# ===========================================================================

EXAMPLES_1_CONTENT = """\

**Learning objective:** You can describe how a reinforcing growth process collides with a limiting stock or balancing loop to produce the classic S shaped (logistic) curve, and you can spot the most frequent mistakes people and organizations make in such situations.

Pure exponential growth is rare in the real world. A reinforcing loop (the “engine of growth”) almost always runs into some kind of **limit**, a second stock that is being depleted, a balancing loop that grows stronger as the system expands, or a physical carrying capacity. The result is the famous **S shaped curve**: slow start, rapid exponential rise, then a clear bending and leveling off (or even decline) as the limit is approached.

### The Basic Pattern

1. **Reinforcing phase**, the growth engine works beautifully. More leads to more.
2. **Approaching the limit**, the second stock (market size, clean water, public trust, fertile soil, etc.) starts to thin.
3. **Slowing and plateau**, growth rate drops even though effort stays high. The curve bends.
4. **Possible outcomes**, stable equilibrium near carrying capacity, or overshoot and collapse if delays or over investment are present.

This is called “**limits to growth**”, not a limit to effort or ambition, but a structural limit in the system.

### Most Common Mistakes (and How to Avoid Them)

Roughly half of all policy and modeling failures around growth happen because people misunderstand this pattern. Here are the four most frequent mistakes:

1. **Mistake: “The limit is someone else’s problem” (narrow boundary)**  
   People treat the limiting stock as exogenous (a constant or external driver) instead of making it endogenous.  
   **Solution:** Always ask “What second stock is being consumed or degraded by our growth?” Bring it inside the model as a stock with its own dynamics.

2. **Mistake: “We just need to push harder” (fighting the symptom)**  
   When growth slows, the instinctive response is to strengthen the reinforcing loop (more advertising, more extraction, more subsidies). This accelerates depletion of the limit and often causes overshoot.  
   **Solution:** When the S curve appears, shift attention from the growth engine to the limiting factor. Strengthen the balancing loop or replenish the second stock.

3. **Mistake: Ignoring delays**  
   Because effects are delayed, the slowdown feels sudden. Decision makers panic and over correct.  
   **Solution:** Explicitly add delays in the model and practice responding more slowly and thoughtfully when the curve starts bending.

4. **Mistake: Believing the steep middle part of the curve will last forever**  
   Headlines and short term success stories focus only on the explosive middle section and declare “this growth is unstoppable.”  
   **Solution:** Always look for the approaching limit early. The earlier you detect the second stock, the easier it is to manage.

> **Key insight:**  
> “A reinforcing growth loop will produce exponential growth for a while, but it cannot continue forever. Sooner or later it will run into a balancing loop or a physical limit. The resulting behavior is the classic S shaped curve.”

### In the Lab

The lab uses the same S curve structure in business, population, technology, and pollution examples.


- **Task 1: Business vs market limit**  
    Identify the growth engine, the market ceiling, and the slow fast slow S curve phases in the business growth graph.
- **Task 2: Population and resources**  
  Finish the population resource model by completing the headroom limited growth path.
- **Task 3: Technology adoption**  
  Build a technology adoption S curve with adopters as a stock, new adoption as inflow, and saturation as the limiting headroom.
- **Task 4: Pollution budget**  
  Build a pollution accumulation model where remaining assimilative capacity or budget limits further growth.

Remember: finding the second stock *before* you max out the first one is the systems thinker’s most powerful move in any sustainability conversation.
"""

LIMITS_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_pop",
            "Population",
            420,
            260,
            quantity=8,
            unit="k",
            student_tooltip="Primary stock: watch the chart for slow fast slow S-shape as the limit bites.",
        ),
        make_constant_node(
            "constant_cap",
            "Carrying capacity (niches & resources)",
            420,
            90,
            quantity=95,
            unit="k",
            color=C_AUX,
            student_tooltip="Purple ceiling: food, space, institutions. The reinforcing loop runs into this bound.",
        ),
        make_flow_node(
            "flow_net",
            "Net inflow (births − deaths)",
            140,
            260,
            bottleneck=0,
            expression="max(0, (0) + (var_g))",
            base_flow_expression="0",
            unit="k/step",
            student_tooltip="Green inflow: driven by the orange logistic term: steep early, flat late.",
        ),
        make_variable_node(
            "var_g",
            "Logistic growth (reinforcing × headroom)",
            280,
            175,
            expression="(0.055) * (stock_pop) * max(0, (constant_cap) - (stock_pop))",
            loop_id="loop_s",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
            student_tooltip="Orange (R): growth × remaining room below carrying capacity: textbook limits-to-growth structure.",
        ),
    ],
    edges=[
        make_inflow_edge("e1", "flow_net", "stock_pop"),
        make_feedback_edge("e2", "stock_pop", "var_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("e3", "constant_cap", "var_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("e4", "var_g", "flow_net", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop(
            "loop_s",
            "stock_pop",
            "var_g",
            "flow_net",
            ["e2", "e3", "e4"],
            k=0.055,
            polarity="positive",
            growth_limit_id="constant_cap",
        )
    ],
)

LIMITS_BUSINESS_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "lb_r",
            "Quarterly revenue",
            420,
            260,
            quantity=6,
            unit="M$",
            student_tooltip="Stock: revenue: grows quickly mid-curve then bends toward the market ceiling.",
        ),
        make_constant_node(
            "lb_cap",
            "Addressable market ceiling",
            420,
            90,
            quantity=110,
            unit="M$",
            color=C_AUX,
            student_tooltip="Purple limit: total spending you can realistically capture.",
        ),
        make_flow_node(
            "lb_f",
            "Net revenue growth",
            140,
            260,
            bottleneck=0,
            expression="max(0, (0) + (lb_g))",
            base_flow_expression="0",
            unit="M$/q",
            student_tooltip="Inflow: growth term slows automatically as you approach the ceiling.",
        ),
        make_variable_node(
            "lb_g",
            "Headroom-limited growth",
            280,
            175,
            expression="(0.07) * (lb_r) * max(0, (lb_cap) - (lb_r))",
            loop_id="lb_l",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
        ),
    ],
    edges=[
        make_inflow_edge("lb_e1", "lb_f", "lb_r"),
        make_feedback_edge("lb_e2", "lb_r", "lb_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lb_e3", "lb_cap", "lb_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lb_e4", "lb_g", "lb_f", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop("lb_l", "lb_r", "lb_g", "lb_f", ["lb_e2", "lb_e3", "lb_e4"], k=0.07, polarity="positive", growth_limit_id="lb_cap")
    ],
)

LIMITS_TECH_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "lt_u",
            "Adopters (installed base)",
            420,
            260,
            quantity=4,
            unit="% HH",
            student_tooltip="Stock: households using the tech: classic adoption S curve.",
        ),
        make_constant_node(
            "lt_cap",
            "Saturation (100% feasible)",
            420,
            90,
            quantity=100,
            unit="%",
            color=C_AUX,
        ),
        make_flow_node(
            "lt_f",
            "New adoption / period",
            140,
            260,
            bottleneck=0,
            expression="max(0, (0) + (lt_g))",
            base_flow_expression="0",
            unit="%/step",
        ),
        make_variable_node(
            "lt_g",
            "Diffusion × headroom",
            280,
            175,
            expression="(0.055) * (lt_u) * max(0, (lt_cap) - (lt_u))",
            loop_id="lt_l",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
        ),
    ],
    edges=[
        make_inflow_edge("lt_e1", "lt_f", "lt_u"),
        make_feedback_edge("lt_e2", "lt_u", "lt_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lt_e3", "lt_cap", "lt_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lt_e4", "lt_g", "lt_f", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop("lt_l", "lt_u", "lt_g", "lt_f", ["lt_e2", "lt_e3", "lt_e4"], k=0.055, polarity="positive", growth_limit_id="lt_cap")
    ],
)

LIMITS_POLLUTION_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "lp_p",
            "Cumulative emissions (atm.)",
            420,
            260,
            quantity=180,
            unit="Gt",
            student_tooltip="Stock: pollution accumulated: growth slows as remaining carbon budget shrinks.",
        ),
        make_constant_node(
            "lp_cap",
            "Remaining budget (1.5 °C path)",
            420,
            90,
            quantity=600,
            unit="Gt",
            color=C_AUX,
            student_tooltip="Purple ceiling: stylized total budget: S curve emerges as headroom closes.",
        ),
        make_flow_node(
            "lp_f",
            "Annual emissions",
            140,
            260,
            bottleneck=0,
            expression="max(0, (0) + (lp_g))",
            base_flow_expression="0",
            unit="Gt/yr",
        ),
        make_variable_node(
            "lp_g",
            "Emissions × headroom",
            280,
            175,
            expression="(0.045) * (lp_p) * max(0, (lp_cap) - (lp_p))",
            loop_id="lp_l",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
        ),
    ],
    edges=[
        make_inflow_edge("lp_e1", "lp_f", "lp_p"),
        make_feedback_edge("lp_e2", "lp_p", "lp_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lp_e3", "lp_cap", "lp_g", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("lp_e4", "lp_g", "lp_f", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop("lp_l", "lp_p", "lp_g", "lp_f", ["lp_e2", "lp_e3", "lp_e4"], k=0.045, polarity="positive", growth_limit_id="lp_cap")
    ],
)

LESSON_EXAMPLES_1 = {
    "title": "Limits to Growth and the S-Curve",
    "order_index": 0,
    "content_markdown": EXAMPLES_1_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Business vs market limit",
            "description": (
                "Run the **business revenue** model 70+ steps. Label the **slow fast slow** phases and identify the "
                "purple **market ceiling**."
            ),
            "graph": LIMITS_BUSINESS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Population / resources",
            "description": (
                "Run the **population / carrying capacity** logistic. Move the capacity constant and describe how the "
                "plateau shifts."
            ),
            "graph": LIMITS_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: Technology adoption",
            "description": (
                "Simulate **technology adoption** to saturation. Where on the chart is the **acceleration** phase?"
            ),
            "graph": LIMITS_TECH_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Pollution accumulation",
            "description": (
                "Run the **pollution vs budget** model. Explain how an S-shape can appear even for something harmful "
                "when remaining **headroom** shrinks."
            ),
            "graph": LIMITS_POLLUTION_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Example #2: Commons
# ===========================================================================

EXAMPLES_2_CONTENT = """\

**Learning objective:** You can recognize the **tragedy of the commons** archetype, explain why rational individual choices can damage a shared resource, and identify structural rules that restore feedback from the resource to its users.

System traps are structures that produce undesirable behavior even when everyone is acting rationally. The tragedy of the commons is one of the clearest examples: the structure rewards private use while spreading the cost across everyone.

When many independent actors can withdraw from a single shared stock (fishery, pasture, groundwater, atmosphere, public roads), each person’s rational move is to take a little more. The result is collective overuse and eventual collapse of the resource.

The reinforcing loop is: “I take more, my benefit increases.”  
The missing balancing loop is a strong enough limit or rule on total withdrawals.

### The Basic Pattern

1. **Shared resource stock**, such as grass, fish, clean air, road capacity, or groundwater.
2. **Multiple users**, each gaining a private benefit from more use.
3. **Weak feedback**, each user feels only a fraction of the resource damage.
4. **Overuse**, total withdrawal or pollution exceeds the resource's recovery capacity.
5. **Resource erosion**, the damaged stock regenerates more slowly or stops serving everyone.

### Most Common Mistakes (and How to Fix Them)

1. **Mistake: Blaming individual greed**
   People focus only on selfishness instead of seeing that the rules reward overuse.
   **Solution:** Redesign incentives so the rational individual choice also protects the shared stock.

2. **Mistake: Treating the shared resource as infinite or exogenous**
   The resource is left outside the model as a constant, so depletion is invisible until it is too late.
   **Solution:** Make the shared stock **endogenous** with its own regeneration and depletion dynamics.

3. **Mistake: Relying only on moral appeals**
   Asking people to “use less” rarely works when the structure rewards taking more.
   **Solution:** Add quotas, pricing, permits, access rules, shared monitoring, or property responsibility.

4. **Mistake: Ignoring sinks**
   Commons are not only sources like fish or grass; clean air and water can also be overused as pollution sinks.
   **Solution:** Model the sink as a stock with inflows, outflows, and recovery limits.

> **Key insight:**  
> “The tragedy of the commons arises when there is a shared resource with no rules or enforcement limiting access. The system structure, not simply the character of the users, produces the problem.”

### In the Lab

- **Task 1: Overgrazing pasture**  
    Trace shared grass, herd growth incentives, grazing pressure, and ecological regrowth in the pasture commons graph.
- **Task 2: Ocean overfishing**  
  Finish the fishery commons model by completing the missing private incentive path.
- **Task 3: City air pollution**  
  Build an urban air commons model with clean air as shared stock and private emissions as drains.
- **Task 4: Public road traffic**  
  Build a road capacity commons model where individual route choices create collective congestion.

**Practical takeaway:**
Once you see a commons trap, stop asking only “Who is using too much?” and start asking “What feedback is missing from the shared stock to the users?”
"""


# ===========================================================================
# Example #3: Escalation
# ===========================================================================

ESCALATION_CONTENT = """\

**Learning objective:** You can recognize the **escalation** archetype, trace the cross-reinforcing loops between two actors, and identify interventions that break the race.

Escalation happens when two or more actors react to each other. One side increases its action, so the other side also increases its action. This creates a cycle where both sides continue to grow their response.

The pattern can appear in arms races, price wars, social media outrage, advertising competition, political rhetoric, or any setting where each actor's goal is relative to the other actor's current level.

### The Basic Pattern

1. **Actor A stock**, such as A's military power, discount depth, outrage, or advertising spend.
2. **Actor B stock**, the matching level for the other side.
3. **A response loop**, A increases because B increased.
4. **B response loop**, B increases because A increased.
5. **Runaway race**, both sides climb even if both would prefer a lower-cost outcome.

Neither side necessarily wants the race. The structure keeps driving both upward because “not falling behind” becomes the decision rule.

### Most Common Mistakes (and How to Fix Them)

1. **Mistake: Trying to win the escalation**
   Each side responds symmetrically: they raised, so we raise.
   **Solution:** Break the reinforcing loop instead of feeding it.

2. **Mistake: Treating the other side as the only cause**
   Each actor sees its own action as defensive and the other's action as aggressive.
   **Solution:** Map both loops so each side can see how its own response becomes the other's trigger.

3. **Mistake: Ignoring reaction speed**
   Fast reactions can amplify the race before anyone has time to check whether the threat is real.
   **Solution:** Add delay, verification, negotiation, or cooling-off rules.

4. **Mistake: Removing only one symptom**
   If the cross-response rule remains, the race restarts in a new form.
   **Solution:** Add balancing loops: treaties, price floors, platform moderation rules, shared standards, or third-party mediation.

> **Key insight:**
> Escalation is a pair of reinforcing loops in which each actor's action is a response to the other actor. The leverage is to change the response rule, not to push harder inside the race.

### In the Lab

- **Task 1: Arms race**  
    Trace the two cross reinforcing buildup paths in the arms race model.
- **Task 2: Price war**  
  Finish the price war model by completing the missing cross response path.
- **Task 3: Social media outrage**  
  Build a two community outrage model with mutual reaction signals and one intervention that weakens escalation.
- **Task 4: Advertising competition**  
  Build an advertising arms race model with rival attention or ad spend stocks and cross response flows.

**Practical takeaway:**  
Once you see escalation, stop asking only “Who started it?” and ask “Which response rule keeps the loop running?”
"""
TRAGEDY_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_p",
            "Shared Pasture (grass)",
            460,
            280,
            quantity=480,
            unit="index",
            student_tooltip="Common grass stock: everyone’s cattle eat here: watch the fill shrink when herds explode.",
            visual_theme="grass",
            fill_cap=600,
        ),
        make_stock_node(
            "stock_h",
            "Total cattle (all farmers)",
            460,
            120,
            quantity=38,
            unit="scaled herds",
            student_tooltip="All herds combined. Three orange farmer loops each push expansion: together they can overwhelm the commons.",
        ),
        make_constant_node(
            "constant_K",
            "Carrying capacity (grass)",
            720,
            360,
            quantity=520,
            unit="index",
            color=C_AUX,
            loop_id="loop_p",
            loop_role="goal",
            fb_type="balancing",
            student_tooltip="Ecological ceiling: teal balancing loop tries to regrow grass toward this when it is low.",
        ),
        make_variable_node(
            "var_pd",
            "Grass deficit",
            720,
            260,
            expression="(stock_p < constant_K ? (constant_K - stock_p) : 0)",
            loop_id="loop_p",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Gap between actual grass and healthy carrying capacity.",
        ),
        make_variable_node(
            "var_pc",
            "Regrowth processes",
            600,
            200,
            expression="(max(0, (var_pd))) / (7)",
            loop_id="loop_p",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Rain, rest, recovery: balancing pressure that fights overgrazing.",
        ),
        make_flow_node(
            "flow_reg",
            "Grass regrowth (ecology)",
            600,
            340,
            bottleneck=0,
            expression="max(0, (0) + (var_pc))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Teal balancing inflow: ecosystem pushes grass back when depleted.",
        ),
        make_flow_node(
            "flow_graze",
            "Total grazing pressure",
            240,
            280,
            bottleneck=0,
            expression="(0.048) * (stock_h) * ((stock_p) / (480) + 0.02)",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Red outflow: many animals × available grass: the commons drain.",
        ),
        make_variable_node(
            "var_f1",
            "Farmer 1: expand herd (R)",
            120,
            100,
            expression="(0.037) * (stock_h)",
            loop_id="loop_h1",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
            student_tooltip="Farmer 1’s private loop: more cattle → more income → add cattle.",
        ),
        make_variable_node(
            "var_f2",
            "Farmer 2: expand herd (R)",
            360,
            100,
            expression="(0.037) * (stock_h)",
            loop_id="loop_h2",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
            student_tooltip="Farmer 2: same rational incentive, same shared pasture.",
        ),
        make_variable_node(
            "var_f3",
            "Farmer 3: expand herd (R)",
            600,
            100,
            expression="(0.036) * (stock_h)",
            loop_id="loop_h3",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
            color=C_REINFORCING,
            student_tooltip="Farmer 3: together the three loops sum to strong herd growth.",
        ),
        make_flow_node(
            "flow_herd",
            "Herd expansion (all farmers)",
            360,
            120,
            bottleneck=0,
            expression="max(0, max(0, max(0, (0) + (var_f1)) + (var_f2)) + (var_f3))",
            base_flow_expression="0",
            unit="units/step",
            student_tooltip="Total new cattle per step from all three reinforcing farmer loops.",
        ),
    ],
    edges=[
        make_inflow_edge("e_pr", "flow_reg", "stock_p"),
        make_outflow_edge("e_pg", "stock_p", "flow_graze"),
        make_inflow_edge("e_hin", "flow_herd", "stock_h"),
        make_feedback_edge("ek2", "constant_K", "var_pd", fb_type="balancing"),
        make_feedback_edge("ek3", "stock_p", "var_pd", fb_type="balancing"),
        make_feedback_edge("ek4", "var_pd", "var_pc", fb_type="balancing"),
        make_feedback_edge("ek5", "var_pc", "flow_reg", op="add", fb_type="balancing"),
        make_feedback_edge("h1a", "stock_h", "var_f1", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("h1b", "var_f1", "flow_herd", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("h2a", "stock_h", "var_f2", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("h2b", "var_f2", "flow_herd", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("h3a", "stock_h", "var_f3", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("h3b", "var_f3", "flow_herd", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_balancing_loop(
            "loop_p",
            "stock_p",
            "constant_K",
            "var_pd",
            "var_pc",
            "flow_reg",
            ["ek2", "ek3", "ek4", "ek5"],
            boundary_type="lower",
            goal_value=520,
            adjustment_time=7,
        ),
        make_reinforcing_loop(
            "loop_h1", "stock_h", "var_f1", "flow_herd", ["h1a", "h1b"], k=0.037, polarity="positive"
        ),
        make_reinforcing_loop(
            "loop_h2", "stock_h", "var_f2", "flow_herd", ["h2a", "h2b"], k=0.037, polarity="positive"
        ),
        make_reinforcing_loop(
            "loop_h3", "stock_h", "var_f3", "flow_herd", ["h3a", "h3b"], k=0.036, polarity="positive"
        ),
    ],
)

ESCALATION_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "stock_a",
            "Country A Military Power",
            160,
            220,
            quantity=100,
            unit="index",
            student_tooltip="Side A capability: rises when leaders perceive threat from B.",
        ),
        make_stock_node(
            "stock_b",
            "Country B Military Power",
            640,
            220,
            quantity=88,
            unit="index",
            student_tooltip="Side B capability: mirrors A: classic escalation structure.",
        ),
        make_variable_node(
            "var_a",
            "A’s buildup pressure ∝ B’s power",
            100,
            300,
            expression="(0.15) * (stock_b)",
            color=C_REINFORCING,
            student_tooltip="Orange link from B: the stronger B looks, the faster A tries to catch up.",
        ),
        make_variable_node(
            "var_b",
            "B’s buildup pressure ∝ A’s power",
            700,
            300,
            expression="(0.15) * (stock_a)",
            color=C_REINFORCING,
            student_tooltip="Orange link from A: symmetric fear: mutual reinforcement without anyone ‘wanting’ war.",
        ),
        make_flow_node(
            "flow_a",
            "Country A buildup",
            100,
            380,
            bottleneck=0,
            expression="max(0, (0) + (var_a))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow to A from perceived gap vs rival: inspect the chart for runaway growth.",
        ),
        make_flow_node(
            "flow_b",
            "Country B buildup",
            700,
            380,
            bottleneck=0,
            expression="max(0, (0) + (var_b))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Inflow to B: try setting one side’s multiplier to zero to test de-escalation.",
        ),
    ],
    edges=[
        make_feedback_edge("ea1", "stock_b", "var_a", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("ea2", "var_a", "flow_a", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("eb1", "stock_a", "var_b", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("eb2", "var_b", "flow_b", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
        make_inflow_edge("edge_1", "flow_a", "stock_a"),
        make_inflow_edge("edge_2", "flow_b", "stock_b"),
    ],
)

TRAGEDY_FISHERY_ALMOST = make_almost_done_graph(
    TRAGEDY_DEMO,
    note=(
        "This is the ocean-fishery version of the commons pattern. "
        "Finish the missing private incentive formula/links so fleet growth can drain the shared fish stock."
    ),
)
for _node in TRAGEDY_FISHERY_ALMOST["nodes"]:
    _label = str(_node.get("label", ""))
    _tooltip = str(_node.get("student_tooltip", ""))
    replacements = {
        "Shared Pasture (grass)": "Ocean fish biomass",
        "Total cattle (all farmers)": "Total fishing fleet effort",
        "Carrying capacity (grass)": "Safe fish biomass",
        "Grass deficit": "Fish recovery gap",
        "Regrowth processes": "Fish reproduction",
        "Grass regrowth (ecology)": "Fish stock regeneration",
        "Total grazing pressure": "Total catch pressure",
        "Farmer 1: expand herd (R)": "Fleet 1: add boats (R)",
        "Farmer 2: expand herd (R)": "Fleet 2: add boats (R)",
        "Farmer 3: expand herd (R)": "Fleet 3: add boats (R)",
        "Herd expansion (all farmers)": "Fleet expansion",
    }
    for old, new in replacements.items():
        _label = _label.replace(old, new)
        _tooltip = _tooltip.replace(old, new).replace("grass", "fish").replace("cattle", "boats").replace("pasture", "fishery")
    _node["label"] = _label
    _node["student_tooltip"] = _tooltip

ESCALATION_PRICE_WAR_ALMOST = make_almost_done_graph(
    ESCALATION_DEMO,
    note=(
        "Almost done: this is the price war version of escalation. "
        "Finish the missing cross response formula/links so each firm reacts to the other firm's discount pressure."
    ),
)
for _node in ESCALATION_PRICE_WAR_ALMOST["nodes"]:
    _label = str(_node.get("label", ""))
    _tooltip = str(_node.get("student_tooltip", ""))
    replacements = {
        "Country A Military Power": "Company A discount pressure",
        "Country B Military Power": "Company B discount pressure",
        "A’s buildup pressure ∝ B’s power": "A reacts to B's discounts",
        "B’s buildup pressure ∝ A’s power": "B reacts to A's discounts",
        "Country A buildup": "Company A price cuts",
        "Country B buildup": "Company B price cuts",
    }
    for old, new in replacements.items():
        _label = _label.replace(old, new)
    _tooltip = (
        _tooltip.replace("Side A capability", "Company A discount pressure")
        .replace("Side B capability", "Company B discount pressure")
        .replace("Country A", "Company A")
        .replace("Country B", "Company B")
        .replace("B looks", "B discounts")
        .replace("A tries to catch up", "A cuts prices")
        .replace("rival", "competitor")
        .replace("de-escalation", "ending the price war")
    )
    _node["label"] = _label
    _node["student_tooltip"] = _tooltip

LESSON_EXAMPLES_2 = {
    "title": "Tragedy of the Commons",
    "order_index": 1,
    "content_markdown": EXAMPLES_2_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Overgrazing pasture",
            "description": (
                "Simulate the **shared pasture** commons. Identify the **deep blue grass stock**, **teal regrowth** loop, "
                "and **orange farmer** loops. Explain overgrazing as a structural outcome."
            ),
            "graph": TRAGEDY_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Overfishing the ocean",
            "description": (
                "Re-interpret the same diagram as **fish biomass** vs **fishing fleets**. "
                "Write 2 to 3 sentences on how parallel private incentives deplete a mobile commons."
            ),
            "graph": TRAGEDY_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: City air pollution",
            "description": (
                "Map the commons structure to **urban air quality**: name the shared stock, the private **emissions** pressures, "
                "and one **balancing** process (e.g., wind dispersion, regulation) you could model next."
            ),
            "graph": TRAGEDY_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Public road traffic jam",
            "description": (
                "Explain **road capacity** as a commons and **route choice** as reinforcing private use. "
                "Produce one policy lever (pricing, transit, coordination) that changes the structure."
            ),
            "graph": TRAGEDY_DEMO,
            "order_index": 3,
        },
    ],
}

LESSON_EXAMPLES_3 = {
    "title": "Escalation",
    "order_index": 2,
    "content_markdown": ESCALATION_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Arms race",
            "description": (
                "Run the **two-country escalation** model ~50 to 70 steps. Identify the **orange cross-links** and predict "
                "long-run behavior if neither side changes the rules."
            ),
            "graph": ESCALATION_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Price war",
            "description": (
                "Relabel the escalation stocks mentally as **Company A vs B price aggression** (or discount depth). "
                "How would a **third-party platform** or **collusion guardrail** weaken the loop?"
            ),
            "graph": ESCALATION_DEMO,
            "order_index": 1,
        },
        {
            "title": "Task 3: Social media outrage",
            "description": (
                "Map the model to **outrage intensity** on two communities feeding each other. "
                "Name one intervention that removes the **threat signal** or slows reaction delay."
            ),
            "graph": ESCALATION_DEMO,
            "order_index": 2,
        },
        {
            "title": "Task 4: Advertising competition",
            "description": (
                "Interpret the stocks as **rival ad spend** or **attention capture**. "
                "Explain why both sides can rationally climb together even when total profit falls."
            ),
            "graph": ESCALATION_DEMO,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Example #4: Shifting the Burden
# ===========================================================================

SHIFTING_BURDEN_CONTENT = """\

**Learning objective:** You can recognize the **Shifting the Burden** archetype, separate a symptom-relieving fix from a deeper capability-building solution, and explain why the quick fix can create dependence.

This archetype appears when a system has a real problem, but the most visible response only reduces the symptom. The deeper cause remains, so the problem returns. Because the quick fix appears to work, people invest less attention in the slower fundamental solution. If the quick fix also weakens the system's own capacity, the system becomes dependent on the intervention.

### The Basic Pattern

1. **Problem symptom**, something visible is uncomfortable or urgent.
2. **Symptomatic solution**, a fast response reduces the pain now.
3. **Fundamental solution**, a slower response would strengthen the system's own ability to handle the problem.
4. **Side effect**, repeated use of the quick fix weakens the fundamental capacity.
5. **Dependence**, the weaker the internal capacity becomes, the more the system needs the quick fix.

The important modeling move is to draw both paths. If the model contains only the quick fix, the graph can look successful for a few steps even while it is making the long-term structure worse.

### Examples

Meadows describes this trap as addiction, dependence, or shifting the burden to an intervenor: fertilizers can hide declining soil fertility, subsidies can hide an ineffective business model, and medicine can hide lifestyle causes of ill health. The same pattern appears in school work. Cramming before every exam can reduce immediate pressure, but it does not build a durable learning routine. Over time the student needs more cramming because the deeper study habit has not improved.

### How to Escape

The leverage point is not to remove every quick fix immediately. Sometimes a symptom needs relief. The key is to pair short-term relief with a real investment in the fundamental solution, then gradually reduce dependence on the symptomatic response.

Ask:
- What capacity should the system build for itself?
- Does the quick fix weaken that capacity?
- Which delayed investment would make the quick fix less necessary next time?

### In the Lab

- **Task 1: Cramming vs study habit**
    Trace learning pressure, cramming relief, steady learning, habit building, and dependency drain in the student model.
- **Task 2: Sleep aid dependence**
  Finish the sleep model by adding the missing sleep-aid response formula and reconnecting the quick-fix path.
- **Task 3: Farm fertilizer dependence**
  Build a farm model where fertilizer increases short-term yield but long-term soil health must be rebuilt.
- **Task 4: Help desk dependency**
  Build a team model where an expert helper solves tickets quickly but slows the team's own troubleshooting capacity.
"""

SHIFTING_BURDEN_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "sb_pressure",
            "Learning pressure",
            420,
            280,
            quantity=68,
            unit="index",
            student_tooltip="Problem symptom: pressure rises when new material arrives faster than real learning absorbs it.",
        ),
        make_stock_node(
            "sb_habit",
            "Study habit capacity",
            650,
            280,
            quantity=26,
            unit="index",
            student_tooltip="Fundamental capacity: durable study habits reduce pressure without creating dependence.",
        ),
        make_flow_node(
            "sb_new",
            "New material and deadlines",
            140,
            280,
            bottleneck=8,
            unit="index/step",
            student_tooltip="Inflow: new work adds pressure.",
        ),
        make_flow_node(
            "sb_quick_flow",
            "Cramming relief",
            720,
            410,
            bottleneck=0,
            expression="max(0, (0) + (sb_quick))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Symptomatic solution: cramming reduces pressure quickly but does not build capacity.",
        ),
        make_flow_node(
            "sb_study_relief",
            "Steady learning relief",
            140,
            410,
            bottleneck=0,
            expression="max(0, (0) + (sb_relief))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Fundamental relief: a stronger habit lowers pressure every step.",
        ),
        make_flow_node(
            "sb_habit_build",
            "Practice builds habit",
            430,
            420,
            bottleneck=0,
            expression="max(0, (0) + (sb_fundamental))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Slow fundamental investment: deliberate practice builds the capacity stock.",
        ),
        make_flow_node(
            "sb_habit_drain",
            "Cramming dependency drain",
            880,
            280,
            bottleneck=0,
            expression="max(0, (0) + (sb_dependency))",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Side effect: relying on cramming weakens the normal study routine.",
        ),
        make_constant_node(
            "sb_goal",
            "Comfortable pressure",
            420,
            80,
            quantity=18,
            loop_id="sb_l_quick",
            loop_role="goal",
            fb_type="balancing",
            unit="index",
            color=C_AUX,
            student_tooltip="Goal: pressure level that still feels manageable.",
        ),
        make_variable_node(
            "sb_gap",
            "Pressure gap",
            420,
            175,
            expression="(sb_pressure > sb_goal ? (sb_pressure - sb_goal) : 0)",
            loop_id="sb_l_quick",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Symptom size: how far pressure sits above the comfort goal.",
        ),
        make_variable_node(
            "sb_quick",
            "Quick fix: cram harder",
            720,
            180,
            expression="(max(0, (sb_gap))) / (3)",
            loop_id="sb_l_quick",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Fast balancing response: large pressure creates a large cramming response.",
        ),
        make_variable_node(
            "sb_fundamental",
            "Slow fix: build routine",
            430,
            520,
            expression='(max(0, (delay("sb_gap", 4)))) / (8)',
            unit="index/step",
            color=C_AUX,
            student_tooltip="Fundamental solution: delayed and slower, but it strengthens the system.",
        ),
        make_variable_node(
            "sb_relief",
            "Habit-based relief",
            140,
            520,
            expression="(0.14) * (sb_habit)",
            unit="index/step",
            color=C_AUX,
            student_tooltip="Capacity translated into steady pressure relief.",
        ),
        make_variable_node(
            "sb_dependency",
            "Side effect: habit erosion",
            880,
            180,
            expression="(0.05) * (sb_quick)",
            unit="index/step",
            color=C_AUX,
            student_tooltip="Dependency path: the more cramming is used, the more the study habit erodes.",
        ),
    ],
    edges=[
        make_inflow_edge("sb_e1", "sb_new", "sb_pressure"),
        make_outflow_edge("sb_e2", "sb_pressure", "sb_quick_flow"),
        make_outflow_edge("sb_e3", "sb_pressure", "sb_study_relief"),
        make_inflow_edge("sb_e4", "sb_habit_build", "sb_habit"),
        make_outflow_edge("sb_e5", "sb_habit", "sb_habit_drain"),
        make_feedback_edge("sb_e6", "sb_goal", "sb_gap", fb_type="balancing"),
        make_feedback_edge("sb_e7", "sb_pressure", "sb_gap", fb_type="balancing"),
        make_feedback_edge("sb_e8", "sb_gap", "sb_quick", fb_type="balancing"),
        make_feedback_edge("sb_e9", "sb_quick", "sb_quick_flow", op="add", fb_type="balancing"),
        make_feedback_edge("sb_e10", "sb_gap", "sb_fundamental"),
        make_feedback_edge("sb_e11", "sb_fundamental", "sb_habit_build", op="add"),
        make_feedback_edge("sb_e12", "sb_habit", "sb_relief"),
        make_feedback_edge("sb_e13", "sb_relief", "sb_study_relief", op="add"),
        make_feedback_edge("sb_e14", "sb_quick", "sb_dependency"),
        make_feedback_edge("sb_e15", "sb_dependency", "sb_habit_drain", op="add"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "sb_l_quick",
            "sb_pressure",
            "sb_goal",
            "sb_gap",
            "sb_quick",
            "sb_quick_flow",
            ["sb_e6", "sb_e7", "sb_e8", "sb_e9"],
            boundary_type="upper",
            goal_value=18,
            adjustment_time=3,
        )
    ],
)

SHIFTING_BURDEN_SLEEP_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "sbs_todo",
            "Sleep debt, natural sleep capacity, routine practice, and the side-effect drain are placed. Add the sleep-aid response formula and reconnect the quick-fix path before running.",
            20,
            20,
        ),
        make_stock_node("sbs_debt", "Sleep debt", 420, 280, quantity=62, unit="index"),
        make_stock_node("sbs_capacity", "Natural sleep capacity", 650, 280, quantity=32, unit="index"),
        make_flow_node("sbs_stress", "Stress and late work", 140, 280, bottleneck=7, unit="index/step"),
        make_flow_node(
            "sbs_aid_flow",
            "Sleep aid relief",
            720,
            410,
            bottleneck=0,
            expression="",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Finish this flow so the sleep-aid response reduces sleep debt.",
        ),
        make_flow_node(
            "sbs_routine_flow",
            "Routine sleep relief",
            140,
            410,
            bottleneck=0,
            expression="max(0, (0) + (sbs_relief))",
            base_flow_expression="0",
            unit="index/step",
        ),
        make_flow_node(
            "sbs_build",
            "Sleep hygiene practice",
            430,
            420,
            bottleneck=0,
            expression="max(0, (0) + (sbs_routine))",
            base_flow_expression="0",
            unit="index/step",
        ),
        make_flow_node(
            "sbs_drain",
            "Tolerance / habit drain",
            880,
            280,
            bottleneck=0,
            expression="max(0, (0) + (sbs_side))",
            base_flow_expression="0",
            unit="index/step",
        ),
        make_constant_node("sbs_goal", "Rested target", 420, 80, quantity=15, unit="index"),
        make_variable_node(
            "sbs_gap",
            "Sleep-debt gap",
            420,
            175,
            expression="(sbs_debt > sbs_goal ? (sbs_debt - sbs_goal) : 0)",
            color=C_AUX,
        ),
        make_variable_node(
            "sbs_aid",
            "Sleep-aid response (finish)",
            720,
            180,
            expression="",
            color=C_AUX,
            student_tooltip="Add a formula such as max(0, gap) divided by an adjustment time.",
        ),
        make_variable_node(
            "sbs_routine",
            "Routine-building response",
            430,
            520,
            expression='(max(0, (delay("sbs_gap", 4)))) / (8)',
            color=C_AUX,
        ),
        make_variable_node("sbs_relief", "Capacity-based relief", 140, 520, expression="(0.14) * (sbs_capacity)", color=C_AUX),
        make_variable_node("sbs_side", "Side effect on natural sleep", 880, 180, expression="(0.04) * (sbs_aid)", color=C_AUX),
    ],
    edges=[
        make_inflow_edge("sbs_e1", "sbs_stress", "sbs_debt"),
        make_outflow_edge("sbs_e2", "sbs_debt", "sbs_aid_flow"),
        make_outflow_edge("sbs_e3", "sbs_debt", "sbs_routine_flow"),
        make_inflow_edge("sbs_e4", "sbs_build", "sbs_capacity"),
        make_outflow_edge("sbs_e5", "sbs_capacity", "sbs_drain"),
        make_feedback_edge("sbs_e6", "sbs_goal", "sbs_gap"),
        make_feedback_edge("sbs_e7", "sbs_debt", "sbs_gap"),
        make_feedback_edge("sbs_e10", "sbs_gap", "sbs_routine"),
        make_feedback_edge("sbs_e11", "sbs_routine", "sbs_build", op="add"),
        make_feedback_edge("sbs_e12", "sbs_capacity", "sbs_relief"),
        make_feedback_edge("sbs_e13", "sbs_relief", "sbs_routine_flow", op="add"),
        make_feedback_edge("sbs_e14", "sbs_aid", "sbs_side"),
        make_feedback_edge("sbs_e15", "sbs_side", "sbs_drain", op="add"),
    ],
)

LESSON_SHIFTING_BURDEN = {
    "title": "Shifting the Burden",
    "order_index": 3,
    "content_markdown": SHIFTING_BURDEN_CONTENT,
    "tasks": [
        {
            "title": "Task 1: Cramming vs study habit",
            "description": (
                "Run the student model. Trace the quick cramming relief path, the slower study-habit path, "
                "and the side effect that makes the quick fix more attractive next time."
            ),
            "graph": SHIFTING_BURDEN_DEMO,
            "order_index": 0,
        },
        {
            "title": "Task 2: Sleep aid dependence",
            "description": (
                "Finish the sleep model. Sleep debt, natural sleep capacity, and routine practice are placed; "
                "add the missing sleep-aid response formula and reconnect the quick-fix path."
            ),
            "graph": SHIFTING_BURDEN_SLEEP_ALMOST,
            "order_index": 1,
        },
        {
            "title": "Task 3: Farm fertilizer dependence",
            "description": (
                "Build a farm model where fertilizer gives a quick yield boost while soil health needs slower rebuilding."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 2,
        },
        {
            "title": "Task 4: Help desk dependency",
            "description": (
                "Build a support model where an expert solves tickets quickly but repeated escalation slows the team's own troubleshooting capacity."
            ),
            "graph": EMPTY_GRAPH,
            "order_index": 3,
        },
    ],
}


# ===========================================================================
# Example #5: Fixes that Fail
# ===========================================================================

FIXES_FAIL_CONTENT = """\

**Learning objective:** You can identify a **Fixes that Fail** structure, distinguish immediate improvement from delayed side effects, and explain why a policy can look successful before it makes the original problem return.

Fixes that Fail is a common system archetype. A problem appears. A fix is applied. The fix reduces the problem in the short term. Later, a side effect created by the fix feeds back into the same problem and makes it return, sometimes worse than before.

### The Basic Pattern

1. **Problem symptom**, a stock or condition is outside its desired range.
2. **Fix**, a balancing response pushes the symptom down.
3. **Delay**, the side effect is not visible immediately.
4. **Unintended consequence**, the fix changes incentives, capacity, or behavior.
5. **Return of the problem**, the delayed side effect adds pressure back into the original stock.

The trap is persuasive because the early chart looks good. If the simulation stops too soon, students may conclude that the fix worked. Running longer reveals the delayed feedback.

### Examples

Meadows discusses policy resistance and fixes that fail as cases where energetic interventions keep producing the same unwanted behavior. A familiar city example is road building. More road capacity can reduce congestion for a while, but easier driving attracts more car trips. After a delay, congestion returns. Similar structures appear in pesticide use, short-term discounts, debt refinancing, and overtime used to solve schedule pressure.

### How to Escape

Do not judge a fix only by its first result. Ask what behavior the fix encourages, what capacity it changes, and what delayed feedback will return later. Stronger solutions usually reduce the original pressure directly or change the incentive that creates it.

### In the Lab

- **Task 1: More roads, more traffic**
    Trace congestion relief, road capacity, induced demand, and delayed return of congestion in the road model.
- **Task 2: Pesticide rebound**
  Finish the pest model by adding the missing pesticide response and rebound signal.
- **Task 3: Overtime in a software project**
  Build a model where overtime reduces backlog now but creates fatigue and rework later.
- **Task 4: Retail discount trap**
  Build a model where discounts lift sales now but train customers to wait for future discounts.
"""

FIXES_FAIL_DEMO = compose_graph(
    nodes=[
        make_stock_node(
            "ff_congestion",
            "Traffic congestion",
            420,
            280,
            quantity=70,
            unit="index",
            student_tooltip="Problem stock: congestion initially drops when road capacity is added, then returns through induced demand.",
        ),
        make_stock_node(
            "ff_capacity",
            "Road capacity",
            650,
            280,
            quantity=45,
            unit="index",
            student_tooltip="Capacity stock: the fix expands it, but more capacity also attracts more trips after a delay.",
        ),
        make_flow_node("ff_trips", "Trip growth / demand", 140, 280, bottleneck=0, expression="max(0, (0) + (ff_induced))", base_flow_expression="0", unit="index/step"),
        make_flow_node("ff_relief", "Congestion relief from new lanes", 720, 410, bottleneck=0, expression="max(0, (0) + (ff_fix))", base_flow_expression="0", unit="index/step"),
        make_flow_node("ff_lanes", "Build more lanes", 430, 420, bottleneck=0, expression="max(0, (0) + (ff_fix))", base_flow_expression="0", unit="index/step"),
        make_flow_node("ff_wear", "Capacity bottlenecks", 880, 280, bottleneck=1.2, unit="index/step"),
        make_constant_node("ff_goal", "Acceptable congestion", 420, 80, quantity=25, loop_id="ff_l1", loop_role="goal", fb_type="balancing", unit="index"),
        make_variable_node(
            "ff_gap",
            "Congestion gap",
            420,
            175,
            expression="(ff_congestion > ff_goal ? (ff_congestion - ff_goal) : 0)",
            loop_id="ff_l1",
            loop_role="discrepancy",
            fb_type="balancing",
            color=C_AUX,
        ),
        make_variable_node(
            "ff_fix",
            "Road-building fix",
            720,
            180,
            expression="(max(0, (ff_gap))) / (4)",
            loop_id="ff_l1",
            loop_role="correctiveAction",
            fb_type="balancing",
            color=C_AUX,
            student_tooltip="Short-term fix: more lanes reduce the congestion stock.",
        ),
        make_variable_node(
            "ff_induced",
            "Induced car demand (delayed)",
            140,
            170,
            expression='(6) + (0.08) * delay("ff_capacity", 5)',
            unit="index/step",
            color=C_AUX,
            student_tooltip="Delayed side effect: easier driving attracts more trips later.",
        ),
    ],
    edges=[
        make_inflow_edge("ff_e1", "ff_trips", "ff_congestion"),
        make_outflow_edge("ff_e2", "ff_congestion", "ff_relief"),
        make_inflow_edge("ff_e3", "ff_lanes", "ff_capacity"),
        make_outflow_edge("ff_e4", "ff_capacity", "ff_wear"),
        make_feedback_edge("ff_e5", "ff_goal", "ff_gap", fb_type="balancing"),
        make_feedback_edge("ff_e6", "ff_congestion", "ff_gap", fb_type="balancing"),
        make_feedback_edge("ff_e7", "ff_gap", "ff_fix", fb_type="balancing"),
        make_feedback_edge("ff_e8", "ff_fix", "ff_relief", op="add", fb_type="balancing"),
        make_feedback_edge("ff_e9", "ff_fix", "ff_lanes", op="add"),
        make_feedback_edge("ff_e10", "ff_capacity", "ff_induced"),
        make_feedback_edge("ff_e11", "ff_induced", "ff_trips", op="add"),
    ],
    feedback_loops=[
        make_balancing_loop(
            "ff_l1",
            "ff_congestion",
            "ff_goal",
            "ff_gap",
            "ff_fix",
            "ff_relief",
            ["ff_e5", "ff_e6", "ff_e7", "ff_e8"],
            boundary_type="upper",
            goal_value=25,
            adjustment_time=4,
        )
    ],
)

FIXES_FAIL_PEST_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "ffp_todo",
            "Pests, pesticide kill, predator control, and rebound pressure are placed. Add the pesticide response formula and reconnect the delayed rebound signal.",
            20,
            20,
        ),
        make_stock_node("ffp_pests", "Crop pest population", 420, 280, quantity=66, unit="index"),
        make_stock_node("ffp_predators", "Natural predator capacity", 650, 280, quantity=36, unit="index"),
        make_flow_node("ffp_growth", "Pest reproduction", 140, 280, bottleneck=8, unit="index/step"),
        make_flow_node("ffp_spray_flow", "Pesticide kill", 720, 410, bottleneck=0, expression="", base_flow_expression="0", unit="index/step"),
        make_flow_node("ffp_pred_flow", "Natural predator control", 140, 410, bottleneck=0, expression="max(0, (0) + (ffp_control))", base_flow_expression="0", unit="index/step"),
        make_flow_node("ffp_pred_loss", "Predator loss from spraying", 880, 280, bottleneck=0, expression="max(0, (0) + (ffp_side))", base_flow_expression="0", unit="index/step"),
        make_constant_node("ffp_goal", "Tolerable pest level", 420, 80, quantity=24, unit="index"),
        make_variable_node("ffp_gap", "Pest gap", 420, 175, expression="(ffp_pests > ffp_goal ? (ffp_pests - ffp_goal) : 0)", color=C_AUX),
        make_variable_node("ffp_spray", "Pesticide response (finish)", 720, 180, expression="", color=C_AUX),
        make_variable_node("ffp_control", "Predator control strength", 140, 520, expression="(0.15) * (ffp_predators)", color=C_AUX),
        make_variable_node("ffp_side", "Delayed predator damage", 880, 180, expression='(0.05) * delay("ffp_spray", 4)', color=C_AUX),
    ],
    edges=[
        make_inflow_edge("ffp_e1", "ffp_growth", "ffp_pests"),
        make_outflow_edge("ffp_e2", "ffp_pests", "ffp_spray_flow"),
        make_outflow_edge("ffp_e3", "ffp_pests", "ffp_pred_flow"),
        make_outflow_edge("ffp_e4", "ffp_predators", "ffp_pred_loss"),
        make_feedback_edge("ffp_e5", "ffp_goal", "ffp_gap"),
        make_feedback_edge("ffp_e6", "ffp_pests", "ffp_gap"),
        make_feedback_edge("ffp_e9", "ffp_predators", "ffp_control"),
        make_feedback_edge("ffp_e10", "ffp_control", "ffp_pred_flow", op="add"),
        make_feedback_edge("ffp_e11", "ffp_spray", "ffp_side"),
        make_feedback_edge("ffp_e12", "ffp_side", "ffp_pred_loss", op="add"),
    ],
)

LESSON_FIXES_THAT_FAIL = {
    "title": "Fixes that Fail",
    "order_index": 4,
    "content_markdown": FIXES_FAIL_CONTENT,
    "tasks": [
        {"title": "Task 1: More roads, more traffic", "description": "Run the road model long enough to see the delayed side effect. Identify congestion relief, capacity growth, and induced demand.", "graph": FIXES_FAIL_DEMO, "order_index": 0},
        {"title": "Task 2: Pesticide rebound", "description": "Finish the pest model. Pest level, predator capacity, control, and side-effect drain are placed; add the pesticide response and rebound links.", "graph": FIXES_FAIL_PEST_ALMOST, "order_index": 1},
        {"title": "Task 3: Overtime in a software project", "description": "Build a project model where overtime reduces backlog now but creates fatigue and rework later.", "graph": EMPTY_GRAPH, "order_index": 2},
        {"title": "Task 4: Retail discount trap", "description": "Build a model where discounts lift sales now but train customers to wait for future discounts.", "graph": EMPTY_GRAPH, "order_index": 3},
    ],
}


# ===========================================================================
# Example #6: Eroding Goals
# ===========================================================================

ERODING_GOALS_CONTENT = """\

**Learning objective:** You can recognize **Eroding Goals**, model the goal as something that can change, and explain why lowering the target can hide real performance decline.

Eroding Goals happens when people respond to a performance gap by lowering the goal instead of improving the system. The visible gap becomes smaller, so the system feels less pressure to improve. Over time, the weaker goal becomes normal.

### The Basic Pattern

1. **Performance stock**, the real state of the system.
2. **Goal or standard**, the desired state.
3. **Gap**, the difference between the goal and performance.
4. **Correction path**, work that improves performance.
5. **Goal erosion path**, pressure that lowers the goal when the gap persists.

Meadows calls this trap drift to low performance. The balancing loop that should correct the problem is undermined by a reinforcing loop: lower performance lowers expectations, lower expectations reduce corrective effort, and reduced effort allows still lower performance.

### Examples

A software team may slowly accept lower quality or remove features every time a deadline is missed. A hospital may normalize longer waiting times. A school may accept weaker homework standards because last year's work was already weak. The system can look successful only because the measuring stick has moved.

### How to Escape

Keep standards independent from the current bad state, or let goals be pulled upward by the best historical performance rather than downward by the worst. In model terms, make the goal visible as a node and test what happens when it is fixed, eroded, or raised.

### In the Lab

- **Task 1: Service quality drift**
    Trace quality, standard, improvement work, slippage, and goal erosion in the service model.
- **Task 2: Software deadline and scope**
  Finish the software model by adding the missing scope erosion formula and reconnecting the goal-adjustment path.
- **Task 3: School homework standards**
  Build a model where weak homework performance lowers expectations unless a fixed standard is protected.
- **Task 4: Hospital waiting time target**
  Build a model where the official waiting-time goal erodes when staffing problems persist.
"""

ERODING_GOALS_DEMO = compose_graph(
    nodes=[
        make_stock_node("eg_quality", "Service quality", 420, 280, quantity=64, unit="index", student_tooltip="Performance stock: the real quality customers experience."),
        make_stock_node("eg_standard", "Quality standard", 650, 280, quantity=88, unit="index", student_tooltip="Goal stock: this should be protected, but here it can erode."),
        make_flow_node("eg_improve", "Improvement work", 140, 280, bottleneck=0, expression="max(0, (0) + (eg_effort))", base_flow_expression="0", unit="index/step"),
        make_flow_node("eg_slip", "Operational slippage", 720, 410, bottleneck=5, unit="index/step"),
        make_flow_node("eg_erosion_flow", "Goal erosion", 880, 280, bottleneck=0, expression="max(0, (0) + (eg_erosion))", base_flow_expression="0", unit="index/step"),
        make_variable_node("eg_gap", "Quality gap", 420, 175, expression="(eg_quality < eg_standard ? (eg_standard - eg_quality) : 0)", color=C_AUX),
        make_variable_node("eg_effort", "Corrective improvement", 140, 175, expression="(max(0, (eg_gap))) / (5)", color=C_AUX),
        make_variable_node("eg_erosion", "Pressure to lower standard", 880, 175, expression='(max(0, (delay("eg_gap", 5)))) / (8)', color=C_AUX),
    ],
    edges=[
        make_inflow_edge("eg_e1", "eg_improve", "eg_quality"),
        make_outflow_edge("eg_e2", "eg_quality", "eg_slip"),
        make_outflow_edge("eg_e3", "eg_standard", "eg_erosion_flow"),
        make_feedback_edge("eg_e4", "eg_standard", "eg_gap"),
        make_feedback_edge("eg_e5", "eg_quality", "eg_gap"),
        make_feedback_edge("eg_e6", "eg_gap", "eg_effort"),
        make_feedback_edge("eg_e7", "eg_effort", "eg_improve", op="add"),
        make_feedback_edge("eg_e8", "eg_gap", "eg_erosion"),
        make_feedback_edge("eg_e9", "eg_erosion", "eg_erosion_flow", op="add"),
    ],
)

ERODING_GOALS_SOFTWARE_ALMOST = compose_graph(
    nodes=[
        make_comment_node("egs_todo", "Delivered quality, accepted standard, improvement work, and slippage are placed. Add the goal erosion formula and reconnect the standard-adjustment path.", 20, 20),
        make_stock_node("egs_quality", "Delivered software quality", 420, 280, quantity=58, unit="index"),
        make_stock_node("egs_standard", "Accepted quality bar", 650, 280, quantity=84, unit="index"),
        make_flow_node("egs_improve", "Refactoring and testing", 140, 280, bottleneck=0, expression="max(0, (0) + (egs_effort))", base_flow_expression="0", unit="index/step"),
        make_flow_node("egs_slip", "Defects and scope churn", 720, 410, bottleneck=5, unit="index/step"),
        make_flow_node("egs_erosion_flow", "Scope / quality cuts", 880, 280, bottleneck=0, expression="", base_flow_expression="0", unit="index/step"),
        make_variable_node("egs_gap", "Delivery gap", 420, 175, expression="(egs_quality < egs_standard ? (egs_standard - egs_quality) : 0)", color=C_AUX),
        make_variable_node("egs_effort", "Improvement effort", 140, 175, expression="(max(0, (egs_gap))) / (5)", color=C_AUX),
        make_variable_node("egs_erosion", "Goal erosion (finish)", 880, 175, expression="", color=C_AUX),
    ],
    edges=[
        make_inflow_edge("egs_e1", "egs_improve", "egs_quality"),
        make_outflow_edge("egs_e2", "egs_quality", "egs_slip"),
        make_outflow_edge("egs_e3", "egs_standard", "egs_erosion_flow"),
        make_feedback_edge("egs_e4", "egs_standard", "egs_gap"),
        make_feedback_edge("egs_e5", "egs_quality", "egs_gap"),
        make_feedback_edge("egs_e6", "egs_gap", "egs_effort"),
        make_feedback_edge("egs_e7", "egs_effort", "egs_improve", op="add"),
    ],
)

LESSON_ERODING_GOALS = {
    "title": "Eroding Goals",
    "order_index": 5,
    "content_markdown": ERODING_GOALS_CONTENT,
    "tasks": [
        {"title": "Task 1: Service quality drift", "description": "Run the service model. Trace how a persistent quality gap can either trigger improvement or lower the standard itself.", "graph": ERODING_GOALS_DEMO, "order_index": 0},
        {"title": "Task 2: Software deadline and scope", "description": "Finish the software model. Delivered quality, accepted standard, improvement work, and slippage are placed; add the missing goal erosion path.", "graph": ERODING_GOALS_SOFTWARE_ALMOST, "order_index": 1},
        {"title": "Task 3: School homework standards", "description": "Build a homework model where weak performance lowers expectations unless a fixed standard is protected.", "graph": EMPTY_GRAPH, "order_index": 2},
        {"title": "Task 4: Hospital waiting time target", "description": "Build a waiting-time model where the official goal erodes when staffing problems persist.", "graph": EMPTY_GRAPH, "order_index": 3},
    ],
}


# ===========================================================================
# Example #7: Success to the Successful
# ===========================================================================

SUCCESS_SUCCESSFUL_CONTENT = """\

**Learning objective:** You can recognize **Success to the Successful**, model how early advantage attracts more resources, and identify interventions that keep competition from becoming winner-takes-all.

This archetype appears when two actors compete for a limited resource and the actor that is already ahead receives more of that resource. More resources create more success, and more success attracts still more resources. The other actor receives less support and falls further behind.

### The Basic Pattern

1. **Two competing stocks**, such as two projects, firms, teams, or species.
2. **Limited support pool**, such as teacher attention, investment, nutrients, platform visibility, or customer trust.
3. **Allocation rule**, more current success wins a larger share of support.
4. **Reinforcing advantage**, support improves future success.
5. **Divergence**, a small initial difference becomes a large gap.

Meadows connects this trap to competitive exclusion in ecology, monopoly formation, and rich-get-richer dynamics. The core structure is not that one actor is morally better. It is that the rules reward winners with the means to win again.

### How to Escape

Use diversity, caps, antitrust-like limits, rotating access, or support for weaker competitors. The point is not to punish success; it is to prevent the reward system from destroying the field of competition.

### In the Lab

- **Task 1: Two student projects**
    Trace how teacher feedback follows early project quality and widens the difference.
- **Task 2: Platform recommendation loop**
  Finish the platform model by adding the missing visibility share formula and information links.
- **Task 3: Two startups competing for investment**
  Build a model where early traction attracts funding, and funding creates more traction.
- **Task 4: Species competing for one niche**
  Build an ecology model where one species wins more of a limited food resource and excludes the other.
"""

SUCCESS_SUCCESSFUL_DEMO = compose_graph(
    nodes=[
        make_stock_node("s2s_a", "Project A quality", 300, 280, quantity=54, unit="index", student_tooltip="Slightly ahead at the start: this project receives a larger share of feedback."),
        make_stock_node("s2s_b", "Project B quality", 620, 280, quantity=48, unit="index", student_tooltip="Slightly behind at the start: less feedback makes catching up harder."),
        make_constant_node("s2s_pool", "Teacher feedback pool", 460, 80, quantity=14, unit="hrs/step", color=C_AUX),
        make_variable_node("s2s_a_share", "Feedback to A", 260, 170, expression="(s2s_pool) * ((s2s_a) / max(1, (s2s_a) + (s2s_b)))", fb_type="reinforcing", unit="hrs/step", color=C_REINFORCING),
        make_variable_node("s2s_b_share", "Feedback to B", 660, 170, expression="(s2s_pool) * ((s2s_b) / max(1, (s2s_a) + (s2s_b)))", fb_type="reinforcing", unit="hrs/step", color=C_REINFORCING),
        make_flow_node("s2s_a_gain", "A improvement from feedback", 100, 280, bottleneck=0, expression="max(0, (0) + (s2s_a_share))", base_flow_expression="0", unit="index/step"),
        make_flow_node("s2s_b_gain", "B improvement from feedback", 820, 280, bottleneck=0, expression="max(0, (0) + (s2s_b_share))", base_flow_expression="0", unit="index/step"),
        make_flow_node("s2s_a_decay", "A forgetting / rework", 300, 420, bottleneck=1.4, unit="index/step"),
        make_flow_node("s2s_b_decay", "B forgetting / rework", 620, 420, bottleneck=1.4, unit="index/step"),
    ],
    edges=[
        make_inflow_edge("s2s_e1", "s2s_a_gain", "s2s_a"),
        make_inflow_edge("s2s_e2", "s2s_b_gain", "s2s_b"),
        make_outflow_edge("s2s_e3", "s2s_a", "s2s_a_decay"),
        make_outflow_edge("s2s_e4", "s2s_b", "s2s_b_decay"),
        make_feedback_edge("s2s_e5", "s2s_pool", "s2s_a_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e6", "s2s_a", "s2s_a_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e7", "s2s_b", "s2s_a_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e8", "s2s_a_share", "s2s_a_gain", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e9", "s2s_pool", "s2s_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e10", "s2s_b", "s2s_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e11", "s2s_a", "s2s_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2s_e12", "s2s_b_share", "s2s_b_gain", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        make_reinforcing_loop("s2s_l_a", "s2s_a", "s2s_a_share", "s2s_a_gain", ["s2s_e6", "s2s_e8"], k=0.1, polarity="positive"),
        make_reinforcing_loop("s2s_l_b", "s2s_b", "s2s_b_share", "s2s_b_gain", ["s2s_e10", "s2s_e12"], k=0.1, polarity="positive"),
    ],
)

SUCCESS_SUCCESSFUL_PLATFORM_ALMOST = compose_graph(
    nodes=[
        make_comment_node("s2sp_todo", "Creators, recommendation pool, and improvement flows are placed. Add the missing visibility share formula and reconnect the information links.", 20, 20),
        make_stock_node("s2sp_a", "Creator A audience", 300, 280, quantity=58, unit="k users"),
        make_stock_node("s2sp_b", "Creator B audience", 620, 280, quantity=44, unit="k users"),
        make_constant_node("s2sp_pool", "Recommendation slots", 460, 80, quantity=16, unit="slots/step"),
        make_variable_node("s2sp_a_share", "Visibility to A (finish)", 260, 170, expression="", fb_type="reinforcing", color=C_REINFORCING),
        make_variable_node("s2sp_b_share", "Visibility to B", 660, 170, expression="(s2sp_pool) * ((s2sp_b) / max(1, (s2sp_a) + (s2sp_b)))", fb_type="reinforcing", color=C_REINFORCING),
        make_flow_node("s2sp_a_gain", "A audience growth", 100, 280, bottleneck=0, expression="max(0, (0) + (s2sp_a_share))", base_flow_expression="0", unit="k/step"),
        make_flow_node("s2sp_b_gain", "B audience growth", 820, 280, bottleneck=0, expression="max(0, (0) + (s2sp_b_share))", base_flow_expression="0", unit="k/step"),
    ],
    edges=[
        make_inflow_edge("s2sp_e1", "s2sp_a_gain", "s2sp_a"),
        make_inflow_edge("s2sp_e2", "s2sp_b_gain", "s2sp_b"),
        make_feedback_edge("s2sp_e5", "s2sp_pool", "s2sp_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2sp_e6", "s2sp_b", "s2sp_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2sp_e7", "s2sp_a", "s2sp_b_share", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("s2sp_e8", "s2sp_b_share", "s2sp_b_gain", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
    ],
)

LESSON_SUCCESS_TO_SUCCESSFUL = {
    "title": "Success to the Successful",
    "order_index": 6,
    "content_markdown": SUCCESS_SUCCESSFUL_CONTENT,
    "tasks": [
        {"title": "Task 1: Two student projects", "description": "Run the project model. Explain how a small initial advantage attracts more feedback and becomes a larger advantage.", "graph": SUCCESS_SUCCESSFUL_DEMO, "order_index": 0},
        {"title": "Task 2: Platform recommendation loop", "description": "Finish the platform model. Creator audiences and recommendation slots are placed; add the missing visibility share formula and links.", "graph": SUCCESS_SUCCESSFUL_PLATFORM_ALMOST, "order_index": 1},
        {"title": "Task 3: Startup funding race", "description": "Build a model where early traction attracts funding, and funding creates more traction.", "graph": EMPTY_GRAPH, "order_index": 2},
        {"title": "Task 4: Species competing for one niche", "description": "Build an ecology model where one species wins more of a limited food resource and excludes the other.", "graph": EMPTY_GRAPH, "order_index": 3},
    ],
}


# ===========================================================================
# Example #8: Growth and Underinvestment
# ===========================================================================

GROWTH_UNDERINVESTMENT_CONTENT = """\

**Learning objective:** You can recognize **Growth and Underinvestment**, explain how weak capacity investment limits a growth loop, and model the delay between demand growth and capacity expansion.

This archetype starts with a reinforcing growth engine. Demand, users, riders, customers, or workload grows. At first that growth is good. But growth creates pressure on a capacity stock. If capacity is not expanded early enough, service quality falls. Lower service quality then slows or reverses growth.

### The Basic Pattern

1. **Demand or activity stock**, the thing that is growing.
2. **Capacity stock**, the resources needed to serve that demand.
3. **Service quality**, the ratio between capacity and demand.
4. **Growth loop**, good service supports more demand.
5. **Investment loop**, capacity expands only after a perceived gap.
6. **Delay or low standard**, investment arrives too late or is judged against today's demand instead of future demand.

The trap is not simply "there is a limit." It is that the limit could have been moved if the system had invested before quality collapsed.

### Example

Rail transport is a clear teaching example. Low prices and good service can increase ridership. But if the operator does not invest in trains, tracks, stations, maintenance, and staff, the capacity stock lags behind demand. Crowding and delays reduce service quality, and passengers shift to cars or planes. The growth opportunity disappears because the capacity decision was too slow.

### How to Escape

Set capacity goals from expected future demand, not only current demand. Protect service-quality standards. Shorten investment delays, and invest before growth creates a visible crisis.

### In the Lab

- **Task 1: Rail capacity underinvestment**
    Trace ridership growth, service quality, capacity gap, delayed investment, and lost riders in the rail model.
- **Task 2: Clinic appointment capacity**
  Finish the clinic model by adding the missing investment formula and reconnecting the quality-capacity path.
- **Task 3: SaaS infrastructure growth**
  Build a model where user growth strains server capacity and slow infrastructure investment causes churn.
- **Task 4: University course capacity**
  Build a model where student demand grows faster than instructors, labs, and classroom seats.
"""

GROWTH_UNDERINVESTMENT_DEMO = compose_graph(
    nodes=[
        make_stock_node("gu_demand", "Rail ridership demand", 420, 280, quantity=35, unit="k riders", student_tooltip="Growth stock: demand rises while service quality is good."),
        make_stock_node("gu_capacity", "Train and track capacity", 650, 280, quantity=28, unit="k seats", student_tooltip="Capacity stock: investment expands it, but only after a delay."),
        make_flow_node("gu_growth_flow", "Word-of-mouth growth", 140, 280, bottleneck=0, expression="max(0, (0) + (gu_growth))", base_flow_expression="0", unit="k/step"),
        make_flow_node("gu_loss_flow", "Lost riders from poor service", 720, 410, bottleneck=0, expression="max(0, (0) + (gu_loss))", base_flow_expression="0", unit="k/step"),
        make_flow_node("gu_invest_flow", "New trains and track work", 430, 420, bottleneck=0, expression="max(0, (0) + (gu_investment))", base_flow_expression="0", unit="k seats/step"),
        make_flow_node("gu_wear", "Depreciation and bottlenecks", 880, 280, bottleneck=0.8, unit="k seats/step"),
        make_constant_node("gu_quality_goal", "Service quality standard", 140, 80, quantity=0.9, unit="ratio", color=C_AUX),
        make_variable_node("gu_quality", "Service quality = capacity / demand", 420, 175, expression="min(1, (gu_capacity) / max(1, (gu_demand)))", unit="ratio", color=C_AUX),
        make_variable_node("gu_growth", "Growth supported by quality", 140, 175, expression="(0.08) * (gu_demand) * (gu_quality)", fb_type="reinforcing", unit="k/step", color=C_REINFORCING),
        make_variable_node("gu_gap", "Capacity gap", 650, 175, expression="(gu_demand > gu_capacity ? (gu_demand - gu_capacity) : 0)", unit="k seats", color=C_AUX),
        make_variable_node("gu_investment", "Delayed capacity investment", 430, 520, expression='(max(0, (delay("gu_gap", 6)))) / (6)', unit="k seats/step", color=C_AUX),
        make_variable_node("gu_loss", "Churn from poor service", 720, 520, expression="max(0, (gu_quality_goal) - (gu_quality)) * (gu_demand) * (0.06)", unit="k/step", color=C_AUX),
    ],
    edges=[
        make_inflow_edge("gu_e1", "gu_growth_flow", "gu_demand"),
        make_outflow_edge("gu_e2", "gu_demand", "gu_loss_flow"),
        make_inflow_edge("gu_e3", "gu_invest_flow", "gu_capacity"),
        make_outflow_edge("gu_e4", "gu_capacity", "gu_wear"),
        make_feedback_edge("gu_e5", "gu_capacity", "gu_quality"),
        make_feedback_edge("gu_e6", "gu_demand", "gu_quality"),
        make_feedback_edge("gu_e7", "gu_quality", "gu_growth", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("gu_e8", "gu_demand", "gu_growth", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("gu_e9", "gu_growth", "gu_growth_flow", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("gu_e10", "gu_demand", "gu_gap"),
        make_feedback_edge("gu_e11", "gu_capacity", "gu_gap"),
        make_feedback_edge("gu_e12", "gu_gap", "gu_investment"),
        make_feedback_edge("gu_e13", "gu_investment", "gu_invest_flow", op="add"),
        make_feedback_edge("gu_e14", "gu_quality_goal", "gu_loss"),
        make_feedback_edge("gu_e15", "gu_quality", "gu_loss"),
        make_feedback_edge("gu_e16", "gu_loss", "gu_loss_flow", op="add"),
    ],
    feedback_loops=[
        make_reinforcing_loop("gu_l_growth", "gu_demand", "gu_growth", "gu_growth_flow", ["gu_e8", "gu_e9"], k=0.08, polarity="positive"),
    ],
)

GROWTH_UNDERINVESTMENT_CLINIC_ALMOST = compose_graph(
    nodes=[
        make_comment_node("guc_todo", "Patient demand, clinic capacity, service quality, and lost patients are placed. Add the delayed investment formula and reconnect the capacity-quality path.", 20, 20),
        make_stock_node("guc_demand", "Patient appointment demand", 420, 280, quantity=42, unit="visits"),
        make_stock_node("guc_capacity", "Clinician capacity", 650, 280, quantity=30, unit="visits"),
        make_flow_node("guc_growth_flow", "New patient demand", 140, 280, bottleneck=0, expression="max(0, (0) + (guc_growth))", base_flow_expression="0", unit="visits/step"),
        make_flow_node("guc_loss_flow", "Patients leaving", 720, 410, bottleneck=0, expression="max(0, (0) + (guc_loss))", base_flow_expression="0", unit="visits/step"),
        make_flow_node("guc_invest_flow", "Hire and train clinicians", 430, 420, bottleneck=0, expression="", base_flow_expression="0", unit="visits/step"),
        make_constant_node("guc_quality_goal", "Access standard", 140, 80, quantity=0.9, unit="ratio"),
        make_variable_node("guc_quality", "Access quality (finish links)", 420, 175, expression="min(1, (guc_capacity) / max(1, (guc_demand)))", color=C_AUX),
        make_variable_node("guc_growth", "Growth from good access", 140, 175, expression="(0.06) * (guc_demand) * (guc_quality)", fb_type="reinforcing", color=C_REINFORCING),
        make_variable_node("guc_gap", "Capacity gap", 650, 175, expression="(guc_demand > guc_capacity ? (guc_demand - guc_capacity) : 0)", color=C_AUX),
        make_variable_node("guc_investment", "Delayed investment (finish)", 430, 520, expression="", color=C_AUX),
        make_variable_node("guc_loss", "Lost patients from poor access", 720, 520, expression="max(0, (guc_quality_goal) - (guc_quality)) * (guc_demand) * (0.06)", color=C_AUX),
    ],
    edges=[
        make_inflow_edge("guc_e1", "guc_growth_flow", "guc_demand"),
        make_outflow_edge("guc_e2", "guc_demand", "guc_loss_flow"),
        make_inflow_edge("guc_e3", "guc_invest_flow", "guc_capacity"),
        make_feedback_edge("guc_e7", "guc_quality", "guc_growth", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("guc_e8", "guc_demand", "guc_growth", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("guc_e9", "guc_growth", "guc_growth_flow", op="add", fb_type="reinforcing", polarity="positive", persistent=True),
        make_feedback_edge("guc_e10", "guc_demand", "guc_gap"),
        make_feedback_edge("guc_e11", "guc_capacity", "guc_gap"),
        make_feedback_edge("guc_e14", "guc_quality_goal", "guc_loss"),
        make_feedback_edge("guc_e15", "guc_quality", "guc_loss"),
        make_feedback_edge("guc_e16", "guc_loss", "guc_loss_flow", op="add"),
    ],
)

LESSON_GROWTH_UNDERINVESTMENT = {
    "title": "Growth and Underinvestment",
    "order_index": 7,
    "content_markdown": GROWTH_UNDERINVESTMENT_CONTENT,
    "tasks": [
        {"title": "Task 1: Rail capacity underinvestment", "description": "Run the rail model. Identify ridership growth, service quality, capacity gap, delayed investment, and lost riders.", "graph": GROWTH_UNDERINVESTMENT_DEMO, "order_index": 0},
        {"title": "Task 2: Clinic appointment capacity", "description": "Finish the clinic model. Demand, capacity, service quality, and lost patients are placed; add the delayed investment formula and quality links.", "graph": GROWTH_UNDERINVESTMENT_CLINIC_ALMOST, "order_index": 1},
        {"title": "Task 3: SaaS infrastructure growth", "description": "Build a SaaS model where user growth strains server capacity and slow infrastructure investment causes churn.", "graph": EMPTY_GRAPH, "order_index": 2},
        {"title": "Task 4: University course capacity", "description": "Build a university model where student demand grows faster than instructors, labs, and classroom seats.", "graph": EMPTY_GRAPH, "order_index": 3},
    ],
}


RESILIENCE_CITY_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "city_todo",
            "Finish two details. Add the recovery formula and reconnect the missing information links so municipal capacity helps employment recover.",
            20,
            20,
        ),
        make_stock_node(
            "city_jobs",
            "Employment level",
            420,
            260,
            quantity=64,
            unit="index",
            student_tooltip="Stock: jobs in the city after a crisis.",
        ),
        make_stock_node(
            "city_capacity",
            "Municipal capacity buffer",
            650,
            260,
            quantity=42,
            unit="index",
            student_tooltip="Stock: fiscal and organizational slack that can support recovery.",
        ),
        make_flow_node(
            "city_loss",
            "Crisis job losses",
            720,
            390,
            bottleneck=7,
            unit="index/step",
            student_tooltip="Outflow: the shock that reduces employment.",
        ),
        make_flow_node(
            "city_recovery",
            "Recovery programs",
            160,
            260,
            bottleneck=0,
            expression="",
            base_flow_expression="0",
            unit="index/step",
            student_tooltip="Finish this flow: it should use the recovery effort variable.",
        ),
        make_constant_node(
            "city_goal",
            "Target employment",
            420,
            80,
            quantity=86,
            unit="index",
            color=C_AUX,
            student_tooltip="Goal: where the city wants employment to recover.",
        ),
        make_variable_node(
            "city_gap",
            "Employment recovery gap",
            420,
            170,
            expression="(city_jobs < city_goal ? (city_goal - city_jobs) : 0)",
            unit="index",
            color=C_AUX,
        ),
        make_variable_node(
            "city_effort",
            "Recovery effort (finish)",
            160,
            170,
            expression="",
            unit="index/step",
            color=C_AUX,
            student_tooltip="Add a formula using city_gap and city_capacity.",
        ),
    ],
    edges=[
        make_inflow_edge("city_e1", "city_recovery", "city_jobs"),
        make_outflow_edge("city_e2", "city_jobs", "city_loss"),
        make_feedback_edge("city_e3", "city_goal", "city_gap"),
        make_feedback_edge("city_e4", "city_jobs", "city_gap"),
    ],
)

SELF_ORG_MARKET_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "market_todo",
            "Add the price adjustment formula and reconnect local demand and supply signals. There should be no central planner node.",
            20,
            20,
        ),
        make_stock_node(
            "market_inventory",
            "Available inventory",
            420,
            260,
            quantity=54,
            unit="units",
            student_tooltip="Stock: goods available in the market.",
        ),
        make_flow_node(
            "market_supply",
            "Seller restocking",
            160,
            260,
            bottleneck=8,
            unit="units/step",
            student_tooltip="Inflow: decentralized seller response.",
        ),
        make_flow_node(
            "market_sales",
            "Buyer purchases",
            700,
            260,
            bottleneck=0,
            expression="max(0, (0) + (market_demand))",
            base_flow_expression="0",
            unit="units/step",
            student_tooltip="Outflow: purchases driven by local demand.",
        ),
        make_constant_node(
            "market_base_demand",
            "Local buyer interest",
            640,
            90,
            quantity=9,
            unit="index",
            color=C_AUX,
        ),
        make_variable_node(
            "market_price",
            "Price signal (finish)",
            420,
            90,
            expression="",
            unit="index",
            color=C_AUX,
            student_tooltip="Finish this: price should respond to excess demand or low inventory.",
        ),
        make_variable_node(
            "market_demand",
            "Demand after price",
            620,
            170,
            expression="max(0, (market_base_demand) - (market_price))",
            unit="units/step",
            color=C_AUX,
        ),
    ],
    edges=[
        make_inflow_edge("market_e1", "market_supply", "market_inventory"),
        make_outflow_edge("market_e2", "market_inventory", "market_sales"),
        make_feedback_edge("market_e3", "market_base_demand", "market_demand"),
        make_feedback_edge("market_e4", "market_demand", "market_sales", op="add"),
    ],
)

BOUNDARIES_CITY_ALMOST = compose_graph(
    nodes=[
        make_comment_node(
            "frame_city",
            "City limits inside this boundary",
            270,
            150,
            boundary_mode=True,
            frame_width=450,
            frame_height=300,
        ),
        make_comment_node(
            "metro_todo",
            "Add the metro stock outside the frame and connect commuters so the wider boundary changes the story.",
            20,
            20,
        ),
        make_stock_node(
            "city_pop",
            "City population",
            420,
            240,
            quantity=340,
            unit="k people",
            student_tooltip="Inside-boundary stock: residents counted by city limits.",
        ),
        make_flow_node(
            "city_in",
            "Move-ins",
            160,
            240,
            bottleneck=8,
            unit="k/yr",
        ),
        make_flow_node(
            "city_out",
            "Move-outs",
            680,
            240,
            bottleneck=6,
            unit="k/yr",
        ),
        make_constant_node(
            "metro_jobs",
            "Regional job pull (outside)",
            160,
            80,
            quantity=1.3,
            unit="index",
            color=C_AUX,
            student_tooltip="Exogenous for a narrow city boundary; endogenous if the model widens to the metro area.",
        ),
        make_variable_node(
            "commuter_pressure",
            "Commuter pressure (finish)",
            160,
            160,
            expression="",
            unit="k/yr",
            color=C_AUX,
            student_tooltip="Finish this calculation and decide whether it belongs inside or outside the boundary.",
        ),
    ],
    edges=[
        make_inflow_edge("bc_e1", "city_in", "city_pop"),
        make_outflow_edge("bc_e2", "city_pop", "city_out"),
        make_feedback_edge("bc_e3", "metro_jobs", "commuter_pressure"),
    ],
)


CUSTOM_ALMOST_DONE_GRAPHS = {
    "Stocks and Flows": STOCKS_FLOWS_BANK_ALMOST,
    "Constants and Variables": CONSTANTS_CAFE_ALMOST,
    "Resilience": RESILIENCE_CITY_ALMOST,
    "Self-Organization": SELF_ORG_MARKET_ALMOST,
    "Boundaries": BOUNDARIES_CITY_ALMOST,
    "Tragedy of the Commons": TRAGEDY_FISHERY_ALMOST,
    "Escalation": ESCALATION_PRICE_WAR_ALMOST,
    "Shifting the Burden": SHIFTING_BURDEN_SLEEP_ALMOST,
    "Fixes that Fail": FIXES_FAIL_PEST_ALMOST,
    "Eroding Goals": ERODING_GOALS_SOFTWARE_ALMOST,
    "Success to the Successful": SUCCESS_SUCCESSFUL_PLATFORM_ALMOST,
    "Growth and Underinvestment": GROWTH_UNDERINVESTMENT_CLINIC_ALMOST,
}


TASK_COPY_OVERRIDES: dict[str, list[tuple[str, str]]] = {
    "Stocks and Flows": [
        (
            "Task 1: Town water supply",
            "Trace how water moves through reservoir, treatment, and household storage, then identify which flows add and which flows drain.",
        ),
        (
            "Task 2: Personal budget transfers",
            "Finish the budget graph. Wallet and savings are placed; reconnect the two missing transfer ends so money can move into savings and back to the wallet.",
        ),
        (
            "Task 3: Household energy",
            "Build a household energy model using only stocks and flows. Include at least one stored energy stock, two inflows, and two outflows.",
        ),
        (
            "Task 4: Population age groups",
            "Build children and adults as separate stocks. Use births, aging, and deaths as flows, then explain how people move through the system.",
        ),
    ],
    "Constants and Variables": [
        (
            "Task 1: Bakery production parameters",
            "Identify the oven count and loaves per oven constants, then explain how the baking rate variable feeds the inventory inflow in the bakery graph.",
        ),
        (
            "Task 2: Cafeteria lunch prep",
            "Finish the cafeteria model. Meal trays, cooking capacity, expected demand, and serving pressure are placed; add the missing serving formula and information arrow.",
        ),
        (
            "Task 3: Pasture carrying capacity",
            "Build a pasture model with grass as a stock, regrowth and grazing as flows, carrying capacity as a constant, and a variable that names available headroom.",
        ),
        (
            "Task 4: Workload and wellbeing",
            "Build a small team model with wellbeing as a stock, workload and support as constants, a strain index variable, and a burnout drain.",
        ),
    ],
    "Balancing Loop": [
        (
            "Task 1: Thermostat stability",
            "Trace goal, gap, corrective action, heating, and cooling in the thermostat model. Change the setpoint and describe how the stock moves.",
        ),
        (
            "Task 2: Student self evaluation",
            "Finish the student loop. Performance, target grade, gap, study effort, and slippage are placed; complete the missing correction so performance moves toward the goal.",
        ),
        (
            "Task 3: Shop inventory",
            "Build an inventory balancing loop: stock on hand, target stock, stockout gap, reorder inflow, and customer purchase outflow.",
        ),
        (
            "Task 4: Body temperature",
            "Build body temperature regulation with a core temperature stock, setpoint, too cold and too hot gaps, heat generation, and heat loss.",
        ),
    ],
    "Reinforcing Loop": [
        (
            "Task 1: Population growth (R)",
            "Trace stock, multiplier, inflow, and stock again in the population growth graph. Explain why the curve bends upward.",
        ),
        (
            "Task 2: Self confidence spiral",
            "Finish the self confidence model. Confidence and successful attempts inflow are placed; add the multiplier expression and reinforcing information links.",
        ),
        (
            "Task 3: Compound interest",
            "Build a compound interest loop: savings as stock, interest as inflow, and a multiplier that scales interest with the current balance.",
        ),
        (
            "Task 4: Viral adoption",
            "Build a viral adoption loop: active users as stock, new user inflow, and a multiplier that grows as the user base grows.",
        ),
    ],
    "Delay": [
        (
            "Task 1: Car dealership",
            "Trace target inventory, delayed reorder correction, shipments, and customer sales in the dealership graph. Explain the oscillation.",
        ),
        (
            "Task 2: Pollution visibility",
            "Finish the pollution visibility model. Quality, target, delayed gap, cleanup, and emissions are placed; complete the delayed response path.",
        ),
        (
            "Task 3: Decision making lag",
            "Build a project quality model where late metrics cause delayed improvement initiatives and overcorrection.",
        ),
        (
            "Task 4: Supply chain",
            "Build a supply chain shelf model with order to receipt delay, customer purchases, target stock, and delayed replenishment.",
        ),
    ],
    "Resilience": [
        (
            "Task 1: Forest after fire",
            "Identify multiple stocks, the fire shock, and parallel recovery paths that make the ecosystem resilient in the forest model.",
        ),
        (
            "Task 2: City economy after crisis",
            "Finish the city recovery model. Employment and municipal capacity are placed; add the missing recovery formula and connect the support path.",
        ),
        (
            "Task 3: Personal health recovery",
            "Build a health recovery model with a health stock, illness drain, restorative inflows, and at least one buffer or support stock.",
        ),
        (
            "Task 4: Biodiversity resistance",
            "Build a biodiversity model with at least two species/function stocks and parallel recovery paths after a disturbance.",
        ),
    ],
    "Self-Organization": [
        (
            "Task 1: Ant hill emergence",
            "Explain how local rule constants and repeated worker deposition create global structure without a boss node in the ant hill model.",
        ),
        (
            "Task 2: Free market pricing",
            "Finish the market model. Inventory, supply, sales, local demand, and price signal are placed; add the missing price formula and signal path.",
        ),
        (
            "Task 3: Organic city growth",
            "Build a city growth model where neighborhoods, amenities, and migration interact from local incentives instead of a single central controller.",
        ),
        (
            "Task 4: Immune response",
            "Build an immune response model with threat stock, local activation, response capacity, and clearance flow.",
        ),
    ],
    "Hierarchy": [
        (
            "Task 1: Environmental five level stack",
            "Trace how flows roll lower level activity into higher level stocks in the individual to planet hierarchy.",
        ),
        (
            "Task 2: Biological hierarchy",
            "Finish the biological hierarchy. Cell, organ, organism, and ecosystem stocks are placed; reconnect the missing roll up path and run it.",
        ),
        (
            "Task 3: Company hierarchy",
            "Build a company hierarchy with employee, team/department, and company stocks plus upward result flows and downward support flows.",
        ),
        (
            "Task 4: Global issue ladder",
            "Build a local to global issue ladder for climate or health: local action, national policy, and international agreement as nested levels.",
        ),
    ],
    "Boundaries": [
        (
            "Task 1: University system",
            "Separate inside stocks/flows from outside drivers in the university boundary graph and explain why the line matters.",
        ),
        (
            "Task 2: City vs metro",
            "Finish the city vs metro boundary model. City population and regional job pull are placed; add the missing metro stock and commuter connection.",
        ),
        (
            "Task 3: Personal to society",
            "Build nested boundaries for you, family, and society. Add one stock or feedback that appears only when the boundary widens.",
        ),
        (
            "Task 4: Watershed vs county",
            "Build two boundary frames for water pollution: watershed and county line. Explain which stocks and loops move when the boundary changes.",
        ),
    ],
    "Limits to Growth and the S-Curve": [
        (
            "Task 1: Business vs market limit",
            "Identify the growth engine, the market ceiling, and the slow fast slow S curve phases in the business growth graph.",
        ),
        (
            "Task 2: Population and resources",
            "Finish the population resource model. Population and carrying capacity are placed; complete the headroom limited growth path.",
        ),
        (
            "Task 3: Technology adoption",
            "Build a technology adoption S curve with adopters as a stock, new adoption as inflow, and saturation as the limiting headroom.",
        ),
        (
            "Task 4: Pollution budget",
            "Build a pollution accumulation model where remaining assimilative capacity or budget limits further growth.",
        ),
    ],
    "Tragedy of the Commons": [
        (
            "Task 1: Overgrazing pasture",
            "Trace shared grass, herd growth incentives, grazing pressure, and ecological regrowth in the pasture commons graph.",
        ),
        (
            "Task 2: Ocean overfishing",
            "Finish the fishery commons model. Fish biomass, fleet effort, catch pressure, and regrowth are placed; complete the missing private incentive path.",
        ),
        (
            "Task 3: City air pollution",
            "Build an urban air commons model with clean air as shared stock, private emissions as drains, and at least one recovery or regulation path.",
        ),
        (
            "Task 4: Public road traffic",
            "Build a road capacity commons model where individual route choices create collective congestion. Add one structural policy lever.",
        ),
    ],
    "Escalation": [
        (
            "Task 1: Arms race",
            "Trace the two cross reinforcing buildup paths in the arms race graph and predict behavior if neither side changes rules.",
        ),
        (
            "Task 2: Price war",
            "Finish the price war model. Rival pressure stocks and discount flows are placed; complete the missing cross response path.",
        ),
        (
            "Task 3: Social media outrage",
            "Build a two community outrage model with mutual reaction signals and at least one intervention that weakens the escalation.",
        ),
        (
            "Task 4: Advertising competition",
            "Build an advertising arms race model with rival attention or ad spend stocks and cross response flows.",
        ),
    ],
    "Shifting the Burden": [
        (
            "Task 1: Cramming vs study habit",
            "Trace learning pressure, cramming relief, steady learning, habit building, and the dependency drain in the student model.",
        ),
        (
            "Task 2: Sleep aid dependence",
            "Finish the sleep model. Sleep debt, natural sleep capacity, routine practice, and side effects are placed; add the missing sleep-aid response formula and quick-fix links.",
        ),
        (
            "Task 3: Farm fertilizer dependence",
            "Build a farm model with soil health as a capacity stock, fertilizer as a quick yield fix, and crop rotation or compost as the slower fundamental solution.",
        ),
        (
            "Task 4: Help desk dependency",
            "Build a team support model where an expert helper solves tickets quickly but repeated escalation weakens the team's own troubleshooting capacity.",
        ),
    ],
    "Fixes that Fail": [
        (
            "Task 1: More roads, more traffic",
            "Trace congestion relief, road capacity growth, induced demand, and the delayed return of congestion in the road model.",
        ),
        (
            "Task 2: Pesticide rebound",
            "Finish the pest model. Pest level, pesticide kill, predator control, and side-effect drain are placed; add the missing pesticide response and rebound links.",
        ),
        (
            "Task 3: Overtime in a software project",
            "Build a project model where overtime reduces backlog now but creates fatigue, rework, and future schedule pressure.",
        ),
        (
            "Task 4: Retail discount trap",
            "Build a retail model where discounts lift sales now but train customers to wait for future discounts and weaken normal demand.",
        ),
    ],
    "Eroding Goals": [
        (
            "Task 1: Service quality drift",
            "Trace real quality, the quality standard, improvement work, slippage, and pressure to lower the goal in the service model.",
        ),
        (
            "Task 2: Software deadline and scope",
            "Finish the software model. Delivered quality, accepted standard, improvement work, and slippage are placed; add the missing goal erosion path.",
        ),
        (
            "Task 3: School homework standards",
            "Build a homework model where weak performance lowers expectations unless a fixed standard or best-past-performance standard is protected.",
        ),
        (
            "Task 4: Hospital waiting time target",
            "Build a waiting-time model where the official service target erodes when staffing problems persist.",
        ),
    ],
    "Success to the Successful": [
        (
            "Task 1: Two student projects",
            "Explain how a small initial advantage attracts more feedback and becomes a larger advantage in the project model.",
        ),
        (
            "Task 2: Platform recommendation loop",
            "Finish the platform model. Creator audiences and recommendation slots are placed; add the missing visibility share formula and information links.",
        ),
        (
            "Task 3: Startup funding race",
            "Build a startup model where early traction attracts funding, and funding creates more traction.",
        ),
        (
            "Task 4: Species competing for one niche",
            "Build an ecology model where two species compete for one limited food resource and one gradually excludes the other.",
        ),
    ],
    "Growth and Underinvestment": [
        (
            "Task 1: Rail capacity underinvestment",
            "Trace ridership growth, service quality, capacity gap, delayed investment, and lost riders in the rail model.",
        ),
        (
            "Task 2: Clinic appointment capacity",
            "Finish the clinic model. Demand, capacity, service quality, and lost patients are placed; add the missing delayed investment formula and quality links.",
        ),
        (
            "Task 3: SaaS infrastructure growth",
            "Build a SaaS model where user growth strains server capacity and slow infrastructure investment causes churn.",
        ),
        (
            "Task 4: University course capacity",
            "Build a university model where student demand grows faster than instructors, labs, and classroom seats.",
        ),
    ],
}


def apply_task_copy_overrides(lesson: dict) -> None:
    overrides = TASK_COPY_OVERRIDES.get(lesson["title"])
    if not overrides:
        return
    if len(overrides) != len(lesson["tasks"]):
        raise ValueError(f"Task copy override count mismatch for {lesson['title']}")
    for task, (title, description) in zip(lesson["tasks"], overrides):
        task["title"] = title
        task["description"] = description


def task_groups_for_scaffolding(lesson: dict) -> list[list[dict]]:
    return [lesson["tasks"]]


def apply_task_scaffolding(lesson: dict) -> dict:
    for group in task_groups_for_scaffolding(lesson):
        if not group:
            continue

        first = group[0]
        first["description"] = remove_task_leading_phrases(first["description"])

        if len(group) >= 2:
            second = group[1]
            custom_graph = CUSTOM_ALMOST_DONE_GRAPHS.get(lesson["title"])
            if custom_graph is not None:
                second["graph"] = custom_graph
            elif second["graph"] is not EMPTY_GRAPH:
                second["graph"] = make_almost_done_graph(
                    second["graph"],
                    note=(
                        "Almost done: a couple of details are intentionally missing. "
                        "Add the missing formula and reconnect the missing information links before you run and submit."
                    ),
                )
            second["description"] = remove_task_leading_phrases(second["description"])

        for task in group[2:]:
            task["graph"] = EMPTY_GRAPH
            task["description"] = blank_canvas_task_body(task["description"])

        for task in group:
            remove_starter_comment_nodes(task["graph"])
            colorize_graph(task["graph"])
            beautify_graph_layout(task["graph"])
            simplify_graph_text(task["graph"])

            task["title"] = simplify_student_text(task["title"])
            task["description"] = simplify_student_text(task["description"])

    lesson["title"] = simplify_student_text(lesson["title"])
    lesson["content_markdown"] = simplify_student_text(lesson["content_markdown"])
    return lesson


for _lesson_spec in [
    LESSON_STOCKS_FLOWS,
    LESSON_CONSTANTS_AND_VARIABLES,
    LESSON_BALANCING_LOOPS,
    LESSON_REINFORCING_LOOPS,
    LESSON_DELAYS,
    LESSON_RESILIENCE,
    LESSON_SELF_ORGANIZATION,
    LESSON_HIERARCHY,
    LESSON_BOUNDARIES,
    LESSON_EXAMPLES_1,
    LESSON_EXAMPLES_2,
    LESSON_EXAMPLES_3,
    LESSON_SHIFTING_BURDEN,
    LESSON_FIXES_THAT_FAIL,
    LESSON_ERODING_GOALS,
    LESSON_SUCCESS_TO_SUCCESSFUL,
    LESSON_GROWTH_UNDERINVESTMENT,
]:
    apply_task_copy_overrides(_lesson_spec)
    apply_task_scaffolding(_lesson_spec)


# =============================================================================
# Section specs
# =============================================================================

SYSTEMS_THINKING_SECTIONS: list[dict] = [
    {
        "title": "Basics",
        "color": "#1E40AF",
        "order_index": 0,
        "lessons": [
            LESSON_STOCKS_FLOWS,
            LESSON_CONSTANTS_AND_VARIABLES,
        ],
    },
    {
        "title": "Feedbacks",
        "color": "#F59E0B",
        "order_index": 1,
        "lessons": [
            LESSON_BALANCING_LOOPS,
            LESSON_REINFORCING_LOOPS,
            LESSON_DELAYS,
        ],
    },
    {
        "title": "System Properties",
        "color": "#14B8A6",
        "order_index": 2,
        "lessons": [
            LESSON_RESILIENCE,
            LESSON_SELF_ORGANIZATION,
            LESSON_HIERARCHY,
            LESSON_BOUNDARIES,
        ],
    },
    {
        "title": "Traps and Opportunities",
        "color": "#8B5CF6",
        "order_index": 3,
        "lessons": [
            LESSON_EXAMPLES_1,
            LESSON_EXAMPLES_2,
            LESSON_EXAMPLES_3,
            LESSON_SHIFTING_BURDEN,
            LESSON_FIXES_THAT_FAIL,
            LESSON_ERODING_GOALS,
            LESSON_SUCCESS_TO_SUCCESSFUL,
            LESSON_GROWTH_UNDERINVESTMENT,
        ],
    },
]


# =============================================================================
# Seeding functions
# =============================================================================

LEGACY_SECTION_TITLES = frozenset(
    {
        "The Basics",
        "System Dynamics",
        "System Archetypes",
    }
)


def _delete_lesson_cascade(db: Session, lesson: Lesson) -> None:
    tasks = db.query(LessonTask).filter(LessonTask.lesson_id == lesson.id).all()
    for task in tasks:
        db.query(UserTaskProgress).filter(UserTaskProgress.task_id == task.id).delete()
        sid = int(task.system_id)
        db.delete(task)
        db.flush()
        tmpl = db.query(SystemModel).filter(SystemModel.id == sid).first()
        if tmpl is not None:
            db.delete(tmpl)
    db.query(UserProgress).filter(UserProgress.lesson_id == lesson.id).delete()
    for orphan in (
        db.query(SystemModel)
        .filter(
            SystemModel.lesson_id == lesson.id,
        )
        .all()
    ):
        db.delete(orphan)
    db.delete(lesson)
    db.flush()


def delete_superseded_systems_thinking_sections(db: Session) -> None:
    for title in LEGACY_SECTION_TITLES:
        section = db.query(Section).filter(Section.title == title).first()
        if section is None:
            continue
        lessons = db.query(Lesson).filter(Lesson.section_id == section.id).all()
        for lesson in lessons:
            _delete_lesson_cascade(db, lesson)
        db.delete(section)
        db.flush()


def seed_systems_thinking(db: Session) -> None:
    delete_superseded_systems_thinking_sections(db)
    for section_spec in SYSTEMS_THINKING_SECTIONS:
        upsert_systems_section(db, section_spec)
    db.commit()


def upsert_systems_section(db: Session, spec: dict) -> None:
    section = db.query(Section).filter(Section.title == spec["title"]).first()
    if not section:
        section = Section(
            title=spec["title"],
            color=spec["color"],
            order_index=spec["order_index"],
            is_published=True,
        )
        db.add(section)
        db.flush()
    else:
        section.color = spec["color"]
        section.order_index = spec["order_index"]
        section.is_published = True
        db.flush()

    for lesson_spec in spec["lessons"]:
        upsert_systems_lesson(db, section, lesson_spec)


def _delete_systems_task_cascade(db: Session, task: LessonTask) -> None:
    db.query(UserTaskProgress).filter(UserTaskProgress.task_id == task.id).delete()
    sid = int(task.system_id)
    db.delete(task)
    db.flush()
    tmpl = db.query(SystemModel).filter(SystemModel.id == sid).first()
    if tmpl is not None:
        db.delete(tmpl)
    db.flush()


def upsert_systems_lesson(db: Session, section: Section, spec: dict) -> None:
    order_idx = int(spec["order_index"])
    lesson = (
        db.query(Lesson)
        .filter(Lesson.section_id == section.id, Lesson.order_index == order_idx)
        .first()
    )
    if lesson is None:
        lesson = (
            db.query(Lesson)
            .filter(Lesson.section_id == section.id, Lesson.title == spec["title"])
            .first()
        )
    if lesson is None:
        lesson = Lesson(
            title=spec["title"],
            content_markdown=spec["content_markdown"],
            section_id=section.id,
            order_index=order_idx,
            is_published=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.title = spec["title"]
        lesson.content_markdown = spec["content_markdown"]
        lesson.order_index = order_idx
        lesson.is_published = True
        db.flush()

    desired_orders = {int(t["order_index"]) for t in spec["tasks"]}
    for task in db.query(LessonTask).filter(LessonTask.lesson_id == lesson.id).all():
        if int(task.order_index) not in desired_orders:
            _delete_systems_task_cascade(db, task)

    for task_spec in spec["tasks"]:
        upsert_systems_task(db, lesson, task_spec)


def upsert_systems_task(db: Session, lesson: Lesson, spec: dict) -> None:
    oi = int(spec["order_index"])
    task = (
        db.query(LessonTask)
        .filter(LessonTask.lesson_id == lesson.id, LessonTask.order_index == oi)
        .first()
    )
    if not task:
        template = SystemModel(
            owner_id=None,
            lesson_id=lesson.id,
            title=spec["title"],
            graph_json=spec["graph"],
            is_public=False,
            is_template=True,
        )
        db.add(template)
        db.flush()

        task = LessonTask(
            lesson_id=lesson.id,
            title=spec["title"],
            description=spec["description"],
            system_id=template.id,
            order_index=oi,
        )
        db.add(task)
        db.flush()
    else:
        task.title = spec["title"]
        task.order_index = oi
        task.description = spec["description"]
        template = db.query(SystemModel).filter(SystemModel.id == task.system_id).first()
        if template:
            if template.title != spec["title"]:
                template.title = spec["title"]
            if template.graph_json != spec["graph"]:
                template.graph_json = spec["graph"]
            user_copies = (
                db.query(SystemModel)
                .filter(
                    SystemModel.source_system_id == template.id,
                    SystemModel.is_submitted_for_review == False,
                )
                .all()
            )
            for copy in user_copies:
                if copy.graph_json != spec["graph"]:
                    copy.graph_json = spec["graph"]
        db.flush()
