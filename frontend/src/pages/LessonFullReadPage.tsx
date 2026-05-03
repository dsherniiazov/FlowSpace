import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import { fetchLessons } from "../features/lessons/api";
import { fetchLessonTasks } from "../features/lessonTasks/api";
import { fetchSections } from "../features/sections/api";
import { fetchCompletedTasks } from "../features/taskProgress/api";
import { AppLayoutOutletContext } from "../layouts/AppLayout";
import { useAuthStore } from "../store/authStore";
import { Lesson, LessonTask, Section } from "../types/api";

function toId(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toSectionKey(sectionId: number | string | null | undefined): number {
  if (sectionId == null) return -1;
  const n = Number(sectionId);
  return Number.isFinite(n) ? n : -1;
}

export function LessonFullReadPage(): JSX.Element {
  const { lessonId: lessonIdParam } = useParams();
  const navigate = useNavigate();
  const { setLessonHeader } = useOutletContext<AppLayoutOutletContext>();
  const userId = useAuthStore((state) => state.userId);

  const targetLessonId = toId(lessonIdParam);

  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks() });
  const completedTasksQuery = useQuery({
    queryKey: ["completed-tasks", userId],
    queryFn: fetchCompletedTasks,
    enabled: !!userId,
  });

  const sectionsById = useMemo(() => {
    const m = new Map<number, Section>();
    for (const s of sectionsQuery.data ?? []) m.set(s.id, s);
    return m;
  }, [sectionsQuery.data]);

  const lessons = useMemo(
    () => [...(lessonsQuery.data ?? [])].sort(
      (a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0),
    ),
    [lessonsQuery.data],
  );

  const lesson: Lesson | undefined = useMemo(() => {
    if (targetLessonId == null) return undefined;
    return lessons.find((l) => Number(l.id) === targetLessonId);
  }, [lessons, targetLessonId]);

  const lessonTasks: LessonTask[] = useMemo(() => {
    if (targetLessonId == null) return [];
    return (tasksQuery.data ?? [])
      .filter((t) => Number(t.lesson_id) === targetLessonId)
      .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
  }, [tasksQuery.data, targetLessonId]);

  const completedSet = useMemo(
    () => new Set((completedTasksQuery.data ?? []).map((c) => Number(c.task_id)).filter((id) => !Number.isNaN(id))),
    [completedTasksQuery.data],
  );

  const sectionTitle = useMemo(() => {
    if (!lesson) return null;
    const sid = toSectionKey(lesson.section_id);
    if (sid < 0) return null;
    return sectionsById.get(sid)?.title ?? null;
  }, [lesson, sectionsById]);

  useEffect(() => {
    if (lesson) {
      const s = sectionTitle ? `${sectionTitle} / ` : "";
      setLessonHeader(`${s}${lesson.title}`);
    } else {
      setLessonHeader(null);
    }
    return () => setLessonHeader(null);
  }, [lesson, sectionTitle, setLessonHeader]);

  if (lessonsQuery.isLoading || tasksQuery.isLoading || sectionsQuery.isLoading) {
    return <div className="p-6 text-slate-500">Loading lesson…</div>;
  }
  if (lessonsQuery.isError || !lesson || targetLessonId == null) {
    return (
      <div className="p-6">
        <p className="text-slate-600">Lesson not found.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-full-read">
      <div className="lesson-full-read-back">
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>
      <div className="lesson-full-read-body">
        <article className="lesson-full-read-main">
          <h1 className="lesson-full-read-title font-display text-2xl font-bold text-slate-900 md:text-3xl">
            {lesson.title}
          </h1>
          <div className="lesson-full-read-markdown prose mt-4 max-w-none prose-p:text-slate-700">
            <ReactMarkdown>{lesson.content_markdown}</ReactMarkdown>
          </div>
        </article>
        <aside className="lesson-full-read-aside" aria-label="Tasks">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tasks</h2>
          {lessonTasks.length ? (
            <ol className="lesson-full-read-tasklist mt-3 space-y-2">
              {lessonTasks.map((task) => {
                const done = completedSet.has(Number(task.id));
                return (
                  <li key={task.id}>
                    <button
                      className="lesson-full-read-tasklink"
                      type="button"
                      onClick={() => navigate(`/app/tasks/${task.id}`)}
                    >
                      <span
                        className={`mr-2 inline-block h-2 w-2 shrink-0 rounded-full ${
                          done ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                        aria-hidden
                      />
                      <span className="text-left font-medium text-slate-800">{task.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No tasks for this lesson.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
