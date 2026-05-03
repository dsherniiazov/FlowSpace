import type { FormEvent } from "react";

import type { Lesson, LessonTask, Section } from "../../types/api";
import type { SectionKey } from "./types";
import { ControlModal } from "./ControlModalShell";

type LessonDetailModalProps = {
  sectionKey: SectionKey;
  lesson: Lesson;
  lessonTasks: LessonTask[];
  sections: Section[];
  lessonTitle: string;
  lessonContent: string;
  lessonSectionId: number | "";
  updateLessonPending: boolean;
  deleteLessonPending: boolean;
  getSectionTitleByKey: (sectionKey: SectionKey) => string;
  onClose: () => void;
  onBack: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSectionChange: (value: number | "") => void;
  onCreateTask: (lessonId: number) => void;
  onOpenTask: (taskId: number) => void;
  onDeleteLesson: (lessonId: number, sectionKey: SectionKey) => void;
};

export function LessonDetailModal({
  sectionKey,
  lesson,
  lessonTasks,
  sections,
  lessonTitle,
  lessonContent,
  lessonSectionId,
  updateLessonPending,
  deleteLessonPending,
  getSectionTitleByKey,
  onClose,
  onBack,
  onSave,
  onTitleChange,
  onContentChange,
  onSectionChange,
  onCreateTask,
  onOpenTask,
  onDeleteLesson,
}: LessonDetailModalProps): JSX.Element {
  return (
    <ControlModal
      title={lessonTitle || lesson.title}
      subtitle={`Section: ${getSectionTitleByKey(sectionKey)}`}
      onClose={onClose}
      onBack={onBack}
    >
      <form className="space-y-4" onSubmit={onSave}>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Lesson name</span>
          <input className="input" value={lessonTitle} onChange={(event) => onTitleChange(event.target.value)} required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Section</span>
          <select className="input" value={lessonSectionId} onChange={(event) => onSectionChange(event.target.value ? Number(event.target.value) : "")}>
            <option value="">Without section</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{section.title}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Lesson content (Markdown)</span>
          <textarea className="input min-h-[240px]" value={lessonContent} onChange={(event) => onContentChange(event.target.value)} required />
        </label>

        <div className="space-y-2 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Tasks</div>
              <div className="text-sm text-slate-500">Open a task to edit it or create a new one.</div>
            </div>
            <button className="btn-secondary" type="button" onClick={() => onCreateTask(lesson.id)}>Add task</button>
          </div>
          <div className="space-y-2">
            {lessonTasks.length ? (
              lessonTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                  onClick={() => onOpenTask(task.id)}
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
          <button className="btn-secondary" type="button" disabled={deleteLessonPending} onClick={() => onDeleteLesson(lesson.id, sectionKey)}>
            {deleteLessonPending ? "Deleting..." : "Delete lesson"}
          </button>
          <button className="btn-primary" type="submit" disabled={updateLessonPending}>
            {updateLessonPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </ControlModal>
  );
}
