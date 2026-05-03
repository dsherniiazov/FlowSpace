import { useNavigate } from "react-router-dom";

import type { Lesson } from "../../types/api";
import type { SectionKey, TasksByLessonMap } from "./types";
import { UNASSIGNED_SECTION_KEY } from "./types";
import { ControlModal } from "./ControlModalShell";

type SectionDetailModalProps = {
  sectionKey: SectionKey;
  title: string;
  color: string;
  lessons: Lesson[];
  tasksByLesson: TasksByLessonMap;
  deleteSectionPending: boolean;
  getSectionTaskCount: (sectionKey: SectionKey) => number;
  onClose: () => void;
  onEditSection: (sectionId: number) => void;
  onCreateLesson: (sectionId: number) => void;
  onOpenLesson: (lessonId: number) => void;
  onDeleteSection: (sectionId: number) => void;
};

export function SectionDetailModal({
  sectionKey,
  title,
  color,
  lessons,
  tasksByLesson,
  deleteSectionPending,
  getSectionTaskCount,
  onClose,
  onEditSection,
  onCreateLesson,
  onOpenLesson,
  onDeleteSection,
}: SectionDetailModalProps): JSX.Element {
  const navigate = useNavigate();
  const canEditSection = sectionKey !== UNASSIGNED_SECTION_KEY;

  return (
    <ControlModal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
            <div>
              <div className="text-lg font-semibold">{title}</div>
              <div className="text-sm text-slate-500">
                Lessons: {lessons.length} - Tasks: {getSectionTaskCount(sectionKey)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditSection ? (
              <>
                <button className="btn-secondary" type="button" onClick={() => onEditSection(Number(sectionKey))}>
                  Edit section
                </button>
                <button className="btn-secondary" type="button" disabled={deleteSectionPending} onClick={() => onDeleteSection(Number(sectionKey))}>
                  {deleteSectionPending ? "Deleting..." : "Delete section"}
                </button>
                <button className="btn-primary" type="button" onClick={() => onCreateLesson(Number(sectionKey))}>
                  Add lesson
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-500">Lessons</div>
          {lessons.length ? (
            lessons.map((lesson) => {
              const lessonTasks = tasksByLesson.get(lesson.id) ?? [];
              return (
                <div key={lesson.id} className="flex w-full items-stretch gap-2 rounded-xl border border-slate-200 px-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                    onClick={() => onOpenLesson(lesson.id)}
                  >
                    <div className="font-medium">{lesson.title}</div>
                    <div className="text-sm text-slate-500">Tasks: {lessonTasks.length}</div>
                  </button>
                  <button
                    className="btn-secondary shrink-0 self-center text-xs"
                    type="button"
                    onClick={() => void navigate(`/app/lessons/${lesson.id}/read`)}
                  >
                    Open full lesson
                  </button>
                </div>
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
