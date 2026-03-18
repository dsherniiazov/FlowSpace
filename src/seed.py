"""Seed the database with the mandatory 'Intro' section, lessons, and tasks."""

from sqlalchemy.orm import Session

from src.db import SessionLocal
from src.models.sections import Section
from src.models.lessons import Lesson
from src.models.lesson_tasks import LessonTask
from src.models.systems import SystemModel

INTRO_SECTION_TITLE = "Intro"
INTRO_SECTION_COLOR = "#22c55e"

DEFAULT_TASK_GRAPH = {"nodes": [], "edges": []}

SIMULATION_TEMPLATE_GRAPH = {
    "nodes": [
        {
            "id": "flow_1",
            "type": "flowNode",
            "position": {"x": 250, "y": 180},
            "data": {"label": "Flow 1", "bottleneck": 10, "unit": ""},
        },
        {
            "id": "stock_2",
            "type": "stockNode",
            "position": {"x": 560, "y": 250},
            "data": {"label": "Stock B", "quantity": 50, "unit": ""},
        },
    ],
    "edges": [
        {
            "id": "edge_2",
            "source": "flow_1",
            "target": "stock_2",
            "label": "+",
            "data": {"kind": "inflow", "weight": 1},
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
        # Update template graph if changed
        template = db.query(SystemModel).filter(SystemModel.id == task.system_id).first()
        if template and template.graph_json != spec["task_graph"]:
            template.graph_json = spec["task_graph"]


def run_seed() -> None:
    db = SessionLocal()
    try:
        seed_intro(db)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
