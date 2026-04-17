import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

import { useTutorialStore } from "../store/tutorialStore";
import { buildClipPath, getPopupPosition } from "./tutorial/rect";
import { useHighlightRects, useScrollStepIntoView } from "./tutorial/useHighlightRects";
import { useStepTrigger } from "./tutorial/useStepTrigger";

const HIGHLIGHT_PAD = 8;

type Props = { onFinish?: () => void; suppressed?: boolean };

export function TutorialOverlay({ onFinish, suppressed = false }: Props): JSX.Element | null {
  const { active, lessonId, stepIndex, lessons, completeStep, previousStep, finishLesson } =
    useTutorialStore();

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const step = lesson && stepIndex < lesson.steps.length ? lesson.steps[stepIndex] : null;
  const allDone = lesson !== null && stepIndex >= lesson.steps.length;

  const { highlight, extras } = useHighlightRects(active, step);
  useScrollStepIntoView(active, step);
  useStepTrigger(active, step, completeStep);

  const handleFinish = useCallback(() => {
    finishLesson();
    onFinish?.();
  }, [finishLesson, onFinish]);

  useEffect(() => {
    if (active && allDone) handleFinish();
  }, [active, allDone, handleFinish]);

  if (!active || !lesson || suppressed) return null;

  const allRects = [...(highlight ? [highlight] : []), ...extras];
  const clipPath = allRects.length > 0 ? buildClipPath(allRects, HIGHLIGHT_PAD) : undefined;
  const totalSteps = lesson.steps.length;
  const canGoBack = stepIndex > 0;
  const canGoForward = step !== null && stepIndex < totalSteps - 1;
  const showFloatingInstruction = Boolean(step) && !allDone;

  return createPortal(
    <div className="tutorial-root">
      {allRects.length > 0 && (
        <div className="tutorial-backdrop" style={{ clipPath, WebkitClipPath: clipPath }} />
      )}

      {!allDone &&
        allRects.map((rect, idx) => (
          <div
            key={idx}
            className="tutorial-highlight-ring"
            style={{
              top: rect.top - HIGHLIGHT_PAD,
              left: rect.left - HIGHLIGHT_PAD,
              width: rect.width + HIGHLIGHT_PAD * 2,
              height: rect.height + HIGHLIGHT_PAD * 2,
            }}
          />
        ))}

      {showFloatingInstruction && step && (
        <div className="tutorial-popup tutorial-popup-compact" style={getPopupPosition(highlight, step)}>
          <div className="tutorial-popup-step">
            Step {stepIndex + 1} / {totalSteps}
          </div>
          <p className="tutorial-popup-text">{step.instruction}</p>
          {step.shortcutHint && (
            <div className="tutorial-popup-shortcut">
              {step.shortcutHint.split(",").map((chunk, idx) => {
                const label = chunk.trim();
                if (!label) return null;
                return (
                  <kbd key={`${label}-${idx}`} className="tutorial-popup-kbd">
                    {label}
                  </kbd>
                );
              })}
            </div>
          )}
          <div className="tutorial-popup-nav">
            <button
              type="button"
              className="tutorial-popup-arrow"
              aria-label="Previous step"
              title="Previous step"
              onClick={previousStep}
              disabled={!canGoBack}
            >
              &#x2039;
            </button>
            <button
              type="button"
              className="tutorial-popup-arrow"
              aria-label="Next step"
              title="Next step"
              onClick={completeStep}
              disabled={!canGoForward}
            >
              &#x203A;
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
