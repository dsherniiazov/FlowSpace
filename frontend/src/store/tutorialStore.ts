import { create } from "zustand";

import { TUTORIAL_LESSONS } from "./tutorial/lessons";
import { TutorialLesson, TutorialStep, TutorialStepTrigger } from "./tutorial/types";

export type { TutorialLesson, TutorialStep, TutorialStepTrigger };

type TutorialState = {
  active: boolean;
  lessonId: string | null;
  stepIndex: number;
  popupVisible: boolean;

  lessons: TutorialLesson[];

  cachedLabState: unknown;
  setCachedLabState: (state: unknown) => void;

  onFinishCallback: (() => void) | null;
  setOnFinishCallback: (cb: (() => void) | null) => void;

  overlaySuppressed: boolean;
  setOverlaySuppressed: (v: boolean) => void;

  startLesson: (lessonId: string) => void;
  dismissPopup: () => void;
  completeStep: () => void;
  previousStep: () => void;
  finishLesson: () => void;
  reset: () => void;
};

const INITIAL_STATE = {
  active: false,
  lessonId: null,
  stepIndex: 0,
  popupVisible: false,
  cachedLabState: null,
} as const;

export const useTutorialStore = create<TutorialState>((set, get) => ({
  ...INITIAL_STATE,
  lessons: TUTORIAL_LESSONS,
  onFinishCallback: null,
  overlaySuppressed: false,

  setCachedLabState(state) {
    set({ cachedLabState: state });
  },
  setOnFinishCallback(cb) {
    set({ onFinishCallback: cb });
  },
  setOverlaySuppressed(v) {
    set({ overlaySuppressed: v });
  },

  startLesson(lessonId: string) {
    const lesson = get().lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const current = get();
    if (current.active && current.lessonId === lessonId) return;
    set({ active: true, lessonId, stepIndex: 0, popupVisible: false });
  },

  dismissPopup() {
    if (!get().active) return;
    set({ popupVisible: false });
  },

  completeStep() {
    const { lessonId, stepIndex, lessons } = get();
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    set({ stepIndex: stepIndex + 1, popupVisible: false });
  },

  previousStep() {
    const { active, stepIndex } = get();
    if (!active || stepIndex <= 0) return;
    set({ stepIndex: stepIndex - 1, popupVisible: false });
  },

  finishLesson() {
    set({ ...INITIAL_STATE });
  },

  reset() {
    set({ ...INITIAL_STATE });
  },
}));
