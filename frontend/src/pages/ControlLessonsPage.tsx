import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLesson, deleteLesson, fetchLessons, updateLesson } from "../features/lessons/api";
import {
  createLessonTask,
  fetchLessonTasks,
  updateLessonTask,
} from "../features/lessonTasks/api";
import { createSection, deleteSection, fetchSections, updateSection } from "../features/sections/api";
import { fetchSystems } from "../features/systems/api";
import { LessonTask, Section } from "../types/api";

const DEFAULT_SECTION_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

type EditableTask = {
  id: number;
  title: string;
  description: string;
  system_id: number | null;
};

export function ControlLessonsPage(): JSX.Element {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<number | "">("");
  const [sectionColor, setSectionColor] = useState(DEFAULT_SECTION_COLORS[0]);
  const [taskLessonId, setTaskLessonId] = useState<number | "">("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskSystemId, setTaskSystemId] = useState<number | "">("");
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editLessonTitle, setEditLessonTitle] = useState("");
  const [editLessonContent, setEditLessonContent] = useState("");
  const [editLessonSectionId, setEditLessonSectionId] = useState<number | "">("");
  const [editableTasks, setEditableTasks] = useState<EditableTask[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");
  const [editSectionColor, setEditSectionColor] = useState(DEFAULT_SECTION_COLORS[0]);

  const queryClient = useQueryClient();
  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const systemsQuery = useQuery({ queryKey: ["systems"], queryFn: fetchSystems });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks() });

  const tasksByLesson = useMemo(() => {
    const map = new Map<number, LessonTask[]>();
    for (const task of tasksQuery.data ?? []) {
      const list = map.get(task.lesson_id) ?? [];
      list.push(task);
      map.set(task.lesson_id, list);
    }
    return map;
  }, [tasksQuery.data]);

  const createMutation = useMutation({
    mutationFn: createLesson,
    onSuccess: () => {
      setTitle("");
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLesson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lessons"] }),
  });

  const createSectionMutation = useMutation({
    mutationFn: createSection,
    onSuccess: () => {
      setSectionTitle("");
      queryClient.invalidateQueries({ queryKey: ["sections"] });
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, payload }: { sectionId: number; payload: Partial<Section> }) => updateSection(sectionId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sections"] }),
  });
  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: number) => deleteSection(sectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections"] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      setEditingSectionId(null);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: createLessonTask,
    onSuccess: () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskSystemId("");
      queryClient.invalidateQueries({ queryKey: ["lesson-tasks"] });
    },
  });

  const saveLessonMutation = useMutation({
    mutationFn: async () => {
      if (!editingLessonId || editLessonSectionId === "") return;
      await updateLesson(editingLessonId, {
        title: editLessonTitle,
        content_markdown: editLessonContent,
        section_id: Number(editLessonSectionId),
      });
      await Promise.all(
        editableTasks.map((task) =>
          updateLessonTask(task.id, {
            title: task.title,
            description: task.description,
            system_id: task.system_id,
          }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["lesson-tasks"] });
      setEditingLessonId(null);
    },
  });
  const assignLessonMutation = useMutation({
    mutationFn: ({ lessonId, sectionId }: { lessonId: number; sectionId: number | null }) =>
      updateLesson(lessonId, { section_id: sectionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lessons"] }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (selectedSectionId === "") return;
    createMutation.mutate({
      title,
      content_markdown: content,
      section_id: selectedSectionId,
    });
  }

  function onCreateSection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    createSectionMutation.mutate({ title: sectionTitle, color: sectionColor });
  }

  function onCreateTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (taskLessonId === "") return;
    createTaskMutation.mutate({
      lesson_id: taskLessonId,
      title: taskTitle,
      description: taskDescription,
      system_id: taskSystemId === "" ? null : taskSystemId,
    });
  }

  function startEditLesson(lessonId: number): void {
    const lesson = (lessonsQuery.data ?? []).find((item) => item.id === lessonId);
    if (!lesson) return;
    setEditingLessonId(lessonId);
    setEditLessonTitle(lesson.title);
    setEditLessonContent(lesson.content_markdown);
    setEditLessonSectionId(lesson.section_id ?? "");
    const lessonTasks = tasksByLesson.get(lessonId) ?? [];
    setEditableTasks(
      lessonTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        system_id: task.system_id ?? null,
      })),
    );
  }

  function startEditSection(section: Section): void {
    setEditingSectionId(section.id);
    setEditSectionTitle(section.title);
    setEditSectionColor(section.color ?? DEFAULT_SECTION_COLORS[0]);
  }

  function saveSectionEdit(): void {
    if (!editingSectionId) return;
    updateSectionMutation.mutate({
      sectionId: editingSectionId,
      payload: { title: editSectionTitle, color: editSectionColor },
    });
    setEditingSectionId(null);
  }

  function removeSection(sectionId: number): void {
    if (deleteSectionMutation.isPending) return;
    if (!window.confirm("Delete section? Lessons will become unassigned.")) return;
    deleteSectionMutation.mutate(sectionId);
  }

  return (
    <section className="space-y-4">
      <form className="panel space-y-3 p-4" onSubmit={onCreateSection}>
        <h3 className="text-lg font-semibold">Create section</h3>
        <input className="input" placeholder="Section title" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} required />
        <div className="flex flex-wrap items-center gap-2">
          {DEFAULT_SECTION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`h-6 w-6 rounded-full border ${sectionColor === color ? "ring-2 ring-white" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => setSectionColor(color)}
            />
          ))}
          <input
            className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-transparent p-1"
            type="color"
            value={sectionColor}
            onChange={(e) => setSectionColor(e.target.value)}
            title="Pick color"
          />
        </div>
        <button className="btn-secondary" type="submit">Add section</button>
      </form>

      <div className="panel space-y-2 p-4">
        <h3 className="text-lg font-semibold">Sections</h3>
        {(sectionsQuery.data ?? []).map((section) => (
          <div key={section.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: section.color ?? "#6b7280" }} />
              <span>{section.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" type="button" onClick={() => startEditSection(section)}>
                Edit
              </button>
              <button
                className="btn-secondary"
                type="button"
                disabled={deleteSectionMutation.isPending}
                onClick={() => removeSection(section.id)}
              >
                {deleteSectionMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <form className="panel space-y-3 p-4" onSubmit={onSubmit}>
        <select
          className="input"
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">Select section</option>
          {(sectionsQuery.data ?? []).map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className="input min-h-[140px]" placeholder="Markdown content" value={content} onChange={(e) => setContent(e.target.value)} required />
        <button className="btn-primary" type="submit">Create lesson</button>
      </form>

      <form className="panel space-y-3 p-4" onSubmit={onCreateTask}>
        <h3 className="text-lg font-semibold">Create lesson task</h3>
        <select
          className="input"
          value={taskLessonId}
          onChange={(e) => setTaskLessonId(e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">Select lesson</option>
          {(lessonsQuery.data ?? []).map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
        <textarea className="input min-h-[120px]" placeholder="Task description" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} required />
        <select
          className="input"
          value={taskSystemId}
          onChange={(e) => setTaskSystemId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">No system linked</option>
          {(systemsQuery.data ?? []).map((system) => (
            <option key={system.id} value={system.id}>
              {system.title}
            </option>
          ))}
        </select>
        <button className="btn-secondary" type="submit">Add task</button>
      </form>

      <div className="space-y-2">
        {(lessonsQuery.data ?? []).map((lesson) => (
          <div key={lesson.id} className="panel flex items-center justify-between p-3">
            <span>{lesson.title}</span>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => startEditLesson(lesson.id)}>Edit</button>
              <button className="btn-secondary" onClick={() => deleteMutation.mutate(lesson.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editingLessonId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="panel max-h-[90vh] w-full max-w-4xl space-y-3 overflow-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit lesson</h3>
              <button className="btn-secondary" onClick={() => setEditingLessonId(null)}>Close</button>
            </div>
            <input className="input" value={editLessonTitle} onChange={(e) => setEditLessonTitle(e.target.value)} />
            <textarea className="input min-h-[200px]" value={editLessonContent} onChange={(e) => setEditLessonContent(e.target.value)} />
            <select className="input" value={editLessonSectionId} onChange={(e) => setEditLessonSectionId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select section</option>
              {(sectionsQuery.data ?? []).map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
            <div className="space-y-3">
              <h4 className="text-lg font-semibold">Tasks</h4>
              {editableTasks.map((task) => (
                <div key={task.id} className="rounded-md border border-slate-200 p-3">
                  <input
                    className="input mb-2"
                    value={task.title}
                    onChange={(e) =>
                      setEditableTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, title: e.target.value } : item)))
                    }
                  />
                  <textarea
                    className="input min-h-[90px]"
                    value={task.description}
                    onChange={(e) =>
                      setEditableTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, description: e.target.value } : item)))
                    }
                  />
                  <select
                    className="input mt-2"
                    value={task.system_id ?? ""}
                    onChange={(e) =>
                      setEditableTasks((prev) =>
                        prev.map((item) => (item.id === task.id ? { ...item, system_id: e.target.value ? Number(e.target.value) : null } : item)),
                      )
                    }
                  >
                    <option value="">No system linked</option>
                    {(systemsQuery.data ?? []).map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button className="btn-primary" disabled={saveLessonMutation.isPending} onClick={() => saveLessonMutation.mutate()}>
              {saveLessonMutation.isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}

      {editingSectionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="panel max-h-[90vh] w-full max-w-3xl space-y-3 overflow-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit section</h3>
              <button className="btn-secondary" onClick={() => setEditingSectionId(null)}>Close</button>
            </div>
            <input className="input" value={editSectionTitle} onChange={(e) => setEditSectionTitle(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              {DEFAULT_SECTION_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`h-6 w-6 rounded-full border ${editSectionColor === color ? "ring-2 ring-white" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setEditSectionColor(color)}
                />
              ))}
              <input
                className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-transparent p-1"
                type="color"
                value={editSectionColor}
                onChange={(e) => setEditSectionColor(e.target.value)}
              />
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <h4 className="text-sm font-semibold">Lessons in this section</h4>
              {(lessonsQuery.data ?? [])
                .filter((lesson) => lesson.section_id === editingSectionId)
                .map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2">
                    <span>{lesson.title}</span>
                    <button
                      className="btn-secondary"
                      onClick={() => assignLessonMutation.mutate({ lessonId: lesson.id, sectionId: null })}
                    >
                      Remove from section
                    </button>
                  </div>
                ))}
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <h4 className="text-sm font-semibold">Lessons without section</h4>
              {(lessonsQuery.data ?? [])
                .filter((lesson) => lesson.section_id === null)
                .map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2">
                    <span>{lesson.title}</span>
                    <button
                      className="btn-secondary"
                      onClick={() => assignLessonMutation.mutate({ lessonId: lesson.id, sectionId: editingSectionId })}
                    >
                      Add to section
                    </button>
                  </div>
                ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button className="btn-primary" onClick={saveSectionEdit}>Save section</button>
              <button
                className="btn-secondary"
                type="button"
                disabled={deleteSectionMutation.isPending}
                onClick={() => removeSection(editingSectionId)}
              >
                {deleteSectionMutation.isPending ? "Deleting..." : "Delete section"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
