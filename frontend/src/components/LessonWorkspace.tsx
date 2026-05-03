import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import { fetchLessons } from "../features/lessons/api";
import { fetchLessonTasks } from "../features/lessonTasks/api";
import { fetchSections } from "../features/sections/api";
import { fetchCompletedTasks } from "../features/taskProgress/api";
import { AppLayoutOutletContext } from "../layouts/AppLayout";
import { useAuthStore } from "../store/authStore";
import { Lesson, LessonTask, Section } from "../types/api";

type Props = {
  layoutContext: AppLayoutOutletContext;
  initialLessonId?: number | null;
  fullPage?: boolean;
};

const UNASSIGNED_SECTION_ID = -1;
const UNASSIGNED_SECTION_STUB: Section = { id: UNASSIGNED_SECTION_ID, title: "Without section", color: "#64748b" };

function toSectionKey(sectionId: number | string | null | undefined): number {
  if (sectionId == null) return UNASSIGNED_SECTION_ID;
  const n = Number(sectionId);
  return Number.isFinite(n) ? n : UNASSIGNED_SECTION_ID;
}

function toEntityId(id: number | string | null | undefined): number {
  if (id == null) return NaN;
  const n = Number(id);
  return Number.isFinite(n) ? n : NaN;
}

export function LessonWorkspace({ layoutContext, initialLessonId = null, fullPage = false }: Props): JSX.Element {
  const { setLessonHeader } = layoutContext;
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.userId);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(initialLessonId);
  const [textFullscreenLessonId, setTextFullscreenLessonId] = useState<number | null>(null);

  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks() });
  const completedTasksQuery = useQuery({
    queryKey: ["completed-tasks", userId],
    queryFn: fetchCompletedTasks,
    enabled: !!userId,
  });

  const sectionOrderById = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sectionsQuery.data ?? []) {
      m.set(toSectionKey(s.id), Number(s.order_index ?? 0));
    }
    m.set(UNASSIGNED_SECTION_ID, 1_000_000);
    return m;
  }, [sectionsQuery.data]);

  const lessons: Lesson[] = useMemo(() => {
    const raw = [...(lessonsQuery.data ?? [])];
    return raw.sort((a, b) => {
      const sidA = toSectionKey(a.section_id);
      const sidB = toSectionKey(b.section_id);
      const oa = sectionOrderById.get(sidA) ?? 500_000;
      const ob = sectionOrderById.get(sidB) ?? 500_000;
      if (oa !== ob) return oa - ob;
      const la = Number(a.order_index ?? Number.MAX_SAFE_INTEGER);
      const lb = Number(b.order_index ?? Number.MAX_SAFE_INTEGER);
      if (la !== lb) return la - lb;
      return a.id - b.id;
    });
  }, [lessonsQuery.data, sectionOrderById]);
  const sections: Section[] = useMemo(
    () =>
      [...(sectionsQuery.data ?? [])].sort(
        (a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER),
      ),
    [sectionsQuery.data],
  );
  const tasks: LessonTask[] = useMemo(
    () =>
      [...(tasksQuery.data ?? [])].sort(
        (a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER),
      ),
    [tasksQuery.data],
  );

  const lessonsBySection = useMemo(() => {
    const grouped = new Map<number, Lesson[]>();
    for (const lesson of lessons) {
      const sectionId = toSectionKey(lesson.section_id);
      const list = grouped.get(sectionId) ?? [];
      list.push(lesson);
      grouped.set(sectionId, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => {
        const la = Number(a.order_index ?? Number.MAX_SAFE_INTEGER);
        const lb = Number(b.order_index ?? Number.MAX_SAFE_INTEGER);
        if (la !== lb) return la - lb;
        return a.id - b.id;
      });
    }
    return grouped;
  }, [lessons]);

  const tasksByLesson = useMemo(() => {
    const grouped = new Map<number, LessonTask[]>();
    for (const task of tasks) {
      const lid = toEntityId(task.lesson_id);
      if (Number.isNaN(lid)) continue;
      const list = grouped.get(lid) ?? [];
      list.push(task);
      grouped.set(lid, list);
    }
    return grouped;
  }, [tasks]);

  const completedTaskSet = useMemo(
    () =>
      new Set(
        (completedTasksQuery.data ?? [])
          .map((item) => toEntityId(item.task_id))
          .filter((id) => !Number.isNaN(id)),
      ),
    [completedTasksQuery.data],
  );

  const visibleSections = useMemo(() => {
    const withSection = sections.filter(
      (section) => (lessonsBySection.get(toSectionKey(section.id)) ?? []).length > 0,
    );
    const hasUnassigned = (lessonsBySection.get(UNASSIGNED_SECTION_ID) ?? []).length > 0;
    return hasUnassigned ? [...withSection, UNASSIGNED_SECTION_STUB] : withSection;
  }, [sections, lessonsBySection]);

  const selectedLesson = lessons.find((lesson) => toEntityId(lesson.id) === toEntityId(selectedLessonId)) ?? lessons[0] ?? null;
  const selectedSection = selectedLesson
    ? visibleSections.find(
        (section) => toSectionKey(section.id) === toSectionKey(selectedLesson.section_id),
      ) ?? null
    : null;

  const lessonCompletedMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const lesson of lessons) {
      const lid = toEntityId(lesson.id);
      if (Number.isNaN(lid)) continue;
      const lessonTaskList = tasksByLesson.get(lid) ?? [];
      map.set(
        lid,
        lessonTaskList.length > 0 && lessonTaskList.every((task) => completedTaskSet.has(toEntityId(task.id))),
      );
    }
    return map;
  }, [lessons, tasksByLesson, completedTaskSet]);

  useEffect(() => {
    if (initialLessonId) setSelectedLessonId(initialLessonId);
  }, [initialLessonId]);

  useEffect(() => {
    if (textFullscreenLessonId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTextFullscreenLessonId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [textFullscreenLessonId]);

  useEffect(() => {
    if (selectedLesson && selectedSection) {
      setLessonHeader(`${selectedSection.title}/${selectedLesson.title}`);
    } else {
      setLessonHeader(null);
    }
    return () => setLessonHeader(null);
  }, [selectedLesson, selectedSection, setLessonHeader]);

  if (lessonsQuery.isLoading || sectionsQuery.isLoading || tasksQuery.isLoading) return <div>Loading lessons...</div>;
  if (lessonsQuery.isError || sectionsQuery.isError || tasksQuery.isError) return <div className="text-red-300">Unable to fetch lessons data.</div>;
  if (!selectedLesson) return <div className="text-slate-500">No lessons yet.</div>;

  function lessonForSection(sectionId: number): Lesson | null {
    const key = toSectionKey(sectionId);
    const lessonsInSection = lessonsBySection.get(key) ?? [];
    if (toSectionKey(selectedLesson.section_id) === key) return selectedLesson;
    return lessonsInSection[0] ?? null;
  }

  const fullscreenLesson = textFullscreenLessonId
    ? lessons.find((l) => toEntityId(l.id) === textFullscreenLessonId) ?? null
    : null;

  function renderLessonContent(lesson: Lesson, hideArticleActions = false): JSX.Element {
    const lid = toEntityId(lesson.id);
    const lessonTasks = tasksByLesson.get(lid) ?? [];
    return (
      <article className="lesson-white-card-content">
        {hideArticleActions ? (
          <h3 className="font-display text-xl font-semibold">{lesson.title}</h3>
        ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <h3 className="font-display text-xl font-semibold">{lesson.title}</h3>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary text-sm"
              type="button"
              onClick={() => {
                if (!Number.isNaN(lid)) navigate(`/app/lessons/${lid}/read`);
              }}
            >
              Open full lesson
            </button>
            <button
              className="btn-secondary text-sm"
              type="button"
              onClick={() => {
                if (!Number.isNaN(lid)) setTextFullscreenLessonId(lid);
              }}
            >
              Full screen text
            </button>
          </div>
        </div>
        )}
        <div className="lesson-markdown-preview prose mt-2 max-w-none prose-p:text-slate-700">
          <ReactMarkdown>{lesson.content_markdown}</ReactMarkdown>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">Lab models</div>
          <div className="lesson-task-inline-row">
            {lessonTasks.map((task) => {
              const tid = toEntityId(task.id);
              const done = !Number.isNaN(tid) && completedTaskSet.has(tid);
              return (
                <button
                  key={task.id}
                  className={`lesson-task-pill ${done ? "done" : "pending"}`}
                  onClick={() => navigate(`/app/tasks/${task.id}`)}
                  title={task.title}
                >
                  {task.title}
                </button>
              );
            })}
            {lessonTasks.length === 0 ? <span className="text-sm text-slate-500">No tasks</span> : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className={`lesson-study-layout ${fullPage ? "is-full-lesson" : ""}`}>
      {fullPage ? (
        <div className="panel p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-2xl font-bold">{selectedLesson.title}</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
                Back
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  const id = toEntityId(selectedLesson.id);
                  if (!Number.isNaN(id)) navigate(`/app/lessons/${id}/read`);
                }}
              >
                Open full lesson
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  const id = toEntityId(selectedLesson.id);
                  if (!Number.isNaN(id)) setTextFullscreenLessonId(id);
                }}
              >
                Full screen text
              </button>
            </div>
          </div>
          {renderLessonContent(selectedLesson, true)}
        </div>
      ) : (
        <div className="lesson-section-pairs">
          {visibleSections.map((section) => {
            const sectionKey = toSectionKey(section.id);
            const sectionColor = section.color ?? "#9ca3af";
            const sectionStyle = {
              "--section-color": sectionColor,
            } as CSSProperties;
            return (
            <div key={sectionKey} className="lesson-section-pair-row">
              <div
                className={`lesson-progress-sidebar lesson-section-card ${
                  selectedSection && toSectionKey(selectedSection.id) === sectionKey ? "active" : ""
                }`}
                style={sectionStyle}
              >
                <div className="lesson-progress-label">Section</div>
                <div className="lesson-progress-section-row">
                  <div className="lesson-progress-section-name">{section.title}</div>
                </div>
                <div className="lesson-progress-list">
                  {(lessonsBySection.get(sectionKey) ?? []).map((lesson) => {
                    const isCurrent = toEntityId(lesson.id) === toEntityId(selectedLesson.id);
                    const completed = lessonCompletedMap.get(toEntityId(lesson.id)) ?? false;
                    const lessonId = toEntityId(lesson.id);
                    return (
                      <div key={lesson.id} className={`lesson-progress-row ${isCurrent ? "active" : ""}`}>
                        <button
                          className={`lesson-progress-item ${isCurrent ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            if (!Number.isNaN(lessonId)) setSelectedLessonId(lessonId);
                          }}
                        >
                          <span className={`lesson-progress-dot ${completed ? "completed" : ""}`} />
                          <span className="lesson-progress-title">{lesson.title}</span>
                        </button>
                        <button
                          className="lesson-progress-open-read"
                          type="button"
                          onClick={() => {
                            if (!Number.isNaN(lessonId)) navigate(`/app/lessons/${lessonId}/read`);
                          }}
                        >
                          Full lesson
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="panel p-6">
                {lessonForSection(sectionKey) ? renderLessonContent(lessonForSection(sectionKey) as Lesson) : null}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {fullscreenLesson ? (
        <div
          className="lesson-text-fs-overlay"
          role="dialog"
          aria-label="Lesson text, full screen"
          onClick={() => setTextFullscreenLessonId(null)}
        >
          <div
            className="lesson-text-fs-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lesson-text-fs-toolbar">
              <span className="font-display text-lg font-semibold text-slate-800">{fullscreenLesson.title}</span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    const x = toEntityId(fullscreenLesson.id);
                    if (!Number.isNaN(x)) navigate(`/app/lessons/${x}/read`);
                  }}
                >
                  Open full lesson page
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => setTextFullscreenLessonId(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="lesson-text-fs-prose prose max-w-none overflow-y-auto prose-p:text-slate-700">
              <ReactMarkdown>{fullscreenLesson.content_markdown}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
