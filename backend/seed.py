"""Seed the database with the mandatory 'Intro' section, lessons, and tasks,
plus all systems-thinking lessons drawn from Donella Meadows' framework."""

from sqlalchemy.orm import Session

from backend.db import SessionLocal
from backend.models.lesson_tasks import LessonTask
from backend.models.lessons import Lesson
from backend.models.sections import Section
from backend.models.systems import SystemModel
from backend.seed_systems_thinking import seed_systems_thinking

INTRO_SECTION_TITLE = "Intro"
INTRO_SECTION_COLOR = "#22c55e"

DEFAULT_TASK_GRAPH = {"nodes": [], "edges": []}

# NOTE: the frontend `loadGraphJson` (see `store/labStore.ts`) reads node fields
# from the top level of each node object — `kind`, `x`, `y`, `label`, `quantity`,
# `bottleneck`, `unit`, etc. — not from a nested `data: {...}` block. If we seed
# in the React Flow shape (`type` + `position` + `data: {...}`), everything
# renders as a default stockNode with quantity 0 / bottleneck 0. So the task
# template below must use the same flat layout as `toGraphJson` produces.
SIMULATION_TEMPLATE_GRAPH = {
    "nodes": [
        {
            "id": "flow_1",
            "kind": "flowNode",
            "x": 250,
            "y": 180,
            "label": "Flow 1",
            # Non-zero defaults so the simulation chart has something obvious to
            # display without the learner having to type values first.
            "initial": 10,
            "quantity": 10,
            "bottleneck": 10,
            "unit": "units",
        },
        {
            "id": "stock_2",
            "kind": "stockNode",
            "x": 560,
            "y": 250,
            "label": "Stock B",
            "initial": 100,
            "quantity": 100,
            "bottleneck": 0,
            "unit": "units",
        },
    ],
    "edges": [
        {
            "id": "edge_2",
            "source": "flow_1",
            "target": "stock_2",
            "kind": "inflow",
            "weight": 1,
        },
    ],
}

INTRO_LESSONS = [
    {
        "title": "Simulation",
        "order_index": 0,
        "content_markdown": (
            "Learn the basics of working with the FlowSpace lab editor. "
            "This lesson walks you through core interactions: moving nodes, "
            "adjusting simulation parameters, running a simulation, and "
            "navigating the timeline."
        ),
        "task_title": "Simulation",
        "task_description": (
            "Complete a guided walkthrough of the lab: move nodes on the canvas, "
            "change Steps and dt values, run a simulation, and scrub the timeline slider."
        ),
        "task_graph": SIMULATION_TEMPLATE_GRAPH,
    },
    {
        "title": "Editor",
        "order_index": 1,
        "content_markdown": (
            "Get familiar with the editor panel and learn how to create, "
            "configure, and connect nodes to build your own system models."
        ),
        "task_title": "Editor",
        "task_description": (
            "Follow the guided steps to explore the editor panel features."
        ),
        "task_graph": DEFAULT_TASK_GRAPH,
    },
    {
        "title": "Workspace",
        "order_index": 2,
        "content_markdown": (
            "Discover workspace features: saving systems, managing your models, "
            "and navigating between lessons and the lab."
        ),
        "task_title": "Workspace",
        "task_description": (
            "Follow the guided steps to explore workspace features."
        ),
        "task_graph": DEFAULT_TASK_GRAPH,
    },
]


def seed_intro(db: Session) -> None:
    """Create the Intro section with all lessons/tasks if missing.
    If already present, ensure all lessons exist and update template graphs."""
    section = db.query(Section).filter(Section.title == INTRO_SECTION_TITLE).first()
    if not section:
        section = Section(
            title=INTRO_SECTION_TITLE,
            color=INTRO_SECTION_COLOR,
            order_index=-1,
            is_published=True,
        )
        db.add(section)
        db.flush()

    for spec in INTRO_LESSONS:
        _ensure_lesson(db, section, spec)

    db.commit()


def _ensure_lesson(db: Session, section: Section, spec: dict) -> None:
    """Create a lesson + task if missing, or update the template graph if present."""
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

    task = (
        db.query(LessonTask)
        .filter(LessonTask.lesson_id == lesson.id, LessonTask.title == spec["task_title"])
        .first()
    )
    if not task:
        template = SystemModel(
            owner_id=None,
            lesson_id=lesson.id,
            title=spec["task_title"],
            graph_json=spec["task_graph"],
            is_public=False,
            is_template=True,
        )
        db.add(template)
        db.flush()

        task = LessonTask(
            lesson_id=lesson.id,
            title=spec["task_title"],
            description=spec["task_description"],
            system_id=template.id,
            order_index=spec["order_index"],
        )
        db.add(task)
        db.flush()
    else:
        # For intro tutorials we always keep the template + existing user copies
        # in sync with the seed values so the learner never sees stale defaults
        # (e.g. older 0/0 stock/flow values). Tutorial tasks are designed to be
        # restarted anyway, so overwriting per-user edits here is acceptable.
        template = db.query(SystemModel).filter(SystemModel.id == task.system_id).first()
        if template:
            if template.graph_json != spec["task_graph"]:
                template.graph_json = spec["task_graph"]
            user_copies = (
                db.query(SystemModel)
                .filter(SystemModel.source_system_id == template.id)
                .all()
            )
            for copy in user_copies:
                if copy.graph_json != spec["task_graph"]:
                    copy.graph_json = spec["task_graph"]


def run_seed() -> None:
    db = SessionLocal()
    try:
        seed_intro(db)
        seed_systems_thinking(db)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
