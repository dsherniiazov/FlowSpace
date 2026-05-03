import { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "reactflow";

import type {
  BalancingSubmitPayload,
  ReinforcingSubmitPayload,
} from "../../../components/FeedbackLoopModal";
import type {
  CreateBalancingFeedbackLoopPayload,
  CreateReinforcingFeedbackLoopPayload,
  FeedbackLoop,
  UpdateBalancingFeedbackLoopPayload,
} from "../../../store/labStore";
import type { FeedbackLoopResult } from "../../../store/lab/domainTypes";
import {
  asNumber,
  collectConnectedFlows,
  isFlowNode,
  isStockNode,
  proposeBalancingLoopPositions,
  proposeCorrectivePosition,
  proposeReinforcingLoopPositions,
} from "../utils";

type FeedbackLoopEditorArgs = {
  nodes: Node[];
  edges: Edge[];
  nodesById: Map<string, Node>;
  feedbackLoops: FeedbackLoop[];
  lockEditing: boolean;
  createBalancingFeedbackLoop: (payload: CreateBalancingFeedbackLoopPayload) => FeedbackLoopResult;
  createReinforcingFeedbackLoop: (payload: CreateReinforcingFeedbackLoopPayload) => FeedbackLoopResult;
  updateBalancingFeedbackLoop: (payload: UpdateBalancingFeedbackLoopPayload) => FeedbackLoopResult;
  deleteFeedbackLoop: (id: string) => FeedbackLoopResult;
};

export function useFeedbackLoopEditor({
  nodes,
  edges,
  nodesById,
  feedbackLoops,
  lockEditing,
  createBalancingFeedbackLoop,
  createReinforcingFeedbackLoop,
  updateBalancingFeedbackLoop,
  deleteFeedbackLoop,
}: FeedbackLoopEditorArgs) {
  const [createFeedbackLoopStockId, setCreateFeedbackLoopStockId] = useState<string | null>(null);
  const [editingFeedbackLoopId, setEditingFeedbackLoopId] = useState<string | null>(null);

  const editingFeedbackLoop = useMemo<FeedbackLoop | null>(
    () => feedbackLoops.find((item) => item.id === editingFeedbackLoopId) ?? null,
    [feedbackLoops, editingFeedbackLoopId],
  );

  const activeFeedbackLoopStockId = editingFeedbackLoop?.stockId ?? createFeedbackLoopStockId;
  const activeFeedbackLoopStockNode = useMemo(() => {
    if (!activeFeedbackLoopStockId) return null;
    const node = nodesById.get(activeFeedbackLoopStockId);
    return isStockNode(node) ? node : null;
  }, [activeFeedbackLoopStockId, nodesById]);

  const feedbackLoopFlowOptions = useMemo(() => {
    if (!activeFeedbackLoopStockNode) return [];
    return collectConnectedFlows(activeFeedbackLoopStockNode.id, nodesById, edges);
  }, [activeFeedbackLoopStockNode, nodesById, edges]);

  const feedbackLoopList = useMemo(
    () =>
      feedbackLoops.map((loop) => {
        const fallbackLabel =
          loop.type === "balancing"
            ? String(nodesById.get(loop.correctiveNodeId)?.data?.label ?? "Corrective Action")
            : String(nodesById.get(loop.multiplierNodeId)?.data?.label ?? "Multiplier");

        return {
          ...loop,
          stockLabel: String(nodesById.get(loop.stockId)?.data?.label ?? loop.stockId),
          flowLabel: String(nodesById.get(loop.controlledFlowId)?.data?.label ?? loop.controlledFlowId),
          loopLabel: (loop.name ?? "").trim() || fallbackLabel,
        };
      }),
    [feedbackLoops, nodesById],
  );

  const feedbackLoopModalInitialTab = useMemo<"balancing" | "reinforcing" | undefined>(
    () => editingFeedbackLoop?.type,
    [editingFeedbackLoop],
  );
  const feedbackLoopModalMode: "edit" | "create" = editingFeedbackLoop ? "edit" : "create";

  const feedbackLoopModalInitialBalancingValues = useMemo<Partial<BalancingSubmitPayload> | undefined>(() => {
    if (!editingFeedbackLoop || editingFeedbackLoop.type !== "balancing") return undefined;

    return {
      boundaryType: editingFeedbackLoop.boundaryType,
      goalValue: editingFeedbackLoop.goalValue,
      adjustmentTime: editingFeedbackLoop.adjustmentTime,
      controlledFlowId: editingFeedbackLoop.controlledFlowId,
      operation: editingFeedbackLoop.operation,
      delayEnabled: editingFeedbackLoop.delayEnabled,
      delaySteps: editingFeedbackLoop.delaySteps,
      name: editingFeedbackLoop.name ?? "",
      correctiveLabel: String(nodesById.get(editingFeedbackLoop.correctiveNodeId)?.data?.label ?? "Corrective Action"),
    };
  }, [editingFeedbackLoop, nodesById]);

  const feedbackLoopModalInitialReinforcingValues = useMemo<Partial<ReinforcingSubmitPayload> | undefined>(() => {
    if (!editingFeedbackLoop || editingFeedbackLoop.type !== "reinforcing") return undefined;

    return {
      k: editingFeedbackLoop.k,
      controlledFlowId: editingFeedbackLoop.controlledFlowId,
      polarity: editingFeedbackLoop.polarity,
      delayEnabled: editingFeedbackLoop.delayEnabled,
      delaySteps: editingFeedbackLoop.delaySteps,
      growthLimit: editingFeedbackLoop.growthLimitNodeId
        ? asNumber(nodesById.get(editingFeedbackLoop.growthLimitNodeId)?.data?.quantity, 0)
        : undefined,
      clampNonNegative: editingFeedbackLoop.clampNonNegative,
      name: editingFeedbackLoop.name ?? "",
      multiplierLabel: normalizeMultiplierLabel(
        nodesById.get(editingFeedbackLoop.multiplierNodeId)?.data?.label,
      ),
    };
  }, [editingFeedbackLoop, nodesById]);

  useEffect(() => {
    if (createFeedbackLoopStockId && !nodesById.has(createFeedbackLoopStockId)) {
      setCreateFeedbackLoopStockId(null);
    }
  }, [createFeedbackLoopStockId, nodesById]);

  useEffect(() => {
    if (editingFeedbackLoopId && !feedbackLoops.some((loop) => loop.id === editingFeedbackLoopId)) {
      setEditingFeedbackLoopId(null);
    }
  }, [editingFeedbackLoopId, feedbackLoops]);

  useEffect(() => {
    if (!lockEditing) return;
    setCreateFeedbackLoopStockId(null);
    setEditingFeedbackLoopId(null);
  }, [lockEditing]);

  function resetFeedbackLoopEditor(): void {
    setCreateFeedbackLoopStockId(null);
    setEditingFeedbackLoopId(null);
  }

  function closeFeedbackLoopModal(): void {
    resetFeedbackLoopEditor();
  }

  function handleCreateFeedbackLoop(nodeId: string): void {
    setEditingFeedbackLoopId(null);
    setCreateFeedbackLoopStockId(nodeId);
  }

  function handleEditFeedbackLoop(loopId: string): void {
    setCreateFeedbackLoopStockId(null);
    setEditingFeedbackLoopId(loopId);
  }

  function handleDeleteFeedbackLoop(loopId: string): FeedbackLoopResult {
    const result = deleteFeedbackLoop(loopId);
    if (result.ok) setEditingFeedbackLoopId((prev) => (prev === loopId ? null : prev));
    return result;
  }

  function submitBalancingLoop(payload: BalancingSubmitPayload): FeedbackLoopResult {
    if (!activeFeedbackLoopStockNode) {
      return { ok: false, error: "Selected stock is no longer available." };
    }

    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) {
      return { ok: false, error: "Selected controlled flow is not available." };
    }

    if (editingFeedbackLoop?.type === "balancing") {
      const result = updateBalancingFeedbackLoop({
        id: editingFeedbackLoop.id,
        boundaryType: payload.boundaryType,
        goalValue: payload.goalValue,
        adjustmentTime: payload.adjustmentTime,
        operation: payload.operation,
        delayEnabled: payload.delayEnabled,
        delaySteps: payload.delaySteps,
        controlledFlowId: payload.controlledFlowId,
        name: payload.name,
        correctiveLabel: payload.correctiveLabel,
        correctivePosition: proposeCorrectivePosition(controlledFlow),
      });
      if (result.ok) setEditingFeedbackLoopId(null);
      return result;
    }

    const result = createBalancingFeedbackLoop({
      stockId: activeFeedbackLoopStockNode.id,
      controlledFlowId: payload.controlledFlowId,
      boundaryType: payload.boundaryType,
      goalValue: payload.goalValue,
      adjustmentTime: payload.adjustmentTime,
      operation: payload.operation,
      delayEnabled: payload.delayEnabled,
      delaySteps: payload.delaySteps,
      clampNonNegative: true,
      name: payload.name,
      correctiveLabel: payload.correctiveLabel,
      positions: proposeBalancingLoopPositions(activeFeedbackLoopStockNode, controlledFlow, nodes),
    });

    if (result.ok) setCreateFeedbackLoopStockId(null);
    return result;
  }

  function submitReinforcingLoop(payload: ReinforcingSubmitPayload): FeedbackLoopResult {
    if (!activeFeedbackLoopStockNode) {
      return { ok: false, error: "Selected stock is no longer available." };
    }

    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) {
      return { ok: false, error: "Selected controlled flow is not available." };
    }

    if (editingFeedbackLoop?.type === "reinforcing") {
      const deleteResult = deleteFeedbackLoop(editingFeedbackLoop.id);
      if (!deleteResult.ok) return deleteResult;
    }

    const result = createReinforcingFeedbackLoop({
      stockId: activeFeedbackLoopStockNode.id,
      controlledFlowId: payload.controlledFlowId,
      k: payload.k,
      polarity: payload.polarity,
      delayEnabled: payload.delayEnabled,
      delaySteps: payload.delaySteps,
      growthLimit: payload.growthLimit,
      clampNonNegative: payload.clampNonNegative,
      name: payload.name,
      multiplierLabel: payload.multiplierLabel,
      positions: proposeReinforcingLoopPositions(
        activeFeedbackLoopStockNode,
        controlledFlow,
        nodes,
        payload.growthLimit !== undefined,
      ),
    });

    if (result.ok) resetFeedbackLoopEditor();
    return result;
  }

  return {
    activeFeedbackLoopStockNode,
    feedbackLoopFlowOptions,
    feedbackLoopList,
    feedbackLoopModalMode,
    feedbackLoopModalInitialTab,
    feedbackLoopModalInitialBalancingValues,
    feedbackLoopModalInitialReinforcingValues,
    closeFeedbackLoopModal,
    resetFeedbackLoopEditor,
    handleCreateFeedbackLoop,
    handleEditFeedbackLoop,
    handleDeleteFeedbackLoop,
    submitBalancingLoop,
    submitReinforcingLoop,
  };
}

function normalizeMultiplierLabel(value: unknown): string {
  const label = String(value ?? "Multiplier");
  return label === "(R)" ? "Multiplier" : label;
}
