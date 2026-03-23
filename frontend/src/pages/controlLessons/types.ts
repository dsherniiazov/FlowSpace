import { Lesson, LessonTask } from "../../types/api";

export const DEFAULT_SECTION_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
export const UNASSIGNED_SECTION_KEY = "unassigned";

export type SectionKey = number | typeof UNASSIGNED_SECTION_KEY;

export type ModalState =
  | { type: "section-create" }
  | { type: "section-detail"; sectionKey: SectionKey }
  | { type: "section-edit"; sectionId: number }
  | { type: "lesson-create"; sectionId: number }
  | { type: "lesson-detail"; sectionKey: SectionKey; lessonId: number }
  | { type: "task-create"; sectionKey: SectionKey; lessonId: number }
  | { type: "task-detail"; sectionKey: SectionKey; lessonId: number; taskId: number };

export type LessonsBySectionMap = Map<SectionKey, Lesson[]>;
export type TasksByLessonMap = Map<number, LessonTask[]>;
