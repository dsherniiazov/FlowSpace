"""Seed systems-thinking lessons drawn from Donella Meadows' *Thinking in Systems*.

Organisation
------------
Section "The Basics"      — Lessons 1-3  (stocks/flows, balancing & reinforcing loops)
Section "System Dynamics" — Lessons 4-5  (delays & oscillation, S-shaped growth)
Section "System Archetypes" — Lessons 6-8 (limits to growth, tragedy of commons, escalation)

Each lesson has two tasks:
  Task 1 — pre-built demonstration the learner can run immediately.
  Task 2 — an open challenge with a minimal starting graph; no hints given.

Graph format
------------
The stored graph_json is the *canonical* format expected by labStore.loadGraphJson:
  nodes  → flat dicts with `kind`, `x`, `y`, `quantity`, `bottleneck`, `expression`, …
  edges  → flat dicts with `kind`, `weight`, `feedback_loop`, …
  feedbackLoops → list of BalancingFeedbackLoop / ReinforcingFeedbackLoop dicts
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.lesson_tasks import LessonTask
from backend.models.lessons import Lesson
from backend.models.sections import Section
from backend.models.systems import SystemModel


# =============================================================================
# Graph-builder helpers
# =============================================================================

def _node(
    kind: str,
    id_: str,
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
) -> dict:
    """Return a graph node in the format expected by labStore.loadGraphJson."""
    return {
        "id": id_,
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
        "decay": 0,
        "bias": 0,
        "label": label,
    }


def _stock(id_: str, label: str, x: int, y: int, *, quantity: float = 100, unit: str = "") -> dict:
    return _node("stockNode", id_, label, x, y, quantity=quantity, unit=unit)


def _flow(
    id_: str,
    label: str,
    x: int,
    y: int,
    *,
    bottleneck: float = 10,
    expression: str = "",
    base_flow_expression: str = "",
    unit: str = "",
) -> dict:
    return _node(
        "flowNode",
        id_,
        label,
        x,
        y,
        quantity=bottleneck,
        bottleneck=bottleneck,
        expression=expression,
        base_flow_expression=base_flow_expression,
        unit=unit,
    )


def _variable(
    id_: str,
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
) -> dict:
    return _node(
        "variableNode",
        id_,
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
    )


def _constant(
    id_: str,
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
) -> dict:
    return _node(
        "constantNode",
        id_,
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
    )


def _inflow(edge_id: str, flow_id: str, stock_id: str) -> dict:
    """Flow → Stock edge (adds to the stock)."""
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


def _outflow(edge_id: str, stock_id: str, flow_id: str) -> dict:
    """Stock → Flow edge (draws from the stock)."""
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


def _fb_edge(
    edge_id: str,
    source: str,
    target: str,
    *,
    op: str = "add",
    fb_type: str = "",
    polarity: str = "",
    persistent: bool = False,
) -> dict:
    """Feedback (info-only) edge — kind=neutral, feedback_loop=True."""
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


def _balancing_loop(
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
    """Return a BalancingFeedbackLoop record as expected by labStore.loadGraphJson."""
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


def _reinforcing_loop(
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
    """Return a ReinforcingFeedbackLoop record as expected by labStore.loadGraphJson."""
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


def _graph(nodes: list[dict], edges: list[dict], feedback_loops: list[dict] | None = None) -> dict:
    return {"nodes": nodes, "edges": edges, "feedbackLoops": feedback_loops or []}


EMPTY_GRAPH: dict = _graph([], [])


# =============================================================================
# Section 1 — The Basics
# =============================================================================

# ---------------------------------------------------------------------------
# Lesson 1: Stocks and Flows
# ---------------------------------------------------------------------------

_STOCKS_FLOWS_CONTENT = """\
## Stocks and Flows: The Foundation of Every System

Donella Meadows opens *Thinking in Systems* with the simplest possible building \
block: a **stock** and a **flow**.

**Stocks** are quantities that accumulate — they can be measured at any snapshot \
in time. Water in a bathtub. Money in a bank account. Trees in a forest. People \
in a population. Whatever can be said to *be* at a given moment is a stock.

**Flows** are rates that change stocks over time. The tap fills the bathtub; the \
drain empties it. Income adds to your balance; expenses reduce it. A stock \
changes only through its flows — this is the fundamental rule.

### The Bathtub Analogy

Imagine a bathtub:
- The **water level** is the stock.
- The **tap** is an inflow — it adds water per unit time.
- The **drain** is an outflow — it removes water per unit time.

If the tap runs faster than the drain, the level rises. If the drain exceeds the \
tap, it falls. When they match exactly, the level holds constant — even though \
water is actively flowing.

### Why Stocks Matter

Stocks provide **inertia** — they resist sudden changes and buffer the system \
against shocks. You cannot instantly empty a bathtub or double a population. \
Stocks take time to change, which creates the characteristic *delays* that make \
systems behave in ways we find surprising.

> **Key insight:** To change a stock quickly, you must change its flows \
significantly. Small flow adjustments cause slow stock changes.

