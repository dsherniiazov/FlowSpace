import type { Lesson, Section } from "../../types/api";
import type { SectionKey } from "./types";
import { UNASSIGNED_SECTION_KEY } from "./types";

type ControlSectionListProps = {
  sections: Section[];
  unassignedLessons: Lesson[];
  getSectionLessons: (sectionKey: SectionKey) => Lesson[];
  getSectionTaskCount: (sectionKey: SectionKey) => number;
  onAddSection: () => void;
  onOpenSection: (sectionKey: SectionKey) => void;
};

export function ControlSectionList({
  sections,
  unassignedLessons,
  getSectionLessons,
  getSectionTaskCount,
  onAddSection,
  onOpenSection,
}: ControlSectionListProps): JSX.Element {
  return (
    <div className="panel control-panel space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="control-section-heading text-lg font-semibold">Sections</h3>
          <p className="control-copy text-sm text-slate-500">Manage sections, lessons and tasks from one place.</p>
        </div>
        <button className="btn-primary" type="button" onClick={onAddSection}>
          Add section
        </button>
      </div>

      <div className="space-y-2">
        {sections.map((section) => (
          <SectionButton
            key={section.id}
            title={section.title}
            color={section.color ?? "#64748b"}
            lessonCount={getSectionLessons(section.id).length}
            taskCount={getSectionTaskCount(section.id)}
            dashed={false}
            onClick={() => onOpenSection(section.id)}
          />
        ))}

        {unassignedLessons.length ? (
          <SectionButton
            title="Without section"
            color="#64748b"
            lessonCount={unassignedLessons.length}
            taskCount={getSectionTaskCount(UNASSIGNED_SECTION_KEY)}
            dashed
            onClick={() => onOpenSection(UNASSIGNED_SECTION_KEY)}
          />
        ) : null}

        {!sections.length && !unassignedLessons.length ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
            No sections yet. Create the first section to start adding lessons.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionButton({
  title,
  color,
  lessonCount,
  taskCount,
  dashed,
  onClick,
}: {
  title: string;
  color: string;
  lessonCount: number;
  taskCount: number;
  dashed: boolean;
  onClick: () => void;
}): JSX.Element {
  const borderClass = dashed ? "border-dashed border-slate-300" : "border-slate-200";

  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-3 rounded-xl border ${borderClass} px-4 py-3 text-left transition hover:bg-slate-50`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-slate-500">
            Lessons: {lessonCount} - Tasks: {taskCount}
          </div>
        </div>
      </div>
      <span className="text-sm text-slate-400">Open</span>
    </button>
  );
}
