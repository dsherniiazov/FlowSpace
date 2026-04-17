export type TutorialStepTrigger =
  | "click-ok"
  | "interact"
  | "commit"
  | "timer"
  | "edge-inflow"
  | "modal-close"
  | "node-deleted"
  | "node-added"
  | "comment-saved";

export type TutorialStep = {
  id: string;
  targetSelector: string;
  instruction: string;
  trigger: TutorialStepTrigger;
  interactEvent?: string;
  repeatCount?: number;
  skipPopup?: boolean;
  delayMs?: number;
  highlightBetween?: { left: string; right: string };
  highlightTopOffset?: number;
  highlightSelector?: string;
  popupPlacement?: "top";
  noHighlight?: boolean;
  extraHighlightSelectors?: string[];
  shortcutHint?: string;
};

export type TutorialLesson = {
  id: string;
  title: string;
  steps: TutorialStep[];
};