In the first task below, observe how a simple inflow/outflow balance drives the \
water level over time. In the second task, build the same structure yourself for \
a bank account.\
"""

_STOCKS_FLOWS_DEMO = _graph(
    nodes=[
        _stock("stock_1", "Water Tank", 350, 200, quantity=100, unit="liters"),
        _flow("flow_1", "Tap",   80,  200, bottleneck=10, unit="liters/step"),
        _flow("flow_2", "Drain", 620, 200, bottleneck=5,  unit="liters/step"),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",  "stock_1"),
        _outflow("edge_2", "stock_1", "flow_2"),
    ],
)

_STOCKS_FLOWS_CHALLENGE = EMPTY_GRAPH

LESSON_STOCKS_FLOWS = {
    "title": "Stocks and Flows",
    "order_index": 0,
    "content_markdown": _STOCKS_FLOWS_CONTENT,
    "tasks": [
        {
            "title": "Observe: Water Tank",
            "description": (
                "A water tank receives 10 liters per step from a tap and loses 5 liters "
                "per step through a drain. Run the simulation for 50 steps and observe how "
                "the stock level changes over time. Notice that the net inflow of 5 units "
                "per step causes the tank to fill linearly."
            ),
            "graph": _STOCKS_FLOWS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Bank Account",
            "description": (
                "Build a bank account model from scratch. The account starts with 1,000 "
                "units. Add two flows: an income inflow of 50 units/step and an expenses "
                "outflow of 30 units/step. Run the simulation for 50 steps and observe the "
                "balance over time."
            ),
            "graph": _STOCKS_FLOWS_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# ---------------------------------------------------------------------------
# Lesson 2: Balancing Feedback Loops
# ---------------------------------------------------------------------------
#
# Graph layout (thermostat):
#
#   constant_1 "Desired Temperature" (x=380, y=60)   ← goal node
#        |
#   variable_1 "Discrepancy"         (x=380, y=165)  ← discrepancy node
#        |
#   variable_2 "Corrective Action"   (x=80,  y=165)  ← corrective node
#        |
#   flow_1     "Heater"              (x=80,  y=250)  → inflow → stock_1
#   stock_1    "Room Temperature"    (x=380, y=250)
#
# Expressions (match labStore.createBalancingFeedbackLoop output):
#   discrepancy  = "(stock_1 < constant_1 ? (constant_1 - stock_1) : 0)"
#   corrective   = "(max(0, (variable_1))) / (3)"
#   flow         = "max(0, (0) + (variable_2))"

_BALANCING_LOOPS_CONTENT = """\
## Balancing Feedback Loops: Systems That Seek Goals

After stocks and flows, Meadows introduces the first type of feedback: the \
**balancing loop**. These loops are everywhere in natural, social, and \
technical systems.

A balancing loop acts like a **thermostat**: it detects the gap between *where \
a stock is* and *where it should be*, then takes corrective action to close \
that gap.

### The Thermostat Structure

Every balancing loop has four parts:
1. A **stock** — the actual state (e.g. room temperature)
2. A **goal** — the desired state (e.g. 20 °C)
3. A **discrepancy** — the gap between actual and desired
4. A **corrective action** — a flow that responds to the gap

When the stock is below the goal, the discrepancy is positive, which triggers \
an increasing corrective flow. As the stock approaches the goal, the discrepancy \
shrinks, and the corrective action fades. The system naturally **settles at \
the goal**.

### Key Properties

- Balancing loops are **stabilising** — they resist change.
- The adjustment time controls how quickly the gap is closed: a short \
  adjustment time = rapid correction; a long one = sluggish response.
- Push a thermostat-controlled room to a higher temperature and the loop \
  pulls it back.

> **Key insight:** Balancing loops are goal-seeking. Strength of correction \
depends on the size of the gap and the adjustment time.

