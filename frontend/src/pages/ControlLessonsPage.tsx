import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createLesson, deleteLesson, fetchLessons, updateLesson } from "../features/lessons/api";
import {
  createLessonTask,
  deleteLessonTask,
  fetchLessonTasks,
  updateLessonTask,
} from "../features/lessonTasks/api";
import { createSection, deleteSection, fetchSections, updateSection } from "../features/sections/api";
import { fetchSystem } from "../features/systems/api";
import { Lesson, LessonTask, Section } from "../types/api";

const DEFAULT_SECTION_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const UNASSIGNED_SECTION_KEY = "unassigned";

type SectionKey = number | typeof UNASSIGNED_SECTION_KEY;

type ModalState =
  | { type: "section-create" }
  | { type: "section-detail"; sectionKey: SectionKey }
  | { type: "section-edit"; sectionId: number }
  | { type: "lesson-create"; sectionId: number }
  | { type: "lesson-detail"; sectionKey: SectionKey; lessonId: number }
  | { type: "task-create"; sectionKey: SectionKey; lessonId: number }
  | { type: "task-detail"; sectionKey: SectionKey; lessonId: number; taskId: number };

export function ControlLessonsPage(): JSX.Element {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionColor, setSectionColor] = useState(DEFAULT_SECTION_COLORS[0]);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [lessonSectionId, setLessonSectionId] = useState<number | "">("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks() });

  const createSectionMutation = useMutation({ mutationFn: createSection });
  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, payload }: { sectionId: number; payload: Partial<Section> }) => updateSection(sectionId, payload),
  });
  const deleteSectionMutation = useMutation({ mutationFn: deleteSection });
  const createLessonMutation = useMutation({ mutationFn: createLesson });
  const updateLessonMutation = useMutation({
    mutationFn: ({ lessonId, payload }: { lessonId: number; payload: Partial<Lesson> }) => updateLesson(lessonId, payload),
  });
  const deleteLessonMutation = useMutation({ mutationFn: deleteLesson });
  const createTaskMutation = useMutation({ mutationFn: createLessonTask });
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: Partial<LessonTask> }) => updateLessonTask(taskId, payload),
  });
  const deleteTaskMutation = useMutation({ mutationFn: deleteLessonTask });

  const sections = useMemo(() => [...(sectionsQuery.data ?? [])].sort(sortByOrder), [sectionsQuery.data]);
  const lessons = useMemo(() => [...(lessonsQuery.data ?? [])].sort(sortByOrder), [lessonsQuery.data]);
  const tasks = useMemo(() => [...(tasksQuery.data ?? [])].sort(sortByOrder), [tasksQuery.data]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const lessonsById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const lessonsBySection = useMemo(() => {
    const map = new Map<SectionKey, Lesson[]>();

    for (const lesson of lessons) {
      const key = lesson.section_id ?? UNASSIGNED_SECTION_KEY;
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }

    return map;
  }, [lessons]);

  const tasksByLesson = useMemo(() => {
    const map = new Map<number, LessonTask[]>();

    for (const task of tasks) {
      const list = map.get(task.lesson_id) ?? [];
      list.push(task);
      map.set(task.lesson_id, list);
    }

    return map;
  }, [tasks]);

  const unassignedLessons = lessonsBySection.get(UNASSIGNED_SECTION_KEY) ?? [];
  const isInitialLoading = sectionsQuery.isPending || lessonsQuery.isPending || tasksQuery.isPending;
  const hasInitialError = sectionsQuery.isError || lessonsQuery.isError || tasksQuery.isError;

  function invalidateLessonTree(): void {
    void queryClient.invalidateQueries({ queryKey: ["sections"] });
    void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    void queryClient.invalidateQueries({ queryKey: ["lesson-tasks"] });
  }

  function resetSectionForm(): void {
    setSectionTitle("");
    setSectionColor(DEFAULT_SECTION_COLORS[0]);
  }

  function resetLessonForm(sectionId: number | "" = ""): void {
    setLessonTitle("");
    setLessonContent("");
    setLessonSectionId(sectionId);
  }

  function resetTaskForm(): void {
    setTaskTitle("");
    setTaskDescription("");
  }

  function openSectionCreate(): void {
    resetSectionForm();
    setModalState({ type: "section-create" });
  }

  function openSectionDetail(sectionKey: SectionKey): void {
    setModalState({ type: "section-detail", sectionKey });
  }

  function openSectionEdit(sectionId: number): void {
    const section = sectionsById.get(sectionId);
    if (!section) return;

    setSectionTitle(section.title);
    setSectionColor(section.color ?? DEFAULT_SECTION_COLORS[0]);
    setModalState({ type: "section-edit", sectionId });
  }

  function openLessonCreate(sectionId: number): void {
    resetLessonForm(sectionId);
    setModalState({ type: "lesson-create", sectionId });
  }

  function openLessonDetail(lessonId: number): void {
    const lesson = lessonsById.get(lessonId);
    if (!lesson) return;

    setLessonTitle(lesson.title);
    setLessonContent(lesson.content_markdown);
    setLessonSectionId(lesson.section_id ?? "");
    setModalState({
      type: "lesson-detail",
      sectionKey: lesson.section_id ?? UNASSIGNED_SECTION_KEY,
      lessonId,
    });
  }

  function openTaskCreate(lessonId: number): void {
    const lesson = lessonsById.get(lessonId);
    if (!lesson) return;

    resetTaskForm();
    setModalState({
      type: "task-create",
      sectionKey: lesson.section_id ?? UNASSIGNED_SECTION_KEY,
      lessonId,
    });
  }

  function openTaskDetail(taskId: number): void {
    const task = tasksById.get(taskId);
    if (!task) return;

    const lesson = lessonsById.get(task.lesson_id);
    if (!lesson) return;

    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setModalState({
      type: "task-detail",
      sectionKey: lesson.section_id ?? UNASSIGNED_SECTION_KEY,
      lessonId: lesson.id,
      taskId,
    });
  }

  function getSectionLessons(sectionKey: SectionKey): Lesson[] {
    return lessonsBySection.get(sectionKey) ?? [];
  }

  function getSectionTaskCount(sectionKey: SectionKey): number {
    return getSectionLessons(sectionKey).reduce((count, lesson) => count + (tasksByLesson.get(lesson.id)?.length ?? 0), 0);
  }

  function getSectionTitleByKey(sectionKey: SectionKey): string {
    if (sectionKey === UNASSIGNED_SECTION_KEY) return "Without section";
    return sectionsById.get(sectionKey)?.title ?? "Section";
  }

  function getSectionColorByKey(sectionKey: SectionKey): string {
    if (sectionKey === UNASSIGNED_SECTION_KEY) return "#64748b";
    return sectionsById.get(sectionKey)?.color ?? "#64748b";
  }

  function onCreateSection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const title = sectionTitle.trim();
    if (!title) return;

    createSectionMutation.mutate(
      { title, color: sectionColor },
      {
        onSuccess: () => {
          invalidateLessonTree();
          resetSectionForm();
          setModalState(null);
        },
      },
    );
  }

  function onSaveSection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!modalState || modalState.type !== "section-edit") return;

    const title = sectionTitle.trim();
    if (!title) return;

    updateSectionMutation.mutate(
      {
        sectionId: modalState.sectionId,
        payload: { title, color: sectionColor },
      },
      {
        onSuccess: () => {
          invalidateLessonTree();
          openSectionDetail(modalState.sectionId);
        },
      },
    );
  }

  function onCreateLesson(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!modalState || modalState.type !== "lesson-create") return;

    const title = lessonTitle.trim();
    if (!title || !lessonContent.trim()) return;

    createLessonMutation.mutate(
      {
        title,
        content_markdown: lessonContent,
        section_id: modalState.sectionId,
      },
      {
        onSuccess: () => {
          invalidateLessonTree();
          resetLessonForm(modalState.sectionId);
          openSectionDetail(modalState.sectionId);
        },
      },
    );
  }

  function onSaveLesson(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!modalState || modalState.type !== "lesson-detail") return;

    const title = lessonTitle.trim();
    if (!title || !lessonContent.trim()) return;

    updateLessonMutation.mutate(
      {
        lessonId: modalState.lessonId,
        payload: {
          title,
          content_markdown: lessonContent,
          section_id: lessonSectionId === "" ? null : lessonSectionId,
        },
      },
      {
        onSuccess: (lesson) => {
          invalidateLessonTree();
          setLessonSectionId(lesson.section_id ?? "");
          setModalState({
            type: "lesson-detail",
            sectionKey: lesson.section_id ?? UNASSIGNED_SECTION_KEY,
            lessonId: lesson.id,
          });
        },
      },
    );
  }

  function onCreateTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!modalState || modalState.type !== "task-create") return;

    const title = taskTitle.trim();
    if (!title || !taskDescription.trim()) return;

    createTaskMutation.mutate(
      {
        lesson_id: modalState.lessonId,
        title,
        description: taskDescription,
      },
      {
        onSuccess: (task) => {
          invalidateLessonTree();
          resetTaskForm();
          openTaskDetail(task.id);
        },
      },
    );
  }

  function onSaveTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!modalState || modalState.type !== "task-detail") return;

    const title = taskTitle.trim();
    if (!title || !taskDescription.trim()) return;

    updateTaskMutation.mutate(
      {
        taskId: modalState.taskId,
        payload: {
          title,
          description: taskDescription,
        },
      },
      {
        onSuccess: () => {
          invalidateLessonTree();
        },
      },
    );
  }

  function onDeleteSection(sectionId: number): void {
    if (deleteSectionMutation.isPending) return;
    if (!window.confirm("Delete section? Lessons will become unassigned.")) return;

    deleteSectionMutation.mutate(sectionId, {
      onSuccess: () => {
        invalidateLessonTree();
        setModalState(null);
      },
    });
  }

  function onDeleteLesson(lessonId: number, sectionKey: SectionKey): void {
    if (deleteLessonMutation.isPending) return;
    if (!window.confirm("Delete lesson?")) return;

    deleteLessonMutation.mutate(lessonId, {
      onSuccess: () => {
        invalidateLessonTree();
        openSectionDetail(sectionKey);
      },
    });
  }

  function onDeleteTask(taskId: number, lessonId: number): void {
    if (deleteTaskMutation.isPending) return;
    if (!window.confirm("Delete task?")) return;

    deleteTaskMutation.mutate(taskId, {
      onSuccess: () => {
        invalidateLessonTree();
        openLessonDetail(lessonId);
      },
    });
  }

  async function openTaskSystemEditor(taskId: number): Promise<void> {
    const task = tasksById.get(taskId);
    if (!task) return;
    const system = await fetchSystem(task.system_id);
    navigate("/app/lab", {
      state: {
        systemId: system.id,
        systemTitle: system.title,
        systemGraph: system.graph_json,
      },
    });
  }

  function renderModal(): JSX.Element | null {
    if (!modalState) return null;

    if (modalState.type === "section-create") {
      return (
        <ControlModal title="Add section" onClose={() => setModalState(null)}>
          <form className="space-y-4" onSubmit={onCreateSection}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Section name</span>
              <input
                className="input"
                placeholder="Section title"
                value={sectionTitle}
                onChange={(event) => setSectionTitle(event.target.value)}
                required
              />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium">Color</span>
              <ColorPicker value={sectionColor} onChange={setSectionColor} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button className="btn-secondary" type="button" onClick={() => setModalState(null)}>
                Cancel
              </button>
              <button className="btn-primary" type="submit" disabled={createSectionMutation.isPending}>
                {createSectionMutation.isPending ? "Saving..." : "Create section"}
              </button>
            </div>
          </form>
        </ControlModal>
      );
    }

    if (modalState.type === "section-detail") {
      const sectionTitleValue = getSectionTitleByKey(modalState.sectionKey);
      const sectionColorValue = getSectionColorByKey(modalState.sectionKey);
      const sectionLessons = getSectionLessons(modalState.sectionKey);
      const canEditSection = modalState.sectionKey !== UNASSIGNED_SECTION_KEY;

      return (
        <ControlModal title={sectionTitleValue} onClose={() => setModalState(null)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-5 w-5 rounded-full border border-slate-200"
                  style={{ backgroundColor: sectionColorValue }}
                />
                <div>
                  <div className="text-lg font-semibold">{sectionTitleValue}</div>
                  <div className="text-sm text-slate-500">
                    Lessons: {sectionLessons.length} • Tasks: {getSectionTaskCount(modalState.sectionKey)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEditSection ? (
                  <>
                    <button className="btn-secondary" type="button" onClick={() => openSectionEdit(Number(modalState.sectionKey))}>
                      Edit section
                    </button>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={deleteSectionMutation.isPending}
                      onClick={() => onDeleteSection(Number(modalState.sectionKey))}
                    >
                      {deleteSectionMutation.isPending ? "Deleting..." : "Delete section"}
                    </button>
                  </>
                ) : null}
                {canEditSection ? (
                  <button className="btn-primary" type="button" onClick={() => openLessonCreate(Number(modalState.sectionKey))}>
                    Add lesson
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-500">Lessons</div>
              {sectionLessons.length ? (
                sectionLessons.map((lesson) => {
                  const lessonTasks = tasksByLesson.get(lesson.id) ?? [];

                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                      onClick={() => openLessonDetail(lesson.id)}
                    >
                      <div>
                        <div className="font-medium">{lesson.title}</div>
                        <div className="text-sm text-slate-500">Tasks: {lessonTasks.length}</div>
                      </div>
                      <span className="text-sm text-slate-400">Open</span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  {canEditSection
                    ? "No lessons yet. Use Add lesson to create the first one."
                    : "Lessons from deleted sections appear here until you move or delete them."}
                </div>
              )}
            </div>
          </div>
        </ControlModal>
      );
    }

    if (modalState.type === "section-edit") {
      return (
        <ControlModal
          title="Edit section"
          onClose={() => setModalState(null)}
          onBack={() => openSectionDetail(modalState.sectionId)}
        >
          <form className="space-y-4" onSubmit={onSaveSection}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Section name</span>
              <input
                className="input"
                placeholder="Section title"
                value={sectionTitle}
                onChange={(event) => setSectionTitle(event.target.value)}
                required
              />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium">Color</span>
              <ColorPicker value={sectionColor} onChange={setSectionColor} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                className="btn-secondary"
                type="button"
                disabled={deleteSectionMutation.isPending}
                onClick={() => onDeleteSection(modalState.sectionId)}
              >
                {deleteSectionMutation.isPending ? "Deleting..." : "Delete section"}
              </button>
              <button className="btn-primary" type="submit" disabled={updateSectionMutation.isPending}>
                {updateSectionMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </ControlModal>
      );
    }

    if (modalState.type === "lesson-create") {
      return (
        <ControlModal
          title="Add lesson"
          subtitle={`Section: ${getSectionTitleByKey(modalState.sectionId)}`}
          onClose={() => setModalState(null)}
          onBack={() => openSectionDetail(modalState.sectionId)}
        >
          <form className="space-y-4" onSubmit={onCreateLesson}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Lesson name</span>
              <input
                className="input"
                placeholder="Lesson title"
                value={lessonTitle}
                onChange={(event) => setLessonTitle(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Lesson content (Markdown)</span>
              <textarea
                className="input min-h-[240px]"
                placeholder="Write lesson content in markdown"
                value={lessonContent}
                onChange={(event) => setLessonContent(event.target.value)}
                required
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button className="btn-secondary" type="button" onClick={() => openSectionDetail(modalState.sectionId)}>
                Back
              </button>
              <button className="btn-primary" type="submit" disabled={createLessonMutation.isPending}>
                {createLessonMutation.isPending ? "Saving..." : "Create lesson"}
              </button>
            </div>
          </form>
        </ControlModal>
      );
    }

    if (modalState.type === "lesson-detail") {
      const lesson = lessonsById.get(modalState.lessonId);
      if (!lesson) return null;

      const lessonTasks = tasksByLesson.get(lesson.id) ?? [];

      return (
        <ControlModal
          title={lessonTitle || lesson.title}
          subtitle={`Section: ${getSectionTitleByKey(modalState.sectionKey)}`}
          onClose={() => setModalState(null)}
          onBack={() => openSectionDetail(modalState.sectionKey)}
        >
          <form className="space-y-4" onSubmit={onSaveLesson}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Lesson name</span>
              <input className="input" value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Section</span>
              <select
                className="input"
                value={lessonSectionId}
                onChange={(event) => setLessonSectionId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Without section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Lesson content (Markdown)</span>
              <textarea className="input min-h-[240px]" value={lessonContent} onChange={(event) => setLessonContent(event.target.value)} required />
            </label>

            <div className="space-y-2 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Tasks</div>
                  <div className="text-sm text-slate-500">Open a task to edit it or create a new one.</div>
                </div>
                <button className="btn-secondary" type="button" onClick={() => openTaskCreate(lesson.id)}>
                  Add task
                </button>
              </div>
              <div className="space-y-2">
                {lessonTasks.length ? (
                  lessonTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                      onClick={() => openTaskDetail(task.id)}
                    >
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-slate-500 line-clamp-2">{task.description}</div>
                      </div>
                      <span className="text-sm text-slate-400">Open</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No tasks yet. Use Add task to create the first one.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                className="btn-secondary"
                type="button"
                disabled={deleteLessonMutation.isPending}
                onClick={() => onDeleteLesson(lesson.id, modalState.sectionKey)}
              >
                {deleteLessonMutation.isPending ? "Deleting..." : "Delete lesson"}
              </button>
              <button className="btn-primary" type="submit" disabled={updateLessonMutation.isPending}>
                {updateLessonMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </ControlModal>
      );
    }

    if (modalState.type === "task-create") {
      return (
        <ControlModal
          title="Add task"
          subtitle={`Lesson: ${lessonsById.get(modalState.lessonId)?.title ?? "Lesson"}`}
          onClose={() => setModalState(null)}
          onBack={() => openLessonDetail(modalState.lessonId)}
        >
          <form className="space-y-4" onSubmit={onCreateTask}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Task name</span>
              <input
                className="input"
                placeholder="Task title"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Task text</span>
              <textarea
                className="input min-h-[200px]"
                placeholder="Describe the task"
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                required
              />
            </label>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
              Task system is required and will be created automatically for this task after saving.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button className="btn-secondary" type="button" onClick={() => openLessonDetail(modalState.lessonId)}>
                Back
              </button>
              <button className="btn-primary" type="submit" disabled={createTaskMutation.isPending}>
                {createTaskMutation.isPending ? "Saving..." : "Create task"}
              </button>
            </div>
          </form>
        </ControlModal>
      );
    }

    const task = tasksById.get(modalState.taskId);
    if (!task) return null;

    return (
      <ControlModal
        title={taskTitle || task.title}
        subtitle={`Lesson: ${lessonsById.get(modalState.lessonId)?.title ?? "Lesson"}`}
        onClose={() => setModalState(null)}
        onBack={() => openLessonDetail(modalState.lessonId)}
      >
        <form className="space-y-4" onSubmit={onSaveTask}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Task name</span>
            <input className="input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Task text</span>
            <textarea className="input min-h-[200px]" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} required />
          </label>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-medium">Task system</div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Each task has its own dedicated template system.</p>
              <button className="btn-secondary" type="button" onClick={() => void openTaskSystemEditor(task.id)}>
                Edit task system
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              className="btn-secondary"
              type="button"
              disabled={deleteTaskMutation.isPending}
              onClick={() => onDeleteTask(task.id, modalState.lessonId)}
            >
              {deleteTaskMutation.isPending ? "Deleting..." : "Delete task"}
            </button>
            <button className="btn-primary" type="submit" disabled={updateTaskMutation.isPending}>
              {updateTaskMutation.isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </ControlModal>
    );
  }

  if (isInitialLoading) {
    return (
      <section className="panel control-panel p-4">
        <p className="text-sm text-slate-500">Loading sections...</p>
      </section>
    );
  }

  if (hasInitialError) {
    return (
      <section className="panel control-panel p-4">
        <p className="text-sm text-red-600">Failed to load control data.</p>
      </section>
    );
  }

  return (
    <section className="control-content space-y-4">
      <div className="panel control-panel space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="control-section-heading text-lg font-semibold">Sections</h3>
            <p className="control-copy text-sm text-slate-500">Manage sections, lessons and tasks from one place.</p>
          </div>
          <button className="btn-primary" type="button" onClick={openSectionCreate}>
            Add section
          </button>
        </div>

        <div className="space-y-2">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
              onClick={() => openSectionDetail(section.id)}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-slate-200"
                  style={{ backgroundColor: section.color ?? "#64748b" }}
                />
                <div>
                  <div className="font-medium">{section.title}</div>
                  <div className="text-sm text-slate-500">
                    Lessons: {getSectionLessons(section.id).length} • Tasks: {getSectionTaskCount(section.id)}
                  </div>
                </div>
              </div>
              <span className="text-sm text-slate-400">Open</span>
            </button>
          ))}

          {unassignedLessons.length ? (
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-left transition hover:bg-slate-50"
              onClick={() => openSectionDetail(UNASSIGNED_SECTION_KEY)}
            >
              <div className="flex items-center gap-3">
                <span className="inline-block h-4 w-4 rounded-full border border-slate-200 bg-slate-500" />
                <div>
                  <div className="font-medium">Without section</div>
                  <div className="text-sm text-slate-500">
                    Lessons: {unassignedLessons.length} • Tasks: {getSectionTaskCount(UNASSIGNED_SECTION_KEY)}
                  </div>
                </div>
              </div>
              <span className="text-sm text-slate-400">Open</span>
            </button>
          ) : null}

          {!sections.length && !unassignedLessons.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
              No sections yet. Create the first section to start adding lessons.
            </div>
          ) : null}
        </div>
      </div>

      {renderModal()}
    </section>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {DEFAULT_SECTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`h-7 w-7 rounded-full border border-slate-200 ${value === color ? "ring-2 ring-slate-400" : ""}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <input
        className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-transparent p-1"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        title="Pick color"
      />
    </div>
  );
}

function ControlModal({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={onClose}>
      <div
        className="panel control-panel control-modal-panel max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {onBack ? (
                <button className="btn-secondary" type="button" onClick={onBack}>
                  Back
                </button>
              ) : null}
              <h3 className="control-section-heading text-xl font-semibold">{title}</h3>
            </div>
            {subtitle ? <p className="control-copy text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function sortByOrder<T extends { id: number; order_index?: number | null }>(left: T, right: T): number {
  return (left.order_index ?? 0) - (right.order_index ?? 0) || left.id - right.id;
}
