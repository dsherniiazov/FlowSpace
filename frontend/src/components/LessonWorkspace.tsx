import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import { fetchLessons } from "../features/lessons/api";
import { fetchLessonTasks } from "../features/lessonTasks/api";
import { fetchSections } from "../features/sections/api";
import { fetchCompletedTasks } from "../features/taskProgress/api";
import { AppLayoutOutletContext } from "../layouts/AppLayout";
import { Lesson, LessonTask, Section } from "../types/api";
import { CSSProperties } from "react";

type Props = {
  layoutContext: AppLayoutOutletContext;
  initialLessonId?: number | null;
  fullPage?: boolean;
};

const UNASSIGNED_SECTION_ID = -1;

export function LessonWorkspace({ layoutContext, initialLessonId = null, fullPage = false }: Props): JSX.Element {
  const { setLessonHeader } = layoutContext;
  const navigate = useNavigate();
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(initialLessonId);

  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks() });
  const completedTasksQuery = useQuery({ queryKey: ["completed-tasks"], queryFn: fetchCompletedTasks });

  const lessons: Lesson[] = useMemo(
    () =>
      [...(lessonsQuery.data ?? [])].sort(
        (a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER),
      ),
    [lessonsQuery.data],
  );
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
      const sectionId = lesson.section_id ?? UNASSIGNED_SECTION_ID;
      const list = grouped.get(sectionId) ?? [];
      list.push(lesson);
      grouped.set(sectionId, list);
    }
    return grouped;
  }, [lessons]);

  const tasksByLesson = useMemo(() => {
    const grouped = new Map<number, LessonTask[]>();
    for (const task of tasks) {
      const list = grouped.get(task.lesson_id) ?? [];
      list.push(task);
      grouped.set(task.lesson_id, list);
    }
    return grouped;
  }, [tasks]);

  const completedTaskSet = useMemo(
    () => new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)),
    [completedTasksQuery.data],
  );

  const visibleSections = useMemo(
    () => sections.filter((section) => (lessonsBySection.get(section.id) ?? []).length > 0),
    [sections, lessonsBySection],
  );

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0] ?? null;
  const selectedSection = selectedLesson?.section_id
    ? visibleSections.find((section) => section.id === selectedLesson.section_id) ?? null
    : null;

  const lessonCompletedMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const lesson of lessons) {
      const lessonTaskList = tasksByLesson.get(lesson.id) ?? [];
      map.set(
        lesson.id,
        lessonTaskList.length > 0 && lessonTaskList.every((task) => completedTaskSet.has(task.id)),
      );
    }
    return map;
  }, [lessons, tasksByLesson, completedTaskSet]);

  useEffect(() => {
    if (initialLessonId) setSelectedLessonId(initialLessonId);
  }, [initialLessonId]);

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
    const lessonsInSection = lessonsBySection.get(sectionId) ?? [];
    if (selectedLesson.section_id === sectionId) return selectedLesson;
    return lessonsInSection[0] ?? null;
  }

  function renderLessonContent(lesson: Lesson): JSX.Element {
    const lessonTasks = tasksByLesson.get(lesson.id) ?? [];
    return (
      <article className="lesson-white-card-content">
        <h3 className="font-display text-xl font-semibold">{lesson.title}</h3>
        <div className="lesson-markdown-preview prose mt-2 max-w-none prose-p:text-slate-700">
          <ReactMarkdown>{lesson.content_markdown}</ReactMarkdown>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">Tasks</div>
          <div className="lesson-task-inline-row">
            {lessonTasks.map((task) => {
              const done = completedTaskSet.has(task.id);
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
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-bold">{selectedLesson.title}</h2>
            <button className="btn-secondary" onClick={() => navigate("/app/lessons")}>All lessons</button>
          </div>
          {renderLessonContent(selectedLesson)}
        </div>
      ) : (
        <div className="lesson-section-pairs">
          {visibleSections.map((section) => {
            const sectionColor = section.color ?? "#9ca3af";
            const sectionStyle = {
              "--section-color": sectionColor,
            } as CSSProperties;
            return (
            <div key={section.id} className="lesson-section-pair-row">
              <div
                className={`lesson-progress-sidebar lesson-section-card ${selectedSection?.id === section.id ? "active" : ""}`}
                style={sectionStyle}
              >
                <div className="lesson-progress-label">Section</div>
                <div className="lesson-progress-section">{section.title}</div>
                <div className="lesson-progress-list">
                  {(lessonsBySection.get(section.id) ?? []).map((lesson) => {
                    const isCurrent = lesson.id === selectedLesson.id;
                    const completed = lessonCompletedMap.get(lesson.id) ?? false;
                    return (
                      <button
                        key={lesson.id}
                        className={`lesson-progress-item ${isCurrent ? "active" : ""}`}
                        onClick={() => setSelectedLessonId(lesson.id)}
                      >
                        <span className={`lesson-progress-dot ${completed ? "completed" : ""}`} />
                        <span className="lesson-progress-title">{lesson.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="panel p-6">
                {lessonForSection(section.id) ? renderLessonContent(lessonForSection(section.id) as Lesson) : null}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