In the first task, watch a room temperature system find its equilibrium. In \
the second task, build a similar controller for a reservoir.\
"""

_BALANCING_LOOP_DEMO = _graph(
    nodes=[
        _stock("stock_1", "Room Temperature", 380, 250, quantity=10, unit="°C"),
        _flow(
            "flow_1",
            "Heater",
            80,
            250,
            bottleneck=0,
            expression="max(0, (0) + (variable_2))",
            base_flow_expression="0",
            unit="°C/step",
        ),
        _constant(
            "constant_1",
            "Desired Temperature",
            380,
            60,
            quantity=20,
            loop_id="loop_1",
            loop_role="goal",
            fb_type="balancing",
            unit="°C",
        ),
        _variable(
            "variable_1",
            "Discrepancy",
            380,
            165,
            expression="(stock_1 < constant_1 ? (constant_1 - stock_1) : 0)",
            loop_id="loop_1",
            loop_role="discrepancy",
            fb_type="balancing",
        ),
        _variable(
            "variable_2",
            "Corrective Action",
            80,
            165,
            expression="(max(0, (variable_1))) / (3)",
            loop_id="loop_1",
            loop_role="correctiveAction",
            fb_type="balancing",
        ),
    ],
    edges=[
        _inflow("edge_1", "flow_1", "stock_1"),
        _fb_edge("edge_2", "constant_1", "variable_1"),
        _fb_edge("edge_3", "stock_1",    "variable_1"),
        _fb_edge("edge_4", "variable_1", "variable_2"),
        _fb_edge("edge_5", "variable_2", "flow_1", op="add"),
    ],
    feedback_loops=[
        _balancing_loop(
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
        )
    ],
)

_BALANCING_LOOP_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "Reservoir Level", 380, 250, quantity=10, unit="units"),
        _flow("flow_1",   "Water Pump",       80,  250, bottleneck=0, unit="units/step"),
    ],
    edges=[
        _inflow("edge_1", "flow_1", "stock_1"),
    ],
)

LESSON_BALANCING_LOOPS = {
    "title": "Balancing Feedback Loops",
    "order_index": 1,
    "content_markdown": _BALANCING_LOOPS_CONTENT,
    "tasks": [
        {
            "title": "Observe: Thermostat",
            "description": (
                "Room temperature starts at 10 °C. The desired temperature is 20 °C. "
                "A balancing feedback loop detects the gap and activates a heater with "
                "adjustment time = 3 steps. Run the simulation and watch the temperature "
                "converge to the goal."
            ),
            "graph": _BALANCING_LOOP_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Reservoir Controller",
            "description": (
                "A reservoir starts at 10 units. Your goal: maintain a level of 50 units. "
                "Using the stock and flow provided, add a balancing feedback loop targeting "
                "50 units with an adjustment time of your choice. Run the simulation and "
                "confirm the level stabilises at 50."
            ),
            "graph": _BALANCING_LOOP_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# ---------------------------------------------------------------------------
# Lesson 3: Reinforcing Feedback Loops
# ---------------------------------------------------------------------------
#
# Graph layout (compound interest):
#
#   flow_1    "Interest Earned"   (x=80,  y=220) → inflow → stock_1
#   stock_1   "Savings Account"   (x=380, y=220)
#        ↘ (feedback)
#   variable_1 "Growth Multiplier" (x=230, y=90)
#        ↘ (feedback)
#   flow_1  ← (feedback)
#
# Expressions (match labStore.createReinforcingFeedbackLoop output for k=0.1):
#   multiplier = "(0.1) * (stock_1)"
#   flow       = "max(0, (0) + (variable_1))"

_REINFORCING_LOOPS_CONTENT = """\
## Reinforcing Feedback Loops: Engines of Growth and Collapse

The second fundamental loop type is the **reinforcing loop** — the engine of \
exponential growth and exponential collapse.

Where a balancing loop resists change, a reinforcing loop *amplifies* it. \
Whatever is happening, a reinforcing loop makes it happen faster. More leads \
to more; less leads to less.

### Compound Interest

The classic example is compound interest:
- You deposit money (the **stock**).
- The bank pays interest proportional to your balance (the **flow**).
- That interest is added to your balance.
- Now you earn interest on a larger balance.
- Growth accelerates.

The stock's output loops back as its own input — **the stock feeds its own flow**.

### Growth and Collapse

Reinforcing loops work in both directions:
- **Positive polarity** — more stock → larger inflow → more stock (exponential growth)
- **Negative polarity** — less stock → smaller inflow → less stock (collapse spiral)

A declining population generates fewer births, accelerating the decline. A \
failing company loses customers, reducing revenue, leading to more failure.

### Left Unchecked

In real systems reinforcing loops do not grow forever. They are eventually \
limited by a balancing loop or a physical constraint — setting up the \
*S-shaped growth* pattern explored later.

> **Key insight:** The growth rate k and the polarity of the loop determine \
how quickly the exponential process unfolds. Identify the stock that feeds \
its own flow.

In the first task, watch compound interest grow a savings account \
exponentially. In the second task, build a reinforcing loop for a growing \
population.\
"""

_REINFORCING_LOOP_DEMO = _graph(
    nodes=[
        _stock("stock_1", "Savings Account", 380, 220, quantity=100, unit="$"),
        _flow(
            "flow_1",
            "Interest Earned",
            80,
            220,
            bottleneck=0,
            expression="max(0, (0) + (variable_1))",
            base_flow_expression="0",
            unit="$/step",
        ),
        _variable(
            "variable_1",
            "Growth Multiplier",
            230,
            90,
            expression="(0.1) * (stock_1)",
            loop_id="loop_1",
            loop_role="reinforcingMultiplier",
            fb_type="reinforcing",
            persistent=True,
            reinforcing_text_only=True,
        ),
    ],
    edges=[
        _inflow("edge_1", "flow_1",    "stock_1"),
        _fb_edge("edge_2", "stock_1",   "variable_1", fb_type="reinforcing", polarity="positive", persistent=True),
        _fb_edge("edge_3", "variable_1", "flow_1",    fb_type="reinforcing", polarity="positive", persistent=True),
    ],
    feedback_loops=[
        _reinforcing_loop(
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

_REINFORCING_LOOP_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "Population", 380, 220, quantity=50, unit="people"),
        _flow("flow_1",   "Net Growth",  80,  220, bottleneck=0, unit="people/step"),
    ],
    edges=[
        _inflow("edge_1", "flow_1", "stock_1"),
    ],
)

LESSON_REINFORCING_LOOPS = {
    "title": "Reinforcing Feedback Loops",
    "order_index": 2,
    "content_markdown": _REINFORCING_LOOPS_CONTENT,
    "tasks": [
        {
            "title": "Observe: Compound Interest",
            "description": (
                "A savings account starts with 100 units. A reinforcing loop pays 10% "
                "interest per step — the more money in the account, the more interest it "
                "earns. Run the simulation for 40 steps and observe exponential growth."
            ),
            "graph": _REINFORCING_LOOP_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Population Growth",
            "description": (
                "A population starts at 50 people. Build a reinforcing feedback loop "
                "where population drives its own net growth (polarity: positive). "
                "Experiment with different values of k. Run 50 steps and compare the "
                "growth curves."
            ),
            "graph": _REINFORCING_LOOP_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# =============================================================================
# Section 2 — System Dynamics
# =============================================================================

# ---------------------------------------------------------------------------
# Lesson 4: Delays and Oscillation
# ---------------------------------------------------------------------------
#
# Same thermostat layout as Lesson 2 but with delayEnabled=True, delaySteps=5.
#
# Corrective expression with delay (matches labStore.correctiveExpression):
#   "(max(0, (delay(\"variable_1\", 5)))) / (3)"

_DELAYS_CONTENT = """\
## Delays: When Information Arrives Too Late

