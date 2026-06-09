import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Edge, Node } from "reactflow";

import {
  createSystem,
  markSystemReviewed,
  submitSystemForReview,
  updateSystem,
} from "../../../features/systems/api";
import type { FeedbackLoop } from "../../../store/labStore";
import type { RunStep, SystemModel } from "../../../types/api";
import { graphJsonForPersistence, type LabGraphJson } from "../persistence";
import type { LabTaskContext } from "../types";
import { buildSaveSignature, normalizeTitle } from "../utils";

type UseLabSystemPersistenceArgs = {
  userId: number | null;
  title: string;
  activeSystemId: number | null;
  lessonTaskContext: LabTaskContext | null;
  systems: SystemModel[] | undefined;
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  simulationSteps: RunStep[];
  steps: number;
  dt: number;
  algorithm: "euler_v2" | "rk4_v2";
  sliderIndex: number;
  loadedSystemGraphIdRef: MutableRefObject<number | null>;
  toGraphJson: () => Record<string, unknown>;
  setActiveSystemId: (id: number | null) => void;
  setSaveAttempted: (attempted: boolean) => void;
  setReviewModalOpen: (isOpen: boolean) => void;
  setReviewingAsTeacher: (isReviewing: boolean) => void;
};

export function useLabSystemPersistence({
  userId,
  title,
  activeSystemId,
  lessonTaskContext,
  systems,
  nodes,
  edges,
  feedbackLoops,
  simulationSteps,
  steps,
  dt,
  algorithm,
  sliderIndex,
  loadedSystemGraphIdRef,
  toGraphJson,
  setActiveSystemId,
  setSaveAttempted,
  setReviewModalOpen,
  setReviewingAsTeacher,
}: UseLabSystemPersistenceArgs) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);

  const titleTrimmed = title.trim();
  const duplicateTitleExists = useMemo(() => {
    if (!userId || !titleTrimmed) return false;
    if (
      activeSystemId !== null &&
      !systems?.some((system) => system.id === activeSystemId && system.owner_id === userId)
    ) {
      return false;
    }

    const current = normalizeTitle(titleTrimmed);
    return (systems ?? []).some(
      (system) =>
        system.owner_id === userId &&
        system.id !== activeSystemId &&
        normalizeTitle(system.title) === current,
    );
  }, [systems, titleTrimmed, userId, activeSystemId]);

  const saveBlockedReason = useMemo(() => {
    if (!titleTrimmed) return "System title is required.";
    if (duplicateTitleExists) return "A system with this title already exists.";
    return null;
  }, [titleTrimmed, duplicateTitleExists]);

  const currentSaveSignature = useMemo(
    () => buildSaveSignature(titleTrimmed, toGraphJson()),
    [titleTrimmed, nodes, edges, feedbackLoops, simulationSteps, steps, dt, algorithm, toGraphJson],
  );
  const hasUnsavedChanges = lastSavedSignature === null || currentSaveSignature !== lastSavedSignature;
  const saveDisabledNoChanges = lastSavedSignature !== null && !hasUnsavedChanges;

  const buildGraphJsonForPersistence = useCallback(
    () => graphJsonForPersistence(toGraphJson() as LabGraphJson, simulationSteps, sliderIndex),
    [toGraphJson, simulationSteps, sliderIndex],
  );

  const persistCurrentSystemToServer = useCallback(async (): Promise<SystemModel> => {
    if (!userId) throw new Error("No user id");
    if (!titleTrimmed) throw new Error("System title is required.");
    if (duplicateTitleExists) throw new Error("A system with this title already exists.");

    const graph = buildGraphJsonForPersistence();
    if (activeSystemId) {
      const payload: {
        title: string;
        graph_json: typeof graph;
        lesson_id?: number | null;
      } = { title: titleTrimmed, graph_json: graph };
      if (lessonTaskContext) payload.lesson_id = lessonTaskContext.lessonId;
      return updateSystem(activeSystemId, payload);
    }

    return createSystem({
      title: titleTrimmed,
      graph_json: graph,
      lesson_id: lessonTaskContext?.lessonId ?? null,
    });
  }, [
    userId,
    titleTrimmed,
    duplicateTitleExists,
    buildGraphJsonForPersistence,
    activeSystemId,
    lessonTaskContext,
  ]);

  const saveMutation = useMutation({
    mutationFn: persistCurrentSystemToServer,
    onSuccess: (saved) => {
      setActiveSystemId(saved.id);
      loadedSystemGraphIdRef.current = saved.id;
      setSaveAttempted(false);
      const savedGraph =
        saved.graph_json && typeof saved.graph_json === "object"
          ? saved.graph_json
          : toGraphJson();
      setLastSavedSignature(buildSaveSignature(String(saved.title ?? titleTrimmed), savedGraph));
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });

  const submitForReviewMutation = useMutation({
    mutationFn: async (systemId: number) => submitSystemForReview(systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["pending-review-systems"] });
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (payload: { systemId: number; comment: string }) => {
      const graph = buildGraphJsonForPersistence() as Record<string, unknown>;
      await updateSystem(payload.systemId, { title: titleTrimmed, graph_json: graph });
      return markSystemReviewed(payload.systemId, payload.comment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-review-systems"] });
      queryClient.invalidateQueries({ queryKey: ["systems"] });
      setReviewModalOpen(false);
      setReviewingAsTeacher(false);
      navigate("/app/pending-review");
    },
  });

  function handleSaveSystem(): void {
    if (saveDisabledNoChanges) return;
    setSaveAttempted(true);
    if (saveBlockedReason) return;
    saveMutation.mutate();
  }

  function handleSubmitForReview(): void {
    if (submitForReviewMutation.isPending || saveMutation.isPending) return;
    if (!activeSystemId || hasUnsavedChanges) {
      setSaveAttempted(true);
      if (saveBlockedReason) return;
      saveMutation.mutateAsync().then((saved) => { submitForReviewMutation.mutate(saved.id); }).catch(() => {});
      return;
    }
    submitForReviewMutation.mutate(activeSystemId);
  }

  async function submitTeacherReview(comment: string): Promise<void> {
    if (!activeSystemId) return;
    setSaveAttempted(true);
    if (saveBlockedReason) {
      throw new Error(saveBlockedReason);
    }
    await markReviewedMutation.mutateAsync({ systemId: activeSystemId, comment });
  }

  return {
    titleTrimmed,
    saveBlockedReason,
    saveDisabledNoChanges,
    saveButtonDisabled: saveMutation.isPending || saveDisabledNoChanges,
    isSaveError: saveMutation.isError,
    isSavePending: saveMutation.isPending,
    isSubmitForReviewPending: submitForReviewMutation.isPending,
    isSubmitForReviewSuccess: submitForReviewMutation.isSuccess,
    isMarkReviewedPending: markReviewedMutation.isPending,
    setLastSavedSignature,
    handleSaveSystem,
    handleSubmitForReview,
    submitTeacherReview,
  };
}
