import { useEffect, type MutableRefObject } from "react";

import type { SystemModel } from "../../../types/api";
import { buildSaveSignature } from "../utils";

type UseActiveSystemGraphArgs = {
  activeSystemId: number | null;
  systems: SystemModel[] | undefined;
  loadedSystemGraphIdRef: MutableRefObject<number | null>;
  loadGraphJson: (graph: Record<string, unknown>) => void;
  setLastSavedSignature: (signature: string | null) => void;
  setTitle: (title: string) => void;
  markSeen: (systemId: number) => void;
};

export function useActiveSystemGraph({
  activeSystemId,
  systems,
  loadedSystemGraphIdRef,
  loadGraphJson,
  setLastSavedSignature,
  setTitle,
  markSeen,
}: UseActiveSystemGraphArgs): void {
  useEffect(() => {
    if (!activeSystemId) return;
    const current = systems?.find((system) => system.id === activeSystemId);
    if (current?.has_unseen_changes) markSeen(activeSystemId);
  }, [activeSystemId, systems, markSeen]);

  useEffect(() => {
    if (activeSystemId === null) {
      loadedSystemGraphIdRef.current = null;
      setLastSavedSignature(null);
      return;
    }

    if (loadedSystemGraphIdRef.current === activeSystemId) return;

    const currentSystem = systems?.find((system) => system.id === activeSystemId);
    if (!currentSystem) return;

    const graph = currentSystem.graph_json && typeof currentSystem.graph_json === "object"
      ? currentSystem.graph_json
      : {};

    loadGraphJson(graph);
    loadedSystemGraphIdRef.current = activeSystemId;
    setLastSavedSignature(buildSaveSignature(String(currentSystem.title ?? ""), graph));
    if (currentSystem.title) setTitle(currentSystem.title);
  }, [
    activeSystemId,
    systems,
    loadedSystemGraphIdRef,
    loadGraphJson,
    setLastSavedSignature,
    setTitle,
  ]);
}