One of Meadows' most important insights is the role of **delays** — the time \
gaps between cause and effect that make systems behave in surprising and \
often counterproductive ways.

### The Shower Problem

You step into a cold shower and turn up the hot water. Nothing happens. You \
turn it further. Still cold. Then — thirty seconds later — scalding water \
arrives. You turn it down fast. Now it's cold again.

The **delay** between your action and the result caused you to overshoot \
and oscillate. This is precisely what delays do to balancing feedback loops.

### Oscillation in Balancing Loops

A balancing loop with a significant delay will:
1. Detect a gap and take corrective action.
2. The action's effect arrives *after* the loop expected a change.
3. The system overshoots the goal.
4. The loop corrects in the other direction — overshooting again.
5. Result: **oscillation** around the target.

The same dynamic explains supply-chain crises, boom-bust economic cycles, \
and population oscillations.

### Managing Delays

Meadows identifies delays as **leverage points**. Reducing delays — faster \
information, faster delivery — is one of the most effective ways to stabilise \
an oscillating system. Alternatively, *slowing your response* to match the \
delay can prevent overshoot.

> **Key insight:** The longer the delay in a balancing loop, the greater the \
tendency to oscillate. Knowing a delay exists and responding more slowly can \
paradoxically improve stability.

In the first task, watch the same thermostat from Lesson 2 — now with a 5-step \
information delay. Notice how temperature overshoots its target and oscillates. \
In the second task, build a supply chain with a restocking delay.\
"""

_DELAYS_DEMO = _graph(
    nodes=[
        _stock("stock_1", "Room Temperature", 380, 250, quantity=10, unit="°C"),
        _flow(
            "flow_1",
            "Heater",
            80,
            250,
            bottleneck=0,
            expression="max(0, (0) + (variable_2))",
            base_flow_expression="0",
            unit="°C/step",
        ),
        _constant(
            "constant_1",
            "Desired Temperature",
            380,
            60,
            quantity=20,
            loop_id="loop_1",
            loop_role="goal",
            fb_type="balancing",
            unit="°C",
        ),
        _variable(
            "variable_1",
            "Discrepancy",
            380,
            165,
            expression="(stock_1 < constant_1 ? (constant_1 - stock_1) : 0)",
            loop_id="loop_1",
            loop_role="discrepancy",
            fb_type="balancing",
        ),
        _variable(
            "variable_2",
            "Corrective Action",
            80,
            165,
            expression='(max(0, (delay("variable_1", 5)))) / (3)',
            loop_id="loop_1",
            loop_role="correctiveAction",
            fb_type="balancing",
        ),
    ],
    edges=[
        _inflow("edge_1", "flow_1",    "stock_1"),
        _fb_edge("edge_2", "constant_1", "variable_1"),
        _fb_edge("edge_3", "stock_1",    "variable_1"),
        _fb_edge("edge_4", "variable_1", "variable_2"),
        _fb_edge("edge_5", "variable_2", "flow_1", op="add"),
    ],
    feedback_loops=[
        _balancing_loop(
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
            delay_enabled=True,
            delay_steps=5,
        )
    ],
)

# Challenge: a simple inventory with separate restocking and sales flows.
# Students observe that fixed sales eventually drain inventory, and optionally
# add a balancing loop with delay to model a realistic restocking policy.
_DELAYS_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "Inventory",   350, 200, quantity=100, unit="units"),
        _flow("flow_1",   "Restocking",   80,  200, bottleneck=0, unit="units/step"),
        _flow("flow_2",   "Sales",        620, 200, bottleneck=12, unit="units/step"),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",  "stock_1"),
        _outflow("edge_2", "stock_1", "flow_2"),
    ],
)

LESSON_DELAYS = {
    "title": "Delays and Oscillation",
    "order_index": 0,
    "content_markdown": _DELAYS_CONTENT,
    "tasks": [
        {
            "title": "Observe: Thermostat with Delay",
            "description": (
                "The same thermostat from Lesson 2 now has a 5-step information delay "
                "in the corrective action. Run for 80 steps. Notice how the temperature "
                "overshoots 20 °C and then oscillates before (slowly) settling."
            ),
            "graph": _DELAYS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Inventory with Restocking",
            "description": (
                "An inventory starts at 100 units and sells 12 units per step. The "
                "restocking flow starts at 0. Without restocking, the inventory depletes "
                "in ~8 steps. Add a balancing feedback loop to the restocking flow that "
                "targets an inventory of 80 units. Then increase the adjustment time and "
                "observe whether oscillation appears."
            ),
            "graph": _DELAYS_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# ---------------------------------------------------------------------------
# Lesson 5: S-Shaped Growth
# ---------------------------------------------------------------------------
#
# Demo: logistic growth  dN/dt = r·N·(1 − N/K)  with r=0.3, K=100.
# No feedback loop needed — the expression encodes both the reinforcing and
# balancing dynamics in one formula.

_S_SHAPED_GROWTH_CONTENT = """\
## S-Shaped Growth: When Reinforcing Loops Meet Limits

