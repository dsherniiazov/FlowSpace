import type { StoreApi, UseBoundStore } from "zustand";

import type { LabSnapshot } from "./domainTypes";
import type { LabState } from "./storeTypes";

export function attachLabHistory(
  store: UseBoundStore<StoreApi<LabState>>,
  historyLimit: number,
  debounceMs: number,
): void {
  let pendingHistorySnapshot: LabSnapshot | null = null;
  let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingHistory(): void {
    if (historyDebounceTimer !== null) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    if (!pendingHistorySnapshot) return;

    const snapshot = pendingHistorySnapshot;
    pendingHistorySnapshot = null;
    store.setState((state) => ({
      past: [...state.past, snapshot].slice(-historyLimit),
      future: [],
    }));
  }

  store.subscribe((state, prev) => {
    if (state.isReplayingHistory) return;
    const structuralChange =
      state.nodes !== prev.nodes ||
      state.edges !== prev.edges ||
      state.feedbackLoops !== prev.feedbackLoops;

    if (!structuralChange) return;
    if (pendingHistorySnapshot === null) {
      pendingHistorySnapshot = {
        nodes: prev.nodes,
        edges: prev.edges,
        feedbackLoops: prev.feedbackLoops,
      };
    }

    if (historyDebounceTimer !== null) clearTimeout(historyDebounceTimer);
    historyDebounceTimer = setTimeout(flushPendingHistory, debounceMs);
  });
}
