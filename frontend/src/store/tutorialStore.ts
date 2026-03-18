import { create } from "zustand";

export type TutorialStep = {
  id: string;
  /** CSS selector for the element to highlight */
  targetSelector: string;
  /** Short instruction shown in the popup */
  instruction: string;
  /**
   * How to detect the user completed this step:
   * - "click-ok": advance when user clicks OK in the popup
   * - "interact": advance on a DOM event (interactEvent) on the target
   * - "commit": advance when the input inside target is changed AND confirmed (Enter/blur)
   * - "timer": auto-advance after delayMs
   * - "edge-inflow": advance when an inflow edge is created (checked via store)
   * - "modal-close": advance when a modal (targetSelector) disappears from the DOM
   * - "node-deleted": advance when the node count decreases
   * - "node-added": advance when the node count increases
   * - "comment-saved": advance when the comment entry overlay disappears
   */
  trigger: "click-ok" | "interact" | "commit" | "timer" | "edge-inflow" | "modal-close" | "node-deleted" | "node-added" | "comment-saved";
  interactEvent?: string;
  /** If true, skip the OK popup and go straight to highlight+interact mode */
  skipPopup?: boolean;
  /** Delay in ms after the interaction event before advancing to the next step */
  delayMs?: number;
  /** Compute highlight rect as gap between two elements */
  highlightBetween?: { left: string; right: string };
  /** Offset the top of the highlight rect */
  highlightTopOffset?: number;
};

export type TutorialLesson = {
  id: string;
  title: string;
  steps: TutorialStep[];
};

type TutorialState = {
  active: boolean;
  lessonId: string | null;
  stepIndex: number;
  popupVisible: boolean;

  lessons: TutorialLesson[];

  startLesson: (lessonId: string) => void;
  dismissPopup: () => void;
  completeStep: () => void;
  finishLesson: () => void;
  reset: () => void;
};

// ─── Simulation lesson ───

const SIMULATION_LESSON: TutorialLesson = {
  id: "simulation",
  title: "Simulation",
  steps: [
    {
      id: "move-node",
      targetSelector: '[data-tutorial="canvas"]',
      instruction: "Try dragging any node on the canvas to move it around.",
      trigger: "interact",
      interactEvent: "pointerup",
      delayMs: 1000,
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "change-steps",
      targetSelector: '[data-tutorial="steps"]',
      instruction:
        "Change the Steps value (e.g. 200), then press Enter or click outside the field to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "change-dt",
      targetSelector: '[data-tutorial="dt"]',
      instruction:
        "Change the dt value (e.g. 0.5), then press Enter or click outside the field to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "run-simulation",
      targetSelector: '[data-tutorial="run-simulation"]',
      instruction: 'Click the "Run simulation" button to start the simulation.',
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "use-timeline",
      targetSelector: '[data-tutorial="timeline"]',
      instruction:
        "Drag the timeline slider to scrub through the simulation results.",
      trigger: "interact",
      interactEvent: "input",
      skipPopup: true,
    },
  ],
};

// ─── Editor lesson ───

const EDITOR_LESSON: TutorialLesson = {
  id: "editor",
  title: "Editor",
  steps: [
    {
      id: "rename-system",
      targetSelector: '[data-tutorial="system-title"]',
      instruction:
        "Give your system a name. Type a new title, then press Enter or click outside to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "save-system",
      targetSelector: '[data-tutorial="save-system"]',
      instruction: 'Click "Save system" to save your system.',
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "add-stock",
      targetSelector: '[data-tutorial="add-stock"]',
      instruction: 'Click "+ Stock" to create a new stock node on the canvas.',
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "select-stock",
      targetSelector: '[data-tutorial="canvas"]',
      instruction: "Click on the stock node you just created to select it.",
      trigger: "interact",
      interactEvent: "pointerdown",
      skipPopup: true,
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "rename-stock",
      targetSelector: '[data-tutorial="node-name"]',
      instruction:
        "Rename the stock node. Change the name, then press Enter or click outside to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "change-quantity",
      targetSelector: '[data-tutorial="node-quantity"]',
      instruction:
        "Set the stock quantity. Enter a value, then press Enter or click outside to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "change-color",
      targetSelector: '[data-tutorial="stock-color"]',
      instruction: "Pick a color for the stock by clicking one of the color swatches.",
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "add-flow",
      targetSelector: '[data-tutorial="add-flow"]',
      instruction: 'Click "+ Flow" to add a flow node.',
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "select-flow",
      targetSelector: '[data-tutorial="canvas"]',
      instruction: "Click on the flow node you just created to select it.",
      trigger: "interact",
      interactEvent: "pointerdown",
      skipPopup: true,
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "change-bottleneck",
      targetSelector: '[data-tutorial="node-bottleneck"]',
      instruction:
        "Set the flow bottleneck value. Enter a number, then press Enter or click outside to apply.",
      trigger: "commit",
      skipPopup: true,
    },
    {
      id: "connect-inflow",
      targetSelector: '[data-tutorial="canvas"]',
      instruction:
        "Connect the flow to the stock as an inflow: drag from the flow\u2019s output handle to the stock\u2019s input handle.",
      trigger: "edge-inflow",
      skipPopup: true,
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "run-sim",
      targetSelector: '[data-tutorial="run-simulation"]',
      instruction: 'Click "Run simulation" so the chart has data to display.',
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "show-chart",
      targetSelector: '[data-tutorial="chart"]',
      instruction: "This is the simulation chart — it shows all variables over time.",
      trigger: "timer",
      delayMs: 3000,
      skipPopup: true,
    },
    {
      id: "deselect-pane",
      targetSelector: '[data-tutorial="canvas"]',
      instruction:
        "Click on an empty area of the canvas to deselect all nodes and see the full chart.",
      trigger: "interact",
      interactEvent: "click",
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
      skipPopup: true,
    },
    {
      id: "expand-chart",
      targetSelector: '[data-tutorial="chart-expand"]',
      instruction: 'Click "Expand" to open the chart in full screen.',
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "close-chart-modal",
      targetSelector: '[data-tutorial="chart-modal"]',
      instruction: "Explore the chart, then close it when you are ready.",
      trigger: "modal-close",
      skipPopup: true,
    },
  ],
};