One of the most universal patterns in nature, economics, and technology is \
**S-shaped (logistic) growth** — and Meadows shows that it always arises from \
the same structural interaction: a reinforcing loop that eventually encounters \
a balancing limit.

### The Pattern

Many growing things don't grow forever:
- Populations grow exponentially — until food, space, or disease limits them.
- Companies expand rapidly — until market saturation slows them.
- Technology spreads fast — until everyone who would adopt it already has.

In each case, an initial **reinforcing loop** (more growth → more resources \
for growth) eventually meets a **balancing loop** (as resources diminish, \
growth slows toward a carrying capacity K).

### The Logistic Equation

```
dN/dt = r × N × (1 − N/K)
```
- `r` — intrinsic growth rate
- `N` — current population (the stock)
- `K` — carrying capacity (the limit)
- When N is small: the term (1 − N/K) ≈ 1 → near-exponential growth
- When N → K: the term → 0 → growth stops

The inflection point occurs at N = K/2 — where growth rate is highest.

### What This Means for Intervention

- **Raise K** (increase capacity) — often the instinct, but can be costly.
- **Lower r** (reduce growth rate) — effective but resisted.
- **Act early** — the closer the system is to K, the harder to change.

> **Key insight:** The S-curve is a signature of a reinforcing loop losing \
dominance to a balancing loop as a limit is approached.

In the first task, observe logistic population growth. In the second task, \
model technology adoption with a carrying capacity of your choice.\
"""

_S_SHAPED_GROWTH_DEMO = _graph(
    nodes=[
        _stock("stock_1", "Population", 380, 220, quantity=10, unit="people"),
        _flow(
            "flow_1",
            "Net Growth Rate",
            80,
            220,
            bottleneck=0,
            expression="0.3 * stock_1 * (1 - stock_1 / 100)",
            unit="people/step",
        ),
    ],
    edges=[
        _inflow("edge_1", "flow_1", "stock_1"),
    ],
)

_S_SHAPED_GROWTH_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "Adopters", 380, 220, quantity=5, unit="users"),
        _flow("flow_1",   "New Adopters", 80, 220, bottleneck=0, unit="users/step"),
    ],
    edges=[
        _inflow("edge_1", "flow_1", "stock_1"),
    ],
)

LESSON_S_SHAPED_GROWTH = {
    "title": "S-Shaped Growth",
    "order_index": 1,
    "content_markdown": _S_SHAPED_GROWTH_CONTENT,
    "tasks": [
        {
            "title": "Observe: Logistic Population",
            "description": (
                "A population starts at 10. Its net growth rate follows the logistic "
                "formula: 0.3 × N × (1 − N/100). Run 60 steps and observe the S-curve. "
                "Identify the inflection point (fastest growth) and the plateau (carrying "
                "capacity K = 100)."
            ),
            "graph": _S_SHAPED_GROWTH_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Technology Adoption",
            "description": (
                "A new technology starts with 5 adopters in a market of 500 potential "
                "users (K = 500). Set the net growth expression on the flow so that "
                "adoption follows logistic growth. Choose a growth rate r that produces "
                "an S-curve. Run 80 steps."
            ),
            "graph": _S_SHAPED_GROWTH_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# =============================================================================
# Section 3 — System Archetypes
# =============================================================================

# ---------------------------------------------------------------------------
# Lesson 6: Limits to Growth
# ---------------------------------------------------------------------------
#
# Two coupled stocks: Business Revenue grows while depleting Market Opportunity.
# Both flows share the same rate expression:  0.3 · rev · mkt / 200
# As mkt → 0, the rate → 0 and growth stops.

_LIMITS_TO_GROWTH_CONTENT = """\
## Limits to Growth: The Most Common System Archetype

Meadows dedicates a major portion of *Thinking in Systems* to **system \
archetypes** — recurring structural patterns that produce predictable \
behaviours. The most fundamental is **Limits to Growth**.

### The Archetype

**Structure:**
- A growing stock fuelled by a reinforcing loop
- A **constraining resource** or **limiting condition** that is consumed as \
  the stock grows
