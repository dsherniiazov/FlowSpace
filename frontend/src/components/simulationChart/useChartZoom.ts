import { useCallback, useEffect, useRef, useState } from "react";

import type { RunStep } from "../../types/api";

export type ChartZoom = {
  zoomDomain: [number, number] | null;
  dragFrom: number | null;
  dragTo: number | null;
  handleChartMouseDown: (state: unknown) => void;
  handleChartMouseMove: (state: unknown) => void;
  handleChartMouseUp: () => void;
  handleChartMouseLeave: () => void;
  resetZoom: () => void;
};

function activeLabelToNumber(state: unknown): number | null {
  const raw = (state as { activeLabel?: unknown } | null)?.activeLabel;
  const x = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(x) ? x : null;
}

export function useChartZoom(enabled: boolean, steps: RunStep[]): ChartZoom {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setZoomDomain(null);
    setDragFrom(null);
    setDragTo(null);
  }, [steps]);

  const handleChartMouseDown = useCallback(
    (state: unknown) => {
      if (!enabled) return;
      const x = activeLabelToNumber(state);
      if (x === null) return;
      draggingRef.current = true;
      setDragFrom(x);
      setDragTo(x);
    },
    [enabled],
  );

  const handleChartMouseMove = useCallback(
    (state: unknown) => {
      if (!enabled || !draggingRef.current) return;
      const x = activeLabelToNumber(state);
      if (x === null) return;
      setDragTo(x);
    },
    [enabled],
  );

  const handleChartMouseUp = useCallback(() => {
    if (!enabled) return;
    draggingRef.current = false;
    if (dragFrom == null || dragTo == null || steps.length === 0) {
      setDragFrom(null);
      setDragTo(null);
      return;
    }
    const lo = Math.min(dragFrom, dragTo);
    const hi = Math.max(dragFrom, dragTo);
    const span = steps[steps.length - 1].time - steps[0].time;
    const minDelta = Math.max(span * 0.01, 1e-9);
    if (hi - lo >= minDelta) setZoomDomain([lo, hi]);
    setDragFrom(null);
    setDragTo(null);
  }, [dragFrom, dragTo, enabled, steps]);

  const handleChartMouseLeave = useCallback(() => {
    if (!enabled) return;
    draggingRef.current = false;
    setDragFrom(null);
    setDragTo(null);
  }, [enabled]);

  const resetZoom = useCallback(() => setZoomDomain(null), []);

  return {
    zoomDomain,
    dragFrom,
    dragTo,
    handleChartMouseDown,
    handleChartMouseMove,
    handleChartMouseUp,
    handleChartMouseLeave,
    resetZoom,
  };
}
