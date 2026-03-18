import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTutorialStore } from "../store/tutorialStore";
import { useLabStore } from "../store/labStore";
import type { TutorialStep } from "../store/tutorialStore";

export function TutorialOverlay({ onFinish }: { onFinish?: () => void }): JSX.Element | null {
  const {
    active,
    lessonId,
    stepIndex,
    popupVisible,
    lessons,
    dismissPopup,
    completeStep,
    finishLesson,
  } = useTutorialStore();

  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const rafRef = useRef(0);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const step = lesson && stepIndex < lesson.steps.length ? lesson.steps[stepIndex] : null;
  const allDone = lesson !== null && stepIndex >= lesson.steps.length;

  // --------------- compute highlight rect ---------------
  const computeRect = useCallback((s: TutorialStep): DOMRect | null => {
    if (s.highlightBetween) {
      const leftEl = document.querySelector(s.highlightBetween.left);
      const rightEl = document.querySelector(s.highlightBetween.right);
      if (leftEl && rightEl) {
        const leftRect = leftEl.getBoundingClientRect();
        const rightRect = rightEl.getBoundingClientRect();
        const top = s.highlightTopOffset ?? 0;
        const bottom = window.innerHeight;
        const left = leftRect.right;
        const right = rightRect.left;
        return new DOMRect(left, top, right - left, bottom - top);
      }
    }
    const el = document.querySelector(s.targetSelector);
    return el ? el.getBoundingClientRect() : null;
  }, []);

  // --------------- track target element rect ---------------
  const updateRect = useCallback(() => {
    if (!step) {
      setHighlight(null);
      return;
    }
    setHighlight(computeRect(step));
    rafRef.current = requestAnimationFrame(updateRect);
  }, [step, computeRect]);

  useEffect(() => {
    if (!active || !step) return;
    rafRef.current = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, step, updateRect]);

  // --------------- listen for interaction events ---------------
  useEffect(() => {
    listenerCleanupRef.current?.();
    listenerCleanupRef.current = null;
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    if (!active || !step) return;
    if (!step.skipPopup && popupVisible) return;

    const trigger = step.trigger;

    // ── timer: auto-advance after delayMs ──
    if (trigger === "timer") {
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        completeStep();
      }, step.delayMs ?? 3000);

      listenerCleanupRef.current = () => {
        if (delayTimerRef.current !== null) {
          clearTimeout(delayTimerRef.current);
          delayTimerRef.current = null;
        }
      };
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── edge-inflow: subscribe to labStore edges ──
    if (trigger === "edge-inflow") {
      const initialCount = useLabStore.getState().edges.length;
      const unsub = useLabStore.subscribe((state) => {
        if (state.edges.length > initialCount) {
          const lastEdge = state.edges[state.edges.length - 1];
          const kind = lastEdge?.data?.kind ?? lastEdge?.label;
          if (kind === "inflow" || lastEdge?.label === "+") {
            unsub();
            completeStep();
          }
        }
      });
      listenerCleanupRef.current = unsub;
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── node-deleted: subscribe to labStore, wait for node count to decrease ──
    if (trigger === "node-deleted") {
      const initialCount = useLabStore.getState().nodes.length;
      const unsub = useLabStore.subscribe((state) => {
        if (state.nodes.length < initialCount) {
          unsub();
          completeStep();
        }
      });
      listenerCleanupRef.current = unsub;
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── node-added: subscribe to labStore, wait for node count to increase ──
    if (trigger === "node-added") {
      const initialCount = useLabStore.getState().nodes.length;
      const unsub = useLabStore.subscribe((state) => {
        if (state.nodes.length > initialCount) {
          unsub();
          completeStep();
        }
      });
      listenerCleanupRef.current = unsub;
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── comment-saved: wait for comment entry overlay to appear then disappear ──
    if (trigger === "comment-saved") {
      let appeared = false;
      const pollId = setInterval(() => {
        const el = document.querySelector('[data-tutorial="comment-overlay"]');
        if (el) {
          appeared = true;
        } else if (appeared) {
          clearInterval(pollId);
          completeStep();
        }
      }, 200);
      listenerCleanupRef.current = () => clearInterval(pollId);
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── modal-close: wait for element to disappear ──
    if (trigger === "modal-close") {
      const pollId = setInterval(() => {
        const el = document.querySelector(step.targetSelector);
        if (!el) {
          clearInterval(pollId);
          completeStep();
        }
      }, 200);
      listenerCleanupRef.current = () => clearInterval(pollId);
      return () => {
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── helper: wait for element to appear, then run callback ──
    function waitForElement(selector: string, cb: (el: Element) => void): () => void {
      const el = document.querySelector(selector);
      if (el) { cb(el); return () => {}; }
      const pollId = setInterval(() => {
        const found = document.querySelector(selector);
        if (found) { clearInterval(pollId); cb(found); }
      }, 100);
      return () => clearInterval(pollId);
    }

    // ── commit: blur / Enter ──
    if (trigger === "commit") {
      const stopPoll = waitForElement(step.targetSelector, (target) => {
        const input = target.querySelector("input") ?? target;
        let changed = false;

        const onInput = () => { changed = true; };
        const onBlur = () => { if (changed) completeStep(); };
        const onKeyDown = (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter" && changed) completeStep();
        };

        input.addEventListener("input", onInput, { capture: true });
        input.addEventListener("blur", onBlur, { capture: true });
        input.addEventListener("keydown", onKeyDown, { capture: true });

        listenerCleanupRef.current = () => {
          input.removeEventListener("input", onInput, { capture: true });
          input.removeEventListener("blur", onBlur, { capture: true });
          input.removeEventListener("keydown", onKeyDown, { capture: true });
        };
      });
      return () => {
        stopPoll();
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
      };
    }

    // ── interact: DOM event ──
    if (trigger === "interact") {
      const eventName = step.interactEvent ?? "pointerdown";
      const stopPoll = waitForElement(step.targetSelector, (target) => {
        const handler = () => {
          const delay = step.delayMs ?? 0;
          if (delay > 0) {
            delayTimerRef.current = setTimeout(() => {
              delayTimerRef.current = null;
              completeStep();
            }, delay);
          } else {
            completeStep();
          }
        };

        target.addEventListener(eventName, handler, { capture: true, once: true });

        listenerCleanupRef.current = () => {
          target.removeEventListener(eventName, handler, { capture: true });
        };
      });
      return () => {
        stopPoll();
        listenerCleanupRef.current?.();
        listenerCleanupRef.current = null;
        if (delayTimerRef.current !== null) {
          clearTimeout(delayTimerRef.current);
          delayTimerRef.current = null;
        }
      };
    }
  }, [active, step, popupVisible, completeStep]);

  const handleFinish = useCallback(() => {
    finishLesson();
    onFinish?.();
  }, [finishLesson, onFinish]);

  if (!active || !lesson) return null;

  const PAD = 8;
  const clipPath = highlight ? buildClipPath(highlight, PAD) : undefined;
  const popupStyle = getPopupPosition(highlight);

  const showFloatingInstruction = step && (step.skipPopup || step.trigger === "edge-inflow") && !popupVisible;

  return createPortal(
    <div className="tutorial-root">
      {/* Backdrop with hole — only render when we know the target rect */}
      {highlight && (
        <div
          className="tutorial-backdrop"
          style={{ clipPath }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Highlight border ring */}
      {highlight && !popupVisible && !allDone && (
        <div
          className="tutorial-highlight-ring"
          style={{
            top: highlight.top - PAD,
            left: highlight.left - PAD,
            width: highlight.width + PAD * 2,
            height: highlight.height + PAD * 2,
          }}
        />
      )}

      {/* Floating instruction for skipPopup / edge-inflow steps */}
      {showFloatingInstruction && step && highlight && (
        <div className="tutorial-popup tutorial-popup-compact" style={getPopupPosition(highlight)}>
          <div className="tutorial-popup-step">
            Step {stepIndex + 1} / {lesson.steps.length}
          </div>
          <p className="tutorial-popup-text">{step.instruction}</p>
        </div>
      )}

      {/* Instruction popup with OK button */}
      {popupVisible && step && (
        <div className="tutorial-popup" style={popupStyle}>
          <div className="tutorial-popup-step">
            Step {stepIndex + 1} / {lesson.steps.length}
          </div>
          <p className="tutorial-popup-text">{step.instruction}</p>
          <button className="tutorial-popup-btn" onClick={dismissPopup}>
            OK
          </button>
        </div>
      )}

      {/* All-done card */}
      {allDone && (
        <div className="tutorial-popup" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
          <div className="tutorial-popup-step">Lesson complete!</div>
          <p className="tutorial-popup-text">
            You have finished the <strong>{lesson.title}</strong> lesson.
          </p>
          <button className="tutorial-popup-btn" onClick={handleFinish}>
            Finish lesson
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// --------------- helpers ---------------

function buildClipPath(rect: DOMRect, pad: number): string {
  const t = Math.max(0, rect.top - pad);
  const l = Math.max(0, rect.left - pad);
  const b = rect.bottom + pad;
  const r = rect.right + pad;

  return `polygon(
    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
    ${l}px ${t}px,
    ${l}px ${b}px,
    ${r}px ${b}px,
    ${r}px ${t}px,
    ${l}px ${t}px
  )`;
}

function getPopupPosition(highlight: DOMRect | null): React.CSSProperties {
  if (!highlight) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const popupW = 340;
  const popupH = 180;
  const gap = 16;

  if (highlight.bottom + gap + popupH < vh) {
    return {
      top: highlight.bottom + gap,
      left: Math.min(Math.max(highlight.left, 16), vw - popupW - 16),
    };
  }
  if (highlight.top - gap - popupH > 0) {
    return {
      top: highlight.top - gap - popupH,
      left: Math.min(Math.max(highlight.left, 16), vw - popupW - 16),
    };
  }
  if (highlight.right + gap + popupW < vw) {
    return {
      top: Math.min(Math.max(highlight.top, 16), vh - popupH - 16),
      left: highlight.right + gap,
    };
  }
  return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
}