- A balancing loop that activates as the limit is approached, slowing growth

**Behaviour over time:**
- Early growth looks exponential — the sky seems to be the limit.
- Then, seemingly suddenly, growth slows.
- Pushing harder on the growth engine (the reinforcing loop) has diminishing \
  returns.

### Why We Misdiagnose It

The natural instinct is to push *harder* on the growth engine — more \
investment, more effort, more advertising. But this fails because **the \
constraint is the problem, not the growth engine**.

The correct leverage point is to **directly address the limiting factor**:
- If market opportunity is limited → create new markets.
- If resources are finite → improve efficiency or find substitutes.
- If infrastructure is the bottleneck → invest in capacity.

### Real-World Examples

- Company growth limited by available talent
- Population growth constrained by food or water
- Urban expansion bounded by environmental capacity

> **Key insight:** Look for the constraint before pushing the accelerator. \
The balancing loop, not the reinforcing loop, needs attention.

In the first task, watch a business grow until market opportunity is exhausted. \
In the second task, build a city-growth model where environmental quality is \
the limiting resource.\
"""

_LIMITS_DEMO = _graph(
    nodes=[
        # Growth expression: 0.3 · rev · max(0, mkt) / 200
        # Both flows consume the same resource at the same rate.
        _stock("stock_rev", "Business Revenue",   500, 200, quantity=5,   unit="million"),
        _stock("stock_mkt", "Market Opportunity",  80,  200, quantity=200, unit="million"),
        _flow(
            "flow_1",
            "Revenue Growth",
            340,
            90,
            bottleneck=0,
            expression="0.3 * stock_rev * max(0, stock_mkt) / 200",
            unit="million/step",
        ),
        _flow(
            "flow_2",
            "Market Consumed",
            340,
            310,
            bottleneck=0,
            expression="0.3 * stock_rev * max(0, stock_mkt) / 200",
            unit="million/step",
        ),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",    "stock_rev"),
        _outflow("edge_2", "stock_mkt", "flow_2"),
    ],
)

_LIMITS_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "City Population",        500, 200, quantity=50,  unit="thousands"),
        _stock("stock_2", "Environmental Quality",   80,  200, quantity=100, unit="index"),
        _flow("flow_1",   "Population Growth",      340,  90, bottleneck=0, unit="thousands/step"),
        _flow("flow_2",   "Environmental Degradation", 340, 310, bottleneck=0, unit="index/step"),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",  "stock_1"),
        _outflow("edge_2", "stock_2", "flow_2"),
    ],
)

LESSON_LIMITS_TO_GROWTH = {
    "title": "Limits to Growth",
    "order_index": 0,
    "content_markdown": _LIMITS_TO_GROWTH_CONTENT,
    "tasks": [
        {
            "title": "Observe: Business Hits Market Ceiling",
            "description": (
                "A business starts with 5 million in revenue. Its growth rate is proportional "
                "to both current revenue and remaining market opportunity (200 million total). "
                "As the market is consumed, growth slows and eventually stops. "
                "Run 60 steps and observe how growth decelerates as the market is exhausted."
            ),
            "graph": _LIMITS_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: City vs Environment",
            "description": (
                "A city starts with 50,000 people. Environmental quality starts at 100. "
                "Set expressions on the two flows so that population growth depletes "
                "environmental quality, and that as quality decreases, growth slows. "
                "Run 80 steps. What happens to both stocks?"
            ),
            "graph": _LIMITS_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# ---------------------------------------------------------------------------
# Lesson 7: Tragedy of the Commons
# ---------------------------------------------------------------------------
#
# Fish population with logistic births and two constant-rate fishing fleets.
# At start: births ≈ 37.5/step, total fishing = 100/step → net = −62.5 → collapse.

_TRAGEDY_COMMONS_CONTENT = """\
## Tragedy of the Commons: When Individual Rationality Destroys Shared Resources

The **Tragedy of the Commons** is one of Meadows' most important archetypes — \
and one of the most relevant to global challenges today.

### The Original Story

In 18th-century England, farmers shared a common grazing field. Each farmer \
rationally added more cattle to maximise personal gain. Each additional cow \
added to the farmer's benefit, while the cost — grass depletion — was shared \
among everyone. The result: every farmer, acting rationally, destroyed the \
shared resource that all depended on.

### The System Structure

The archetype has:
- A **shared stock** (the commons) — fish in an ocean, groundwater, clean air
- Multiple **actors** each drawing from the stock via outflows
- A **natural replenishment mechanism** within the stock (often logistic growth)
- **No feedback loop** connecting each actor's individual extraction rate to \
  the declining collective resource

When the sum of all extraction rates exceeds the replenishment rate, the \
commons collapses — even if each actor is behaving "rationally".

### Why the System Fails

The key structural flaw: there is **no feedback loop** connecting an individual \
actor's extraction to the resource state. Each actor perceives personal gain \
but not collective harm. The commons decays slowly, then rapidly.

### Escaping the Trap

