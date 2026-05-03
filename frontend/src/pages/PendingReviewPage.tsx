import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MarkReviewedModal } from "../components/MarkReviewedModal";
import { fetchLessons } from "../features/lessons/api";
import { fetchPendingReviewSystems, markSystemReviewed } from "../features/systems/api";
import { fetchSections } from "../features/sections/api";
import { useLabStore } from "../store/labStore";
import { Lesson, Section, SystemWithOwner } from "../types/api";

type OwnerBucket = {
  ownerKey: string;
  ownerId: number | null;
  displayName: string;
  displayEmail: string;
  systems: SystemWithOwner[];
};

type ReviewGroup = {
  key: string;
  sort: [number, number, number];
  sectionTitle: string;
  lessonTitle: string;
  systems: SystemWithOwner[];
};

function byOwnerBuckets(systems: SystemWithOwner[]): OwnerBucket[] {
  const m = new Map<string, SystemWithOwner[]>();
  for (const sys of systems) {
    const id = sys.owner_id;
    const key = id != null ? `u${id}` : "anon";
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(sys);
  }
  const buckets: OwnerBucket[] = [];
  for (const [ownerKey, list] of m) {
    const first = list[0]!;
    const ownerId = first.owner_id;
    const displayName = (first.owner_name ?? "").trim() || (ownerId != null ? `User #${ownerId}` : "Unknown");
    const displayEmail = first.owner_email?.trim() || "";
    buckets.push({ ownerKey, ownerId, displayName, displayEmail, systems: list });
  }
  buckets.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return buckets;
}

function groupByLessonAndSection(
  systems: SystemWithOwner[],
  lessons: Lesson[],
  sections: Section[],
): ReviewGroup[] {
  const sectionById = new Map(sections.map((s) => [s.id, s] as const));
  const lessonById = new Map(lessons.map((l) => [l.id, l] as const));
  const map = new Map<string, SystemWithOwner[]>();

  for (const sys of systems) {
    if (sys.lesson_id == null) {
      const k = "lab";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(sys);
    } else {
      const k = `lesson:${sys.lesson_id}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(sys);
    }
  }

  const groups: ReviewGroup[] = [];
  for (const [k, list] of map) {
    if (k === "lab") {
      groups.push({
        key: k,
        sort: [Number.MAX_SAFE_INTEGER, 0, 0],
        sectionTitle: "Lab",
        lessonTitle: "From lab (no lesson task)",
        systems: list,
      });
      continue;
    }
    const lid = list[0]!.lesson_id!;
    const lesson = lessonById.get(lid);
    const sec = lesson?.section_id != null ? sectionById.get(lesson.section_id) : undefined;
    const sOrder = sec?.order_index ?? 0;
    const lOrder = lesson?.order_index ?? 0;
    groups.push({
      key: k,
      sort: [sOrder, lOrder, lid],
      sectionTitle: sec?.title ?? "Other",
      lessonTitle: lesson?.title ?? `Lesson #${lid}`,
      systems: list,
    });
  }
  groups.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.sort[i]! !== b.sort[i]!) return a.sort[i]! - b.sort[i]!;
    }
    return 0;
  });
  return groups;
}

export function PendingReviewPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);

  const pendingQuery = useQuery({
    queryKey: ["pending-review-systems"],
    queryFn: fetchPendingReviewSystems,
  });
  const lessonsQuery = useQuery({
    queryKey: ["lessons", "pending-review"],
    queryFn: fetchLessons,
  });
  const sectionsQuery = useQuery({
    queryKey: ["sections", "pending-review"],
    queryFn: fetchSections,
  });

  const markReviewedMutation = useMutation({
    mutationFn: ({ systemId, comment }: { systemId: number; comment: string }) =>
      markSystemReviewed(systemId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-review-systems"] });
    },
  });

  const [reviewTarget, setReviewTarget] = useState<{ id: number; title: string } | null>(null);
  const [expandedOwnerKey, setExpandedOwnerKey] = useState<string | null>(null);

  const systems = pendingQuery.data ?? [];
  const lessons = lessonsQuery.data ?? [];
  const sections = sectionsQuery.data ?? [];

  const ownerBuckets = useMemo(() => byOwnerBuckets(systems), [systems]);
  const metaLoading = lessonsQuery.isLoading || sectionsQuery.isLoading;

  return (
    <div className="page-container">
      <h2 className="page-title">Pending review</h2>
      <p className="page-subtitle text-zinc-500 text-sm mb-4">
        Models submitted by students, grouped by author. Open a user to see systems by section and lesson, or under Lab
        if they were sent from the lab without a lesson task.
      </p>

      {pendingQuery.isLoading ? <div className="text-zinc-500">Loading...</div> : null}
      {pendingQuery.isError ? <div className="text-red-400">Unable to load list.</div> : null}

      {systems.length === 0 && !pendingQuery.isLoading ? (
        <div className="text-zinc-500">No systems pending review.</div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {ownerBuckets.map((bucket) => {
          const n = bucket.systems.length;
          const expanded = expandedOwnerKey === bucket.ownerKey;
          return (
            <div key={bucket.ownerKey} className="profile-system-card p-0 overflow-hidden">
              <button
                type="button"
                className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                onClick={() => setExpandedOwnerKey(expanded ? null : bucket.ownerKey)}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                    {bucket.displayName}
                    {n > 0 ? (
                      <span
                        className="inline-flex h-2 w-2 rounded-full bg-red-500 shrink-0"
                        title="Has submissions awaiting review"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {bucket.displayEmail || "N/A"}
                    <span className="text-zinc-400"> · {n} sent for review</span>
                  </div>
                </div>
                <span className="text-zinc-500 text-sm shrink-0" aria-hidden>
                  {expanded ? "▾" : "▸"}
                </span>
              </button>

              {expanded ? (
                <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/80 pt-4">
                  {metaLoading ? <div className="text-xs text-zinc-500">Loading lessons…</div> : null}
                  {groupByLessonAndSection(bucket.systems, lessons, sections).map((g) => (
                    <div key={g.key} className="space-y-2">
                      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                        {g.sectionTitle}
                        <span className="text-zinc-500 font-normal"> · {g.lessonTitle}</span>
                      </div>
                      <ul className="space-y-2 pl-0 list-none m-0">
                        {g.systems.map((system) => (
                          <li key={system.id}>
                            <div className="profile-system-card p-3 !my-0">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <div className="profile-system-title font-semibold text-sm">{system.title}</div>
                                  <div className="text-xs text-zinc-500">ID {system.id}</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    className="btn-secondary"
                                    onClick={() => {
                                      loadGraphJson(system.graph_json);
                                      setActiveSystemId(system.id);
                                      navigate("/app/lab", {
                                        state: {
                                          systemId: system.id,
                                          systemTitle: system.title,
                                          systemGraph: system.graph_json,
                                          reviewing: true,
                                        },
                                      });
                                    }}
                                  >
                                    Open in lab
                                  </button>
                                  <button
                                    className="btn-primary"
                                    disabled={markReviewedMutation.isPending}
                                    onClick={() => setReviewTarget({ id: system.id, title: system.title })}
                                  >
                                    Mark as reviewed
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <MarkReviewedModal
        isOpen={reviewTarget !== null}
        systemTitle={reviewTarget?.title ?? ""}
        isSubmitting={markReviewedMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onSubmit={async (comment) => {
          if (!reviewTarget) return;
          await markReviewedMutation.mutateAsync({ systemId: reviewTarget.id, comment });
          setReviewTarget(null);
        }}
      />
    </div>
  );
}
