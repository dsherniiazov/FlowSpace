import { FormEvent, useMemo, useState } from "react";
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
import { ControlLessonsModal } from "./controlLessons/ControlLessonsModal";
import { DEFAULT_SECTION_COLORS, ModalState, SectionKey, UNASSIGNED_SECTION_KEY } from "./controlLessons/types";
import { sortByOrder } from "./controlLessons/utils";

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

      <ControlLessonsModal
        modalState={modalState}
        setModalState={setModalState}
        sections={sections}
        lessonsById={lessonsById}
        tasksById={tasksById}
        tasksByLesson={tasksByLesson}
        sectionTitle={sectionTitle}
        setSectionTitle={setSectionTitle}
        sectionColor={sectionColor}
        setSectionColor={setSectionColor}
        lessonTitle={lessonTitle}
        setLessonTitle={setLessonTitle}
        lessonContent={lessonContent}
        setLessonContent={setLessonContent}
        lessonSectionId={lessonSectionId}
        setLessonSectionId={setLessonSectionId}
        taskTitle={taskTitle}
        setTaskTitle={setTaskTitle}
        taskDescription={taskDescription}
        setTaskDescription={setTaskDescription}
        getSectionLessons={getSectionLessons}
        getSectionTaskCount={getSectionTaskCount}
        getSectionTitleByKey={getSectionTitleByKey}
        getSectionColorByKey={getSectionColorByKey}
        openSectionDetail={openSectionDetail}
        openSectionEdit={openSectionEdit}
        openLessonCreate={openLessonCreate}
        openLessonDetail={openLessonDetail}
        openTaskCreate={openTaskCreate}
        openTaskDetail={openTaskDetail}
        onCreateSection={onCreateSection}
        onSaveSection={onSaveSection}
        onCreateLesson={onCreateLesson}
        onSaveLesson={onSaveLesson}
        onCreateTask={onCreateTask}
        onSaveTask={onSaveTask}
        onDeleteSection={onDeleteSection}
        onDeleteLesson={onDeleteLesson}
        onDeleteTask={onDeleteTask}
        onOpenTaskSystemEditor={openTaskSystemEditor}
        createSectionPending={createSectionMutation.isPending}
        updateSectionPending={updateSectionMutation.isPending}
        deleteSectionPending={deleteSectionMutation.isPending}
        createLessonPending={createLessonMutation.isPending}
        updateLessonPending={updateLessonMutation.isPending}
        deleteLessonPending={deleteLessonMutation.isPending}
        createTaskPending={createTaskMutation.isPending}
        updateTaskPending={updateTaskMutation.isPending}
        deleteTaskPending={deleteTaskMutation.isPending}
      />
    </section>
  );
}