Meadows identifies three escape routes:
1. **Privatise the commons** — give each actor their own portion (creates feedback)
2. **Regulate the commons** — external rules limiting total extraction
3. **Communicate and self-limit** — actors collectively agree to restrain themselves

> **Key insight:** The tragedy isn't caused by greed — it's caused by a missing \
feedback connection between individual action and shared consequence.

In the first task, two fishing fleets share a fish population. Observe how their \
combined extraction exceeds natural replenishment, collapsing the fishery. In the \
second task, build a groundwater commons scenario.\
"""

_TRAGEDY_DEMO = _graph(
    nodes=[
        # Natural births follow logistic growth: 0.2 · N · (1 − N/800)
        # At N=500: births ≈ 37.5/step.  Two fleets extract 50 each = 100/step.
        # Net = −62.5 → fish population collapses.
        _stock("stock_1", "Fish Population", 350, 220, quantity=500, unit="fish"),
        _flow(
            "flow_1",
            "Natural Births",
            80,
            220,
            bottleneck=0,
            expression="0.2 * stock_1 * (1 - stock_1 / 800)",
            unit="fish/step",
        ),
        _flow("flow_2", "Fishing Fleet A", 620, 160, bottleneck=50, unit="fish/step"),
        _flow("flow_3", "Fishing Fleet B", 620, 280, bottleneck=50, unit="fish/step"),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",  "stock_1"),
        _outflow("edge_2", "stock_1", "flow_2"),
        _outflow("edge_3", "stock_1", "flow_3"),
    ],
)

_TRAGEDY_CHALLENGE = _graph(
    nodes=[
        _stock("stock_1", "Groundwater Level", 350, 220, quantity=100, unit="meters"),
        _flow("flow_1",   "Natural Recharge",   80,  220, bottleneck=2, unit="m/step"),
        _flow("flow_2",   "Farm A Pumping",     620, 160, bottleneck=0, unit="m/step"),
        _flow("flow_3",   "Farm B Pumping",     620, 280, bottleneck=0, unit="m/step"),
    ],
    edges=[
        _inflow("edge_1",  "flow_1",  "stock_1"),
        _outflow("edge_2", "stock_1", "flow_2"),
        _outflow("edge_3", "stock_1", "flow_3"),
    ],
)

LESSON_TRAGEDY_OF_COMMONS = {
    "title": "Tragedy of the Commons",
    "order_index": 1,
    "content_markdown": _TRAGEDY_COMMONS_CONTENT,
    "tasks": [
        {
            "title": "Observe: Fishery Collapse",
            "description": (
                "A fish population of 500 reproduces logistically (r=0.2, K=800), "
                "generating ~37 fish per step at equilibrium. Two fishing fleets each "
                "extract 50 fish per step — together taking 100 per step. "
                "Run 20 steps and observe the collapse. Then reduce each fleet to 15 "
                "fish/step and observe what changes."
            ),
            "graph": _TRAGEDY_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Shared Groundwater",
            "description": (
                "A groundwater aquifer starts at 100 meters. Natural recharge is "
                "2 meters/step. Set Farm A and Farm B pumping rates so that together "
                "they exceed recharge — depleting the aquifer. Run 60 steps. "
                "Then find the extraction rate at which the commons is sustainable."
            ),
            "graph": _TRAGEDY_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# ---------------------------------------------------------------------------
# Lesson 8: Escalation
# ---------------------------------------------------------------------------
#
# Two stocks grow proportional to each other's size — a coupled reinforcing loop.
# A_growth = 0.15 · stock_b   (Country A builds up proportional to B's size)
# B_growth = 0.15 · stock_a   (Country B builds up proportional to A's size)
# → coupled exponential escalation.

_ESCALATION_CONTENT = """\
## Escalation: The Arms Race Archetype

The final archetype in this series is **Escalation** — a system structure \
found in arms races, price wars, corporate advertising battles, and \
interpersonal conflicts.

### The Structure

Escalation occurs when two actors each perceive the other's level as a \
threat, and each responds by increasing their own level — which in turn \
triggers the other's increase.

