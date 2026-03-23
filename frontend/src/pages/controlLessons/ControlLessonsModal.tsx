import { FormEvent, ReactNode } from "react";
import { Lesson, LessonTask, Section } from "../../types/api";
import { DEFAULT_SECTION_COLORS, ModalState, SectionKey, TasksByLessonMap, UNASSIGNED_SECTION_KEY } from "./types";

type ControlLessonsModalProps = {
  modalState: ModalState | null;
  setModalState: (state: ModalState | null) => void;
  sections: Section[];
  lessonsById: Map<number, Lesson>;
  tasksById: Map<number, LessonTask>;
  tasksByLesson: TasksByLessonMap;

  sectionTitle: string;
  setSectionTitle: (value: string) => void;
  sectionColor: string;
  setSectionColor: (value: string) => void;

  lessonTitle: string;
  setLessonTitle: (value: string) => void;
  lessonContent: string;
  setLessonContent: (value: string) => void;
  lessonSectionId: number | "";
  setLessonSectionId: (value: number | "") => void;

  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDescription: string;
  setTaskDescription: (value: string) => void;

  getSectionLessons: (sectionKey: SectionKey) => Lesson[];
  getSectionTaskCount: (sectionKey: SectionKey) => number;
  getSectionTitleByKey: (sectionKey: SectionKey) => string;
  getSectionColorByKey: (sectionKey: SectionKey) => string;

  openSectionDetail: (sectionKey: SectionKey) => void;
  openSectionEdit: (sectionId: number) => void;
  openLessonCreate: (sectionId: number) => void;
  openLessonDetail: (lessonId: number) => void;
  openTaskCreate: (lessonId: number) => void;
  openTaskDetail: (taskId: number) => void;

  onCreateSection: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSection: (event: FormEvent<HTMLFormElement>) => void;
  onCreateLesson: (event: FormEvent<HTMLFormElement>) => void;
  onSaveLesson: (event: FormEvent<HTMLFormElement>) => void;
  onCreateTask: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTask: (event: FormEvent<HTMLFormElement>) => void;

  onDeleteSection: (sectionId: number) => void;
  onDeleteLesson: (lessonId: number, sectionKey: SectionKey) => void;
  onDeleteTask: (taskId: number, lessonId: number) => void;
  onOpenTaskSystemEditor: (taskId: number) => Promise<void>;

  createSectionPending: boolean;
  updateSectionPending: boolean;
  deleteSectionPending: boolean;
  createLessonPending: boolean;
  updateLessonPending: boolean;
  deleteLessonPending: boolean;
  createTaskPending: boolean;
  updateTaskPending: boolean;
  deleteTaskPending: boolean;
};

export function ControlLessonsModal(props: ControlLessonsModalProps): JSX.Element | null {
  const {
    modalState,
    setModalState,
    sections,
    lessonsById,
    tasksById,
    tasksByLesson,
    sectionTitle,
    setSectionTitle,
    sectionColor,
    setSectionColor,
    lessonTitle,
    setLessonTitle,
    lessonContent,
    setLessonContent,
    lessonSectionId,
    setLessonSectionId,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    getSectionLessons,
    getSectionTaskCount,
    getSectionTitleByKey,
    getSectionColorByKey,
    openSectionDetail,
    openSectionEdit,
    openLessonCreate,
    openLessonDetail,
    openTaskCreate,
    openTaskDetail,
    onCreateSection,
    onSaveSection,
    onCreateLesson,
    onSaveLesson,
    onCreateTask,
    onSaveTask,
    onDeleteSection,
    onDeleteLesson,
    onDeleteTask,
    onOpenTaskSystemEditor,
    createSectionPending,
    updateSectionPending,
    deleteSectionPending,
    createLessonPending,
    updateLessonPending,
    deleteLessonPending,
    createTaskPending,
    updateTaskPending,
    deleteTaskPending,
  } = props;

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
            <button className="btn-primary" type="submit" disabled={createSectionPending}>
              {createSectionPending ? "Saving..." : "Create section"}
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
              <span className="inline-block h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: sectionColorValue }} />
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
                  <button className="btn-secondary" type="button" disabled={deleteSectionPending} onClick={() => onDeleteSection(Number(modalState.sectionKey))}>
                    {deleteSectionPending ? "Deleting..." : "Delete section"}
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
      <ControlModal title="Edit section" onClose={() => setModalState(null)} onBack={() => openSectionDetail(modalState.sectionId)}>
        <form className="space-y-4" onSubmit={onSaveSection}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Section name</span>
            <input className="input" placeholder="Section title" value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} required />
          </label>
          <div className="space-y-2">
            <span className="text-sm font-medium">Color</span>
            <ColorPicker value={sectionColor} onChange={setSectionColor} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button className="btn-secondary" type="button" disabled={deleteSectionPending} onClick={() => onDeleteSection(modalState.sectionId)}>
              {deleteSectionPending ? "Deleting..." : "Delete section"}
            </button>
            <button className="btn-primary" type="submit" disabled={updateSectionPending}>
              {updateSectionPending ? "Saving..." : "Save changes"}
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
            <input className="input" placeholder="Lesson title" value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Lesson content (Markdown)</span>
            <textarea className="input min-h-[240px]" placeholder="Write lesson content in markdown" value={lessonContent} onChange={(event) => setLessonContent(event.target.value)} required />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={() => openSectionDetail(modalState.sectionId)}>
              Back
            </button>
            <button className="btn-primary" type="submit" disabled={createLessonPending}>
              {createLessonPending ? "Saving..." : "Create lesson"}
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
            <select className="input" value={lessonSectionId} onChange={(event) => setLessonSectionId(event.target.value ? Number(event.target.value) : "") }>
              <option value="">Without section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.title}</option>
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
              <button className="btn-secondary" type="button" onClick={() => openTaskCreate(lesson.id)}>Add task</button>
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
            <button className="btn-secondary" type="button" disabled={deleteLessonPending} onClick={() => onDeleteLesson(lesson.id, modalState.sectionKey)}>
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
            <input className="input" placeholder="Task title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Task text</span>
            <textarea className="input min-h-[200px]" placeholder="Describe the task" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} required />
          </label>
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
            Task system is required and will be created automatically for this task after saving.
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={() => openLessonDetail(modalState.lessonId)}>Back</button>
            <button className="btn-primary" type="submit" disabled={createTaskPending}>
              {createTaskPending ? "Saving..." : "Create task"}
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
            <button className="btn-secondary" type="button" onClick={() => void onOpenTaskSystemEditor(task.id)}>Edit task system</button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button className="btn-secondary" type="button" disabled={deleteTaskPending} onClick={() => onDeleteTask(task.id, modalState.lessonId)}>
            {deleteTaskPending ? "Deleting..." : "Delete task"}
          </button>
          <button className="btn-primary" type="submit" disabled={updateTaskPending}>
            {updateTaskPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </ControlModal>
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
