import { useEffect, useRef, useState } from "react";

import type { TutorialStep } from "../../store/tutorialStore";
import { computeHighlightRect } from "./rect";

export function useHighlightRects(
  active: boolean,
  step: TutorialStep | null,
): { highlight: DOMRect | null; extras: DOMRect[] } {
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const [extras, setExtras] = useState<DOMRect[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (step) {
        setHighlight(computeHighlightRect(step));
        if (step.extraHighlightSelectors?.length && !step.noHighlight) {
          const next: DOMRect[] = [];
          for (const sel of step.extraHighlightSelectors) {
            const el = document.querySelector(sel);
            if (el) next.push(el.getBoundingClientRect());
          }
          setExtras(next);
        } else {
          setExtras((prev) => (prev.length === 0 ? prev : []));
        }
      } else {
        setHighlight(null);
        setExtras((prev) => (prev.length === 0 ? prev : []));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, step]);

  return { highlight, extras };
}

export function useScrollStepIntoView(active: boolean, step: TutorialStep | null): void {
  useEffect(() => {
    if (!active || !step) return;
    const selectors = [step.highlightSelector, step.targetSelector].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    let cancelled = false;
    const attempt = (remaining: number): void => {
      if (cancelled) return;
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const fullyVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;
        if (!fullyVisible) {
          try {
            el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          } catch {
            el.scrollIntoView();
          }
        }
        return;
      }
      if (remaining > 0) setTimeout(() => attempt(remaining - 1), 150);
    };
    const startId = setTimeout(() => attempt(10), 50);
    return () => {
      cancelled = true;
      clearTimeout(startId);
    };
  }, [active, step]);
}