- Stock A (e.g. Country A's military size)
- Stock B (e.g. Country B's military size)
- A's inflow is driven by B's level: *"we must match them"*
- B's inflow is driven by A's level: *"we must match them"*

Each actor's reinforcing loop feeds the other. The result is **coupled \
exponential growth** — both stocks spiral upward together.

### Why It's Hard to Escape

Both actors feel justified and defensive. Neither *starts* the escalation \
intentionally — each is responding rationally to the perceived threat of the \
other. The system structure itself drives the behaviour, regardless of \
individual intentions.

### The Escape

Two paths:
1. **Unilateral de-escalation** — one actor voluntarily reduces their level, \
   removing the threat signal. Risky, but can work.
2. **Negotiated mutual reduction** — both actors agree simultaneously to \
   reduce. Requires communication and trust.

You cannot "win" an escalation without exhausting both sides. The only \
winning move is to change the system structure.

### Real-World Examples

- Cold War nuclear arms race
- Competing companies in advertising or pricing wars
- Tariff escalation between trading nations
- Social media outrage cycles

> **Key insight:** Identify the feedback loop that connects your opponent's \
state to your own action. Breaking that connection — or replacing it with a \
cooperative signal — is the structural fix.

In the first task, two countries continuously build forces in response to \
each other. In the second task, model an advertising war between two companies.\
"""

_ESCALATION_DEMO = _graph(
    nodes=[
        _stock("stock_a", "Country A Forces", 140, 200, quantity=100, unit="units"),
        _stock("stock_b", "Country B Forces", 620, 200, quantity=80,  unit="units"),
        _flow(
            "flow_a",
            "Country A Buildup",
            80,
            360,
            bottleneck=0,
            expression="0.15 * stock_b",
            unit="units/step",
        ),
        _flow(
            "flow_b",
            "Country B Buildup",
            560,
            360,
            bottleneck=0,
            expression="0.15 * stock_a",
            unit="units/step",
        ),
    ],
    edges=[
        _inflow("edge_1", "flow_a", "stock_a"),
        _inflow("edge_2", "flow_b", "stock_b"),
    ],
)

_ESCALATION_CHALLENGE = _graph(
    nodes=[
        _stock("stock_a", "Company A Market Share", 140, 200, quantity=40, unit="%"),
        _stock("stock_b", "Company B Market Share", 620, 200, quantity=30, unit="%"),
        _flow("flow_a",   "Company A Ad Effect",     80,  360, bottleneck=0, unit="pts/step"),
        _flow("flow_b",   "Company B Ad Effect",    560,  360, bottleneck=0, unit="pts/step"),
    ],
    edges=[
        _inflow("edge_1", "flow_a", "stock_a"),
        _inflow("edge_2", "flow_b", "stock_b"),
    ],
)

LESSON_ESCALATION = {
    "title": "Escalation",
    "order_index": 2,
    "content_markdown": _ESCALATION_CONTENT,
    "tasks": [
        {
            "title": "Observe: Arms Race",
            "description": (
                "Country A starts with 100 military units; Country B with 80. "
                "Each country's buildup rate equals 0.15 × the opponent's current size. "
                "Run 40 steps and observe the coupled exponential escalation. "
                "Then change one country's rate to 0 and observe what happens."
            ),
            "graph": _ESCALATION_DEMO,
            "order_index": 0,
        },
        {
            "title": "Build: Advertising War",
            "description": (
                "Company A holds 40% market share; Company B holds 30%. "
                "Each company's advertising spend is proportional to the competitor's "
                "current share. Add flow expressions to model this escalation dynamic. "
                "Run 30 steps. What does de-escalation look like in this model?"
            ),
            "graph": _ESCALATION_CHALLENGE,
            "order_index": 1,
        },
    ],
}


# =============================================================================
# Section specs — assembled from lesson constants above
# =============================================================================

SYSTEMS_THINKING_SECTIONS: list[dict] = [
    {
        "title": "The Basics",
        "color": "#3b82f6",
        "order_index": 0,
        "lessons": [
            LESSON_STOCKS_FLOWS,
            LESSON_BALANCING_LOOPS,
            LESSON_REINFORCING_LOOPS,
        ],
    },
    {
        "title": "System Dynamics",
        "color": "#f97316",
        "order_index": 1,
        "lessons": [
            LESSON_DELAYS,
            LESSON_S_SHAPED_GROWTH,
        ],
    },
    {
        "title": "System Archetypes",
        "color": "#a855f7",
        "order_index": 2,
        "lessons": [
            LESSON_LIMITS_TO_GROWTH,
            LESSON_TRAGEDY_OF_COMMONS,
            LESSON_ESCALATION,
        ],
    },
]


# =============================================================================
# Seeding functions
# =============================================================================

def seed_systems_thinking(db: Session) -> None:
    """Create all systems-thinking sections, lessons, and tasks if they are missing.

    Safe to call on every startup — existing records are never overwritten except
    for template graph_json changes (to allow content updates without wiping data).
    """
    for section_spec in SYSTEMS_THINKING_SECTIONS:
        _ensure_section(db, section_spec)
    db.commit()


def _ensure_section(db: Session, spec: dict) -> None:
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

    for lesson_spec in spec["lessons"]:
        _ensure_lesson(db, section, lesson_spec)


def _ensure_lesson(db: Session, section: Section, spec: dict) -> None:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.section_id == section.id, Lesson.title == spec["title"])
        .first()
    )
    if not lesson:
        lesson = Lesson(
            title=spec["title"],
            content_markdown=spec["content_markdown"],
            section_id=section.id,
            order_index=spec["order_index"],
            is_published=True,
        )
        db.add(lesson)
        db.flush()

    for task_spec in spec["tasks"]:
        _ensure_task(db, lesson, task_spec)


def _ensure_task(db: Session, lesson: Lesson, spec: dict) -> None:
    task = (
        db.query(LessonTask)
        .filter(LessonTask.lesson_id == lesson.id, LessonTask.title == spec["title"])
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
            order_index=spec["order_index"],
        )
        db.add(task)
        db.flush()
    else:
        # Keep template graph in sync with the spec (content updates).
        template = (
            db.query(SystemModel).filter(SystemModel.id == task.system_id).first()
        )
        if template and template.graph_json != spec["graph"]:
            template.graph_json = spec["graph"]
