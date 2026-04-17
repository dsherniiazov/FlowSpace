import type { TutorialStep } from "../../store/tutorialStore";

export function computeHighlightRect(step: TutorialStep): DOMRect | null {
  if (step.noHighlight) return null;
  if (step.highlightSelector) {
    const el = document.querySelector(step.highlightSelector);
    if (el) return el.getBoundingClientRect();
  }
  if (step.highlightBetween) {
    const leftEl = document.querySelector(step.highlightBetween.left);
    const rightEl = document.querySelector(step.highlightBetween.right);
    if (leftEl && rightEl) {
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      const top = step.highlightTopOffset ?? 0;
      return new DOMRect(
        leftRect.right,
        top,
        rightRect.left - leftRect.right,
        window.innerHeight - top,
      );
    }
  }
  const el = document.querySelector(step.targetSelector);
  return el ? el.getBoundingClientRect() : null;
}

export function buildClipPath(rects: DOMRect[], pad: number): string {
  if (rects.length === 0) return "";
  const parts: string[] = ["0% 0%", "100% 0%", "100% 100%", "0% 100%", "0% 0%"];
  for (const rect of rects) {
    const t = Math.max(0, rect.top - pad);
    const l = Math.max(0, rect.left - pad);
    const b = rect.bottom + pad;
    const r = rect.right + pad;
    parts.push(
      `${l}px ${t}px`,
      `${l}px ${b}px`,
      `${r}px ${b}px`,
      `${r}px ${t}px`,
      `${l}px ${t}px`,
      `0% 0%`,
    );
  }
  return `polygon(${parts.join(", ")})`;
}

export function getPopupPosition(
  highlight: DOMRect | null,
  step?: TutorialStep | null,
): React.CSSProperties {
  const vw = window.innerWidth;
  const popupW = 340;

  if (step?.popupPlacement === "top") {
    return { top: 24, left: Math.max(16, Math.round((vw - popupW) / 2)) };
  }
  if (!highlight) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const vh = window.innerHeight;
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