// ─── Workspace lesson ───

const WORKSPACE_LESSON: TutorialLesson = {
  id: "workspace",
  title: "Workspace",
  steps: [
    {
      id: "create-new-system",
      targetSelector: '[data-tutorial="create-new-system"]',
      instruction: 'Click "Create new system" to start with a fresh canvas.',
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
    {
      id: "delete-node",
      targetSelector: '[data-tutorial="canvas"]',
      instruction:
        "Delete any node: select it and press Backspace/Delete, or use Ctrl+X, or click the Delete button in the editor panel.",
      trigger: "node-deleted",
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "copy-paste-node",
      targetSelector: '[data-tutorial="canvas"]',
      instruction:
        "Copy and paste a node: select it and press Ctrl+C then Ctrl+V, or click the Copy button in the editor panel.",
      trigger: "node-added",
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "add-comment",
      targetSelector: '[data-tutorial="canvas"]',
      instruction:
        "Right-click on the canvas and select \"+ Comment\", then type something and click Save.",
      trigger: "comment-saved",
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "zoom-out",
      targetSelector: '[data-tutorial="zoom-out"]',
      instruction: "Click the zoom-out button to zoom out on the canvas.",
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "zoom-in",
      targetSelector: '[data-tutorial="zoom-in"]',
      instruction: "Now click the zoom-in button to zoom back in.",
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "zoom-reset",
      targetSelector: '[data-tutorial="zoom-reset"]',
      instruction: "Click the reset button to go back to 100% zoom.",
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "lock-canvas",
      targetSelector: '[data-tutorial="lock-canvas"]',
      instruction: "Click the lock button to lock the canvas, then try dragging a node.",
      trigger: "interact",
      interactEvent: "click",
      skipPopup: true,
    },
    {
      id: "drag-locked",
      targetSelector: '[data-tutorial="canvas"]',
      instruction: "Try dragging a node — the canvas is locked so panning is disabled.",
      trigger: "interact",
      interactEvent: "pointerup",
      delayMs: 1000,
      skipPopup: true,
      highlightBetween: {
        left: ".lab-floating-panel-left",
        right: ".lab-floating-panel-right",
      },
      highlightTopOffset: 60,
    },
    {
      id: "export-json",
      targetSelector: '[data-tutorial="export"]',
      instruction: "Click Export to download your system as a JSON file.",
      trigger: "interact",
      interactEvent: "click",
      delayMs: 1000,
      skipPopup: true,
    },
  ],
};

export const useTutorialStore = create<TutorialState>((set, get) => ({
  active: false,
  lessonId: null,
  stepIndex: 0,
  popupVisible: false,
  lessons: [SIMULATION_LESSON, EDITOR_LESSON, WORKSPACE_LESSON],

  startLesson(lessonId: string) {
    const lesson = get().lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    set({ active: true, lessonId, stepIndex: 0, popupVisible: true });
  },

  dismissPopup() {
    const { active } = get();
    if (!active) return;
    const lesson = get().lessons.find((l) => l.id === get().lessonId);
    if (!lesson) return;
    const step = lesson.steps[get().stepIndex];
    if (!step) return;

    if (step.trigger === "click-ok") {
      get().completeStep();
    } else {
      set({ popupVisible: false });
    }
  },

  completeStep() {
    const { lessonId, stepIndex } = get();
    const lesson = get().lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= lesson.steps.length) {
      set({ stepIndex: nextIndex, popupVisible: false });
    } else {
      const nextStep = lesson.steps[nextIndex];
      set({ stepIndex: nextIndex, popupVisible: !nextStep.skipPopup });
    }
  },

  finishLesson() {
    set({ active: false, lessonId: null, stepIndex: 0, popupVisible: false });
  },

  reset() {
    set({ active: false, lessonId: null, stepIndex: 0, popupVisible: false });
  },
}));
