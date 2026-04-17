import { useCallback, useEffect, useRef } from "react";

import { useLabStore } from "../../store/labStore";
import type { TutorialStep } from "../../store/tutorialStore";

const MIN_ADVANCE_DELAY_MS = 1000;

type Cleanup = () => void;

function waitForElement(selector: string, cb: (el: Element) => void): Cleanup {
  const existing = document.querySelector(selector);
  if (existing) {
    cb(existing);
    return () => {};
  }
  const pollId = setInterval(() => {
    const found = document.querySelector(selector);
    if (found) {
      clearInterval(pollId);
      cb(found);
    }
  }, 100);
  return () => clearInterval(pollId);
}

function subscribeLabStore(predicate: (edgeOrState: ReturnType<typeof useLabStore.getState>) => boolean, onMatch: () => void): Cleanup {
  const unsub = useLabStore.subscribe((state) => {
    if (predicate(state)) {
      unsub();
      onMatch();
    }
  });
  return unsub;
}

function pollUntil(predicate: () => boolean, onMatch: () => void, intervalMs = 200): Cleanup {
  const pollId = setInterval(() => {
    if (predicate()) {
      clearInterval(pollId);
      onMatch();
    }
  }, intervalMs);
  return () => clearInterval(pollId);
}

export function useStepTrigger(
  active: boolean,
  step: TutorialStep | null,
  completeStep: () => void,
): void {
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<Cleanup | null>(null);

  const scheduleAdvance = useCallback(
    (extraMs = 0) => {
      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      const wait = Math.max(MIN_ADVANCE_DELAY_MS, extraMs);
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        completeStep();
      }, wait);
    },
    [completeStep],
  );

  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (!active || !step) return;

    switch (step.trigger) {
      case "timer": {
        scheduleAdvance(step.delayMs ?? 3000);
        return () => {
          if (advanceTimerRef.current !== null) {
            clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = null;
          }
        };
      }
      case "edge-inflow": {
        const initialCount = useLabStore.getState().edges.length;
        cleanupRef.current = subscribeLabStore(
          (state) => {
            if (state.edges.length <= initialCount) return false;
            const last = state.edges[state.edges.length - 1];
            const kind = last?.data?.kind ?? last?.label;
            return kind === "inflow" || last?.label === "+";
          },
          () => scheduleAdvance(),
        );
        break;
      }
      case "node-deleted": {
        const initialCount = useLabStore.getState().nodes.length;
        cleanupRef.current = subscribeLabStore(
          (state) => state.nodes.length < initialCount,
          () => scheduleAdvance(),
        );
        break;
      }
      case "node-added": {
        const initialCount = useLabStore.getState().nodes.length;
        cleanupRef.current = subscribeLabStore(
          (state) => state.nodes.length > initialCount,
          () => scheduleAdvance(),
        );
        break;
      }
      case "comment-saved": {
        let appeared = false;
        cleanupRef.current = pollUntil(
          () => {
            const el = document.querySelector('[data-tutorial="comment-overlay"]');
            if (el) appeared = true;
            else if (appeared) return true;
            return false;
          },
          () => scheduleAdvance(),
        );
        break;
      }
      case "modal-close": {
        cleanupRef.current = pollUntil(
          () => !document.querySelector(step.targetSelector),
          () => scheduleAdvance(),
        );
        break;
      }
      case "commit": {
        const stopPoll = waitForElement(step.targetSelector, (target) => {
          const input = target.querySelector("input") ?? target;
          let changed = false;
          const onInput = () => { changed = true; };
          const onBlur = () => { if (changed) scheduleAdvance(); };
          const onKeyDown = (e: Event) => {
            if ((e as KeyboardEvent).key === "Enter" && changed) scheduleAdvance();
          };
          input.addEventListener("input", onInput, { capture: true });
          input.addEventListener("blur", onBlur, { capture: true });
          input.addEventListener("keydown", onKeyDown, { capture: true });
          cleanupRef.current = () => {
            input.removeEventListener("input", onInput, { capture: true });
            input.removeEventListener("blur", onBlur, { capture: true });
            input.removeEventListener("keydown", onKeyDown, { capture: true });
          };
        });
        return () => {
          stopPoll();
          cleanupRef.current?.();
          cleanupRef.current = null;
        };
      }
      case "interact": {
        const eventName = step.interactEvent ?? "pointerdown";
        const required = Math.max(1, step.repeatCount ?? 1);
        let remaining = required;
        const stopPoll = waitForElement(step.targetSelector, (target) => {
          const handler = () => {
            remaining -= 1;
            if (remaining > 0) return;
            scheduleAdvance(step.delayMs ?? 0);
          };
          target.addEventListener(eventName, handler, { capture: true });
          cleanupRef.current = () =>
            target.removeEventListener(eventName, handler, { capture: true });
        });
        return () => {
          stopPoll();
          cleanupRef.current?.();
          cleanupRef.current = null;
        };
      }
      default:
        break;
    }

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active, step, scheduleAdvance]);

  useEffect(() => {
    if (active) return;
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, [active]);
}
