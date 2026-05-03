import { useEffect, type MutableRefObject } from "react";

import { useTutorialStore } from "../../../store/tutorialStore";
import type { LabNavigationState, LabTaskContext } from "../types";
import { buildSaveSignature } from "../utils";

type UseLabNavigationStateArgs = {
  navigationState: unknown;
  loadedSystemGraphIdRef: MutableRefObject<number | null>;
  loadGraphJson: (graph: Record<string, unknown>) => void;
  setActiveSystemId: (id: number | null) => void;
  setLessonTaskContext: (context: LabTaskContext | null) => void;
  setTaskModalOpen: (isOpen: boolean) => void;
  setLastSavedSignature: (signature: string | null) => void;
  setTitle: (title: string) => void;
  setReviewingAsTeacher: (value: boolean) => void;
};

export function useLabNavigationState({
  navigationState,
  loadedSystemGraphIdRef,
  loadGraphJson,
  setActiveSystemId,
  setLessonTaskContext,
  setTaskModalOpen,
  setLastSavedSignature,
  setTitle,
  setReviewingAsTeacher,
}: UseLabNavigationStateArgs): void {
  useEffect(() => {
    let state = (navigationState ?? {}) as LabNavigationState;
    const tutorialState = useTutorialStore.getState();

    if (tutorialState.active && tutorialState.cachedLabState && !state.taskContext) {
      const cached = tutorialState.cachedLabState as LabNavigationState;
      if (cached.taskContext) state = { ...state, taskContext: cached.taskContext };
    }

    if (state.taskContext) {
      useTutorialStore.getState().setCachedLabState(state);
    }

    if (typeof state.systemId === "number") {
      setActiveSystemId(state.systemId);
      if (state.systemGraph && typeof state.systemGraph === "object") {
        loadGraphJson(state.systemGraph);
        loadedSystemGraphIdRef.current = state.systemId;
        const stateTitle = typeof state.systemTitle === "string" ? state.systemTitle : "";
        setLastSavedSignature(buildSaveSignature(stateTitle, state.systemGraph));
      } else {
        loadedSystemGraphIdRef.current = null;
      }
    } else {
      loadedSystemGraphIdRef.current = null;
      setLastSavedSignature(null);
    }

    const taskContext = readTaskContext(state.taskContext);
    setLessonTaskContext(taskContext);
    setTaskModalOpen(false);

    if (taskContext) startTutorialForTask(taskContext.taskTitle);
    if (typeof state.systemTitle === "string" && state.systemTitle.trim()) setTitle(state.systemTitle);
    if (state.reviewing === true) setReviewingAsTeacher(true);
  }, [
    navigationState,
    loadedSystemGraphIdRef,
    loadGraphJson,
    setActiveSystemId,
    setLessonTaskContext,
    setTaskModalOpen,
    setLastSavedSignature,
    setTitle,
    setReviewingAsTeacher,
  ]);
}

function readTaskContext(context: LabNavigationState["taskContext"]): LabTaskContext | null {
  if (
    context &&
    typeof context.taskId === "number" &&
    typeof context.lessonId === "number" &&
    typeof context.taskTitle === "string" &&
    typeof context.taskDescription === "string"
  ) {
    return {
      taskId: context.taskId,
      lessonId: context.lessonId,
      taskTitle: context.taskTitle,
      taskDescription: context.taskDescription,
    };
  }

  return null;
}

function startTutorialForTask(taskTitle: string): void {
  if (taskTitle === "Simulation") useTutorialStore.getState().startLesson("simulation");
  else if (taskTitle === "Editor") useTutorialStore.getState().startLesson("editor");
  else if (taskTitle === "Workspace") useTutorialStore.getState().startLesson("workspace");
}
