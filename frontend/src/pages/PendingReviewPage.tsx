import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MarkReviewedModal } from "../components/MarkReviewedModal";
import { fetchPendingReviewSystems, markSystemReviewed } from "../features/systems/api";
import { useLabStore } from "../store/labStore";

export function PendingReviewPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadGraphJson = useLabStore((state) => state.loadGraphJson);
  const setActiveSystemId = useLabStore((state) => state.setActiveSystemId);

  const pendingQuery = useQuery({
    queryKey: ["pending-review-systems"],
    queryFn: fetchPendingReviewSystems,
  });

  const markReviewedMutation = useMutation({
    mutationFn: ({ systemId, comment }: { systemId: number; comment: string }) =>
      markSystemReviewed(systemId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-review-systems"] });
    },
  });

  const [reviewTarget, setReviewTarget] = useState<{ id: number; title: string } | null>(null);

  const systems = pendingQuery.data ?? [];

  return (
    <div className="page-container">
      <h2 className="page-title">Pending Review</h2>
      <p className="page-subtitle text-zinc-500 text-sm mb-4">
        Systems submitted for review by students.
      </p>

      {pendingQuery.isLoading ? <div className="text-zinc-500">Loading...</div> : null}
      {pendingQuery.isError ? <div className="text-red-400">Unable to load list.</div> : null}

      {systems.length === 0 && !pendingQuery.isLoading ? (
        <div className="text-zinc-500">No systems pending review.</div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {systems.map((system) => (
          <div key={system.id} className="profile-system-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="profile-system-title font-semibold">{system.title}</div>
                <div className="text-xs text-zinc-500">
                  ID {system.id}
                  {system.owner_name ? ` · ${system.owner_name}` : ""}
                  {system.owner_email ? ` (${system.owner_email})` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                  Open in Lab
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
        ))}
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
