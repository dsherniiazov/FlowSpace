import { FormEvent } from "react";
import { Lesson, LessonTask, Section } from "../../types/api";
import { ModalState, SectionKey, TasksByLessonMap } from "./types";
import { ColorPicker, ControlModal } from "./ControlModalShell";
import { LessonDetailModal } from "./LessonDetailModal";
import { SectionDetailModal } from "./SectionDetailModal";

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
    return (
      <SectionDetailModal
        sectionKey={modalState.sectionKey}
        title={sectionTitleValue}
        color={sectionColorValue}
        lessons={sectionLessons}
        tasksByLesson={tasksByLesson}
        deleteSectionPending={deleteSectionPending}
        getSectionTaskCount={getSectionTaskCount}
        onClose={() => setModalState(null)}
        onEditSection={openSectionEdit}
        onCreateLesson={openLessonCreate}
        onOpenLesson={openLessonDetail}
        onDeleteSection={onDeleteSection}
      />
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
      <LessonDetailModal
        sectionKey={modalState.sectionKey}
        lesson={lesson}
        lessonTasks={lessonTasks}
        sections={sections}
        lessonTitle={lessonTitle}
        lessonContent={lessonContent}
        lessonSectionId={lessonSectionId}
        updateLessonPending={updateLessonPending}
        deleteLessonPending={deleteLessonPending}
        getSectionTitleByKey={getSectionTitleByKey}
        onClose={() => setModalState(null)}
        onBack={() => openSectionDetail(modalState.sectionKey)}
        onSave={onSaveLesson}
        onTitleChange={setLessonTitle}
        onContentChange={setLessonContent}
        onSectionChange={setLessonSectionId}
        onCreateTask={openTaskCreate}
        onOpenTask={openTaskDetail}
        onDeleteLesson={onDeleteLesson}
      />
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
