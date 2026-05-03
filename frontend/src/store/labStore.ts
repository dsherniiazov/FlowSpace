import { create } from "zustand";
import type { EdgeChange, NodeChange } from "reactflow";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";

import type {
  BalancingFeedbackLoop,
  FeedbackLoopResult,
} from "./lab/domainTypes";
import { attachLabHistory } from "./lab/history";
import {
  ControlOp,
  canConnect,
  clampFlowNonNegative,
  edgeWeightByKind,
  feedbackLoopEdgeOverlay,
  generateEdgeId,
  inferEdgeKind,
  isControlEdge,
  isControlOp,
  nodeKind,
  opLabel,
} from "./lab/graph";
import {
  correctiveExpression,
  discrepancyExpression,
  rebuildFlowExpression,
} from "./lab/feedbackExpressions";
import { INITIAL_EDGES, buildInitialNodes } from "./lab/initialGraph";
import {
  buildBalancingLoopElements,
  buildReinforcingLoopElements,
  createConstantNode,
  createFlowNode,
  createNodeAtPosition,
  createStockNode,
  createVariableNode,
  resolveBaseFlowExpression,
} from "./lab/nodeFactories";
import {
  deserializeGraph,
  sanitizeLoopCollection,
  serializeGraph,
} from "./lab/serialization";
import {
  filterChanges,
  readLessonUi,
  readSavedSimulation,
  rebuildFlowData,
} from "./lab/storeHelpers";
import type { LabState } from "./lab/storeTypes";

export type {
  BalancingFeedbackLoop,
  BoundaryType,
  CreateBalancingFeedbackLoopPayload,
  CreateReinforcingFeedbackLoopPayload,
  FeedbackLoop,
  LoopOperation,
  ReinforcingFeedbackLoop,
  ReinforcingPolarity,
  UpdateBalancingFeedbackLoopPayload,
} from "./lab/domainTypes";
export type { ControlOp } from "./lab/graph";
export { CONTROL_OPS, feedbackLoopEdgeOverlay, isValidLabConnection } from "./lab/graph";

export type CreateBalancingFeedbackLoopResult = FeedbackLoopResult;

const HISTORY_LIMIT = 50;
const HISTORY_DEBOUNCE_MS = 250;
const EDIT_LOCKED_ERROR: FeedbackLoopResult = {
  ok: false,
  error: "Editing is locked while simulation is running.",
};

export const useLabStore = create<LabState>((set, get) => ({
  nodes: buildInitialNodes(),
  edges: INITIAL_EDGES,
  feedbackLoops: [],
  lessonUi: null,
  activeSystemId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  steps: 60,
  dt: 1,
  algorithm: "euler_v2",
  simulationSteps: [],
  sliderIndex: 0,
  lockEditing: false,
  past: [],
  future: [],
  isReplayingHistory: false,

  undo: () => {
    const { past, future, nodes, edges, feedbackLoops } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      isReplayingHistory: true,
      past: past.slice(0, -1),
      future: [{ nodes, edges, feedbackLoops }, ...future].slice(0, HISTORY_LIMIT),
      nodes: previous.nodes,
      edges: previous.edges,
      feedbackLoops: previous.feedbackLoops,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    queueMicrotask(() => set({ isReplayingHistory: false }));
  },
  redo: () => {
    const { past, future, nodes, edges, feedbackLoops } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      isReplayingHistory: true,
      past: [...past, { nodes, edges, feedbackLoops }].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      nodes: next.nodes,
      edges: next.edges,
      feedbackLoops: next.feedbackLoops,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    queueMicrotask(() => set({ isReplayingHistory: false }));
  },
  resetHistory: () => set({ past: [], future: [] }),

  setSteps: (value) => set({ steps: Math.max(1, value) }),
  setDt: (value) => set({ dt: Math.max(0.001, value) }),
  setAlgorithm: (value) => set({ algorithm: value }),
  setSliderIndex: (value) => set({ sliderIndex: Math.max(0, value) }),
  setLockEditing: (value) => set({ lockEditing: value }),

  onNodesChange: (changes) => {
    if (get().lockEditing) return;
    const currentNodes = get().nodes;
    const protectedIds = new Set(
      currentNodes
        .filter((node) => node.data?.feedbackLoopPersistent === true)
        .map((node) => node.id),
    );
    const allowed = new Set(["dimensions", "position", "select"]);
    const filtered = filterChanges(changes as Array<NodeChange & { id?: string }>, protectedIds, allowed);
    const nextNodes = applyNodeChanges(filtered, currentNodes).map((node) =>
      node.data?.feedbackLoopPersistent === true ? { ...node, hidden: false } : node,
    );
    set({
      nodes: nextNodes,
      feedbackLoops: sanitizeLoopCollection(get().feedbackLoops, nextNodes, get().edges),
    });
  },

  onEdgesChange: (changes) => {
    if (get().lockEditing) return;
    const currentEdges = get().edges;
    const protectedIds = new Set(
      currentEdges
        .filter((edge) => edge.data?.feedbackLoopPersistent === true)
        .map((edge) => edge.id),
    );
    const filtered = filterChanges(changes as Array<EdgeChange & { id?: string }>, protectedIds);
    const nextEdges = applyEdgeChanges(filtered, currentEdges).map((edge) =>
      edge.data?.feedbackLoopPersistent === true ? { ...edge, hidden: false } : edge,
    );
    const selectedEdgeId = get().selectedEdgeId;
    set({
      edges: nextEdges,
      selectedEdgeId:
        selectedEdgeId && nextEdges.some((edge) => edge.id === selectedEdgeId)
          ? selectedEdgeId
          : null,
      feedbackLoops: sanitizeLoopCollection(get().feedbackLoops, get().nodes, nextEdges),
    });
  },

  onConnect: (connection) => {
    if (get().lockEditing) return;
    const sourceNode = get().nodes.find((node) => node.id === connection.source);
    const targetNode = get().nodes.find((node) => node.id === connection.target);
    if (!canConnect(sourceNode, targetNode)) return;
    const kind = inferEdgeKind(sourceNode, targetNode);
    const control = isControlEdge(sourceNode, targetNode);
    const sourceOpRaw = String(sourceNode?.data?.op ?? "");
    const op: ControlOp = control && isControlOp(sourceOpRaw) ? (sourceOpRaw as ControlOp) : "add";
    const label = kind === "outflow" ? "-" : kind === "inflow" ? "+" : control ? opLabel(op) : "";
    const loopEdge = feedbackLoopEdgeOverlay(sourceNode, targetNode, get().feedbackLoops);
    set({
      edges: addEdge(
        {
          ...connection,
          id: generateEdgeId(get().edges),
          label,
          data: { kind, weight: edgeWeightByKind(kind), op, ...loopEdge },
        },
        get().edges,
      ),
    });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setActiveSystemId: (id) => set({ activeSystemId: id }),

  patchNodeData: (nodeId, partialData) => {
    if (get().lockEditing) return;
    set((state) => {
      const target = state.nodes.find((node) => node.id === nodeId);
      if (!target) return state;
      let nextFeedbackLoops = state.feedbackLoops;
      const nextData = { ...(target.data ?? {}), ...partialData };
      if (nodeKind(target) === "flow") {
        if (nextData.bottleneck !== undefined) {
          nextData.bottleneck = clampFlowNonNegative(nextData.bottleneck);
        }
        if (nextData.quantity !== undefined) {
          nextData.quantity = clampFlowNonNegative(nextData.quantity);
        }
        const hasFlowInputPatch =
          Object.prototype.hasOwnProperty.call(partialData, "bottleneck") ||
          Object.prototype.hasOwnProperty.call(partialData, "quantity");
        const flowLoops = state.feedbackLoops.filter((loop) => loop.controlledFlowId === nodeId);
        if (flowLoops.length > 0 && hasFlowInputPatch) {
          const baseValue = clampFlowNonNegative(
            nextData.bottleneck ??
              nextData.quantity ??
              target.data?.bottleneck ??
              target.data?.quantity ??
              0,
          );
          const nextBaseFlowExpression = String(baseValue);
          nextFeedbackLoops = state.feedbackLoops.map((loop) =>
            loop.controlledFlowId === nodeId ? { ...loop, baseFlowExpression: nextBaseFlowExpression } : loop,
          );
          const loopsForFlow = nextFeedbackLoops.filter((loop) => loop.controlledFlowId === nodeId);
          nextData.baseFlowExpression = nextBaseFlowExpression;
          nextData.expression = rebuildFlowExpression(nextBaseFlowExpression, loopsForFlow);
        }
      }
      const nextNodes = state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: nextData } : node,
      );
      return { nodes: nextNodes, feedbackLoops: nextFeedbackLoops };
    });
  },

  updateSelectedNode: (patch) => {
    if (get().lockEditing) return;
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId) return;
    set((state) => {
      let nextFeedbackLoops = state.feedbackLoops;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== selectedNodeId) return node;
        const nextData = { ...node.data, ...patch };
        if (nodeKind(node) !== "flow") return { ...node, data: nextData };

        if (nextData.bottleneck !== undefined) {
          nextData.bottleneck = clampFlowNonNegative(nextData.bottleneck);
        }
        if (nextData.quantity !== undefined) {
          nextData.quantity = clampFlowNonNegative(nextData.quantity);
        }

        const hasFlowInputPatch =
          Object.prototype.hasOwnProperty.call(patch, "bottleneck") ||
          Object.prototype.hasOwnProperty.call(patch, "quantity");
        const flowLoops = state.feedbackLoops.filter((loop) => loop.controlledFlowId === node.id);
        if (flowLoops.length === 0 || !hasFlowInputPatch) {
          return { ...node, data: nextData };
        }

        const baseValue = clampFlowNonNegative(
          nextData.bottleneck ??
            nextData.quantity ??
            node.data?.bottleneck ??
            node.data?.quantity ??
            0,
        );
        const nextBaseFlowExpression = String(baseValue);
        nextFeedbackLoops = state.feedbackLoops.map((loop) =>
          loop.controlledFlowId === node.id
            ? { ...loop, baseFlowExpression: nextBaseFlowExpression }
            : loop,
        );
        const loopsForFlow = nextFeedbackLoops.filter((loop) => loop.controlledFlowId === node.id);
        nextData.baseFlowExpression = nextBaseFlowExpression;
        nextData.expression = rebuildFlowExpression(nextBaseFlowExpression, loopsForFlow);
        return { ...node, data: nextData };
      });

      return { nodes: nextNodes, feedbackLoops: nextFeedbackLoops };
    });
  },

  updateSelectedEdge: (patch) => {
    if (get().lockEditing) return;
    const selectedEdgeId = get().selectedEdgeId;
    if (!selectedEdgeId) return;
    set({
      edges: get().edges.map((edge) => {
        if (edge.id !== selectedEdgeId) return edge;
        const nextData = { ...(edge.data ?? {}), ...patch };
        const rawOp = String(nextData.op ?? "");
        const nextLabel =
          nextData.kind === "outflow"
            ? "-"
            : nextData.kind === "inflow"
              ? "+"
              : isControlOp(rawOp)
                ? opLabel(rawOp as ControlOp)
                : String(edge.label ?? "");
        return { ...edge, data: nextData, label: nextLabel };
      }),
    });
  },

  setSelectedNodeControlOp: (op) => {
    if (get().lockEditing) return;
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId || !isControlOp(op)) return;
    const selectedNode = get().nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) return;
    const kind = nodeKind(selectedNode);
    if (kind !== "constant" && kind !== "variable") return;

    const nextLabel = opLabel(op);
    set({
      nodes: get().nodes.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, op } } : node,
      ),
      edges: get().edges.map((edge) => {
        if (edge.source !== selectedNodeId) return edge;
        if (edge.data?.feedbackLoop === true) return edge;
        const currentKind = String(edge.data?.kind ?? "neutral");
        if (currentKind === "inflow" || currentKind === "outflow") return edge;
        return { ...edge, label: nextLabel, data: { ...(edge.data ?? {}), op } };
      }),
    });
  },

  addStock: () => {
    if (get().lockEditing) return;
    set({ nodes: [...get().nodes, createStockNode(get().nodes)] });
  },
  addFlow: () => {
    if (get().lockEditing) return;
    set({ nodes: [...get().nodes, createFlowNode(get().nodes)] });
  },
  addConstant: () => {
    if (get().lockEditing) return;
    set({ nodes: [...get().nodes, createConstantNode(get().nodes)] });
  },
  addVariable: () => {
    if (get().lockEditing) return;
    set({ nodes: [...get().nodes, createVariableNode(get().nodes)] });
  },
  addNodeAtPosition: (type, position, extraData) => {
    if (get().lockEditing) return "";
    const node = createNodeAtPosition(get().nodes, type, position, extraData);
    set({ nodes: [...get().nodes, node] });
    return node.id;
  },

  createBalancingFeedbackLoop: (payload) => {
    if (get().lockEditing) return EDIT_LOCKED_ERROR;
    const { nodes: currentNodes, edges: currentEdges, feedbackLoops: currentLoops } = get();

    const stockNode = currentNodes.find((node) => node.id === payload.stockId);
    const flowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);
    if (nodeKind(stockNode) !== "stock") return { ok: false, error: "Selected stock was not found." };
    if (nodeKind(flowNode) !== "flow") return { ok: false, error: "Selected controlled flow was not found." };

    const duplicate = currentLoops.some(
      (loop) =>
        loop.type === "balancing" &&
        loop.stockId === payload.stockId &&
        loop.controlledFlowId === payload.controlledFlowId,
    );
    if (duplicate) {
      return {
        ok: false,
        error:
          "A balancing loop for this stock and flow already exists. Delete it first to create a new one.",
      };
    }

    const baseFlowExpression = resolveBaseFlowExpression(flowNode);
    const elements = buildBalancingLoopElements(currentNodes, currentEdges, payload, baseFlowExpression);
    const nextFlowExpression = rebuildFlowExpression(baseFlowExpression, [
      ...currentLoops.filter((loop) => loop.controlledFlowId === payload.controlledFlowId),
      elements.loop,
    ]);

    const nextNodes = [
      ...currentNodes.map((node) =>
        node.id === payload.controlledFlowId
          ? rebuildFlowData(node, baseFlowExpression, nextFlowExpression)
          : node,
      ),
      elements.goalNode,
      elements.discrepancyNode,
      elements.correctiveNode,
    ];

    const nextEdges = [
      ...currentEdges,
      elements.edgeGoalToDiscrepancy,
      elements.edgeStockToDiscrepancy,
      elements.edgeDiscrepancyToCorrective,
      elements.edgeCorrectiveToFlow,
    ];

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: [...currentLoops, elements.loop],
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: elements.loop.correctiveNodeId,
      selectedEdgeId: null,
    });

    return { ok: true, loopId: elements.loopId };
  },

  createReinforcingFeedbackLoop: (payload) => {
    if (get().lockEditing) return EDIT_LOCKED_ERROR;
    const { nodes: currentNodes, edges: currentEdges, feedbackLoops: currentLoops } = get();

    const stockNode = currentNodes.find((node) => node.id === payload.stockId);
    const flowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);
    if (nodeKind(stockNode) !== "stock") return { ok: false, error: "Selected stock was not found." };
    if (nodeKind(flowNode) !== "flow") return { ok: false, error: "Selected controlled flow was not found." };

    const baseFlowExpression = resolveBaseFlowExpression(flowNode);
    const elements = buildReinforcingLoopElements(currentNodes, currentEdges, payload, baseFlowExpression);
    const nextLoops = [...currentLoops, elements.loop];
    const flowLoops = nextLoops.filter((loop) => loop.controlledFlowId === payload.controlledFlowId);
    const nextFlowExpression = rebuildFlowExpression(baseFlowExpression, flowLoops);

    const nextNodes = [
      ...currentNodes.map((node) =>
        node.id === payload.controlledFlowId
          ? rebuildFlowData(node, baseFlowExpression, nextFlowExpression)
          : node,
      ),
      elements.multiplierNode,
      ...(elements.growthLimitNode ? [elements.growthLimitNode] : []),
      ...(elements.markerNode ? [elements.markerNode] : []),
    ];

    const nextEdges = [
      ...currentEdges,
      elements.edgeStockToMultiplier,
      ...(elements.edgeGrowthLimitToMultiplier ? [elements.edgeGrowthLimitToMultiplier] : []),
      elements.edgeMultiplierToFlow,
    ];

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: nextLoops,
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: elements.loop.multiplierNodeId,
      selectedEdgeId: null,
    });

    return { ok: true, loopId: elements.loopId };
  },

  updateBalancingFeedbackLoop: (payload) => {
    if (get().lockEditing) return EDIT_LOCKED_ERROR;
    const { nodes: currentNodes, edges: currentEdges, feedbackLoops: currentLoops } = get();
    const loop = currentLoops.find((item) => item.id === payload.id);
    if (!loop) return { ok: false, error: "Feedback loop was not found." };
    if (loop.type !== "balancing") return { ok: false, error: "Only balancing loops are editable." };

    const stockNode = currentNodes.find((node) => node.id === loop.stockId);
    const goalNode = currentNodes.find((node) => node.id === loop.goalNodeId);
    const discrepancyNode = currentNodes.find((node) => node.id === loop.discrepancyNodeId);
    const correctiveNode = currentNodes.find((node) => node.id === loop.correctiveNodeId);
    const nextFlowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);
    if (!stockNode || !goalNode || !discrepancyNode || !correctiveNode || !nextFlowNode) {
      return { ok: false, error: "Loop graph elements were not found." };
    }
    if (nodeKind(nextFlowNode) !== "flow") {
      return { ok: false, error: "Selected controlled flow was not found." };
    }

    const duplicate = currentLoops.some(
      (item) =>
        item.id !== loop.id &&
        item.type === "balancing" &&
        item.stockId === loop.stockId &&
        item.controlledFlowId === payload.controlledFlowId,
    );
    if (duplicate) {
      return { ok: false, error: "A balancing loop for this stock and flow already exists." };
    }

    const goalValue = Number.isFinite(Number(payload.goalValue)) ? Number(payload.goalValue) : 0;
    const adjustmentTime = Math.max(0.000001, Number(payload.adjustmentTime) || 1);
    const delayEnabled = payload.delayEnabled === true;
    const delaySteps = Math.max(0, Math.floor(Number(payload.delaySteps) || 0));

    const flowChanged = payload.controlledFlowId !== loop.controlledFlowId;
    const nextBaseFlowExpression = flowChanged
      ? resolveBaseFlowExpression(nextFlowNode)
      : loop.baseFlowExpression;

    const nextLoop: BalancingFeedbackLoop = {
      ...loop,
      boundaryType: payload.boundaryType,
      goalValue,
      adjustmentTime,
      operation: payload.operation,
      delayEnabled,
      delaySteps,
      controlledFlowId: payload.controlledFlowId,
      baseFlowExpression: nextBaseFlowExpression,
    };
    const nextFlowExpression = rebuildFlowExpression(nextBaseFlowExpression, [
      ...currentLoops.filter(
        (item) => item.id !== loop.id && item.controlledFlowId === payload.controlledFlowId,
      ),
      nextLoop,
    ]);

    const nextDiscrepancyExpr = discrepancyExpression(payload.boundaryType, loop.goalNodeId, loop.stockId);
    const nextCorrectiveExpr = correctiveExpression(
      adjustmentTime,
      loop.discrepancyNodeId,
      delayEnabled,
      delaySteps,
    );

    const nextNodes = currentNodes.map((node) => {
      if (node.id === loop.goalNodeId) {
        return {
          ...node,
          data: { ...(node.data ?? {}), quantity: goalValue, expression: String(goalValue) },
        };
      }
      if (node.id === loop.discrepancyNodeId) {
        return { ...node, data: { ...(node.data ?? {}), expression: nextDiscrepancyExpr } };
      }
      if (node.id === loop.correctiveNodeId) {
        return {
          ...node,
          position: payload.correctivePosition ?? node.position,
          data: {
            ...(node.data ?? {}),
            label: (payload.correctiveLabel ?? "").trim() || "Corrective Action",
            expression: nextCorrectiveExpr,
          },
        };
      }
      if (node.id === loop.controlledFlowId && flowChanged) {
        const restoreBase = String(node.data?.baseFlowExpression ?? loop.baseFlowExpression).trim() || "0";
        return {
          ...node,
          data: { ...(node.data ?? {}), baseFlowExpression: restoreBase, expression: restoreBase },
        };
      }
      if (node.id === payload.controlledFlowId) {
        return rebuildFlowData(node, nextBaseFlowExpression, nextFlowExpression);
      }
      return node;
    });

    const correctiveToFlowEdgeId = loop.edgeIds[loop.edgeIds.length - 1] ?? "";
    const nextEdges = currentEdges.map((edge) => {
      if (edge.id !== correctiveToFlowEdgeId) return edge;
      return {
        ...edge,
        target: payload.controlledFlowId,
        label: opLabel(payload.operation),
        data: {
          ...(edge.data ?? {}),
          kind: "neutral",
          weight: 1,
          feedbackLoop: true,
          op: payload.operation,
        },
      };
    });

    const nextLoops = currentLoops.map((item) => {
      if (item.id !== loop.id) return item;
      const trimmedName = (payload.name ?? "").trim();
      return {
        ...nextLoop,
        name: payload.name === undefined ? item.name : trimmedName || undefined,
      };
    });

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: nextLoops,
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: loop.correctiveNodeId,
      selectedEdgeId: null,
    });

    return { ok: true, loopId: loop.id };
  },

  deleteBalancingFeedbackLoop: (id) => {
    if (get().lockEditing) return EDIT_LOCKED_ERROR;
    const { nodes: currentNodes, edges: currentEdges, feedbackLoops: currentLoops, selectedNodeId, selectedEdgeId } = get();
    const loop = currentLoops.find((item) => item.id === id);
    if (!loop) return { ok: false, error: "Feedback loop was not found." };

    const nodesToRemove = new Set(
      loop.type === "balancing"
        ? [loop.goalNodeId, loop.discrepancyNodeId, loop.correctiveNodeId]
        : [loop.multiplierNodeId, ...(loop.growthLimitNodeId ? [loop.growthLimitNodeId] : [])],
    );
    currentNodes
      .filter(
        (node) =>
          node.data?.feedbackLoopType === "reinforcing" &&
          node.data?.loopRole === "reinforcingMarker" &&
          node.data?.loopId === loop.id,
      )
      .forEach((node) => nodesToRemove.add(node.id));

    const edgesToRemove = new Set(loop.edgeIds);
    const nextLoops = currentLoops.filter((item) => item.id !== loop.id);
    const nextEdges = currentEdges.filter(
      (edge) =>
        !edgesToRemove.has(edge.id) &&
        !nodesToRemove.has(edge.source) &&
        !nodesToRemove.has(edge.target),
    );
    const flowLoopsLeft = nextLoops.filter((item) => item.controlledFlowId === loop.controlledFlowId);

    const nextNodes = currentNodes
      .filter((node) => !nodesToRemove.has(node.id))
      .map((node) => {
        if (node.id !== loop.controlledFlowId) return node;
        const restoredBase =
          String(
            node.data?.baseFlowExpression ??
              flowLoopsLeft[0]?.baseFlowExpression ??
              loop.baseFlowExpression ??
              node.data?.bottleneck ??
              node.data?.quantity ??
              0,
          ).trim() || "0";
        const rebuilt =
          flowLoopsLeft.length === 0
            ? restoredBase
            : rebuildFlowExpression(restoredBase, flowLoopsLeft);
        return {
          ...node,
          data: { ...(node.data ?? {}), baseFlowExpression: restoredBase, expression: rebuilt },
        };
      });

    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: nextLoops,
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: selectedNodeId && nextNodeIds.has(selectedNodeId) ? selectedNodeId : null,
      selectedEdgeId: selectedEdgeId && nextEdgeIds.has(selectedEdgeId) ? selectedEdgeId : null,
    });

    return { ok: true, loopId: loop.id };
  },

  setSimulationSteps: (steps) =>
    set({ simulationSteps: steps, sliderIndex: 0, lockEditing: false }),
  clearSimulation: () => set({ simulationSteps: [], sliderIndex: 0, lockEditing: false }),

  resetToInitialGraph: () =>
    set({
      nodes: buildInitialNodes().map((node) => ({
        ...node,
        position: { ...node.position },
        data: { ...(node.data ?? {}) },
      })),
      edges: INITIAL_EDGES.map((edge) => ({ ...edge, data: { ...(edge.data ?? {}) } })),
      feedbackLoops: [],
      lessonUi: null,
      simulationSteps: [],
      sliderIndex: 0,
      lockEditing: false,
      selectedNodeId: null,
      selectedEdgeId: null,
    }),

  replaceGraph: (nodes, edges) =>
    set({
      nodes,
      edges,
      feedbackLoops: sanitizeLoopCollection(get().feedbackLoops, nodes, edges),
      lessonUi: null,
      selectedNodeId: null,
      selectedEdgeId: null,
    }),

  toGraphJson: () => {
    const base = serializeGraph(get().nodes, get().edges, get().feedbackLoops);
    const ui = get().lessonUi;
    const simulationSteps = get().simulationSteps;
    const simulation =
      simulationSteps.length > 0
        ? {
            steps: get().steps,
            dt: get().dt,
            algorithm: get().algorithm,
            timeline: simulationSteps,
          }
        : null;
    if (ui && Object.keys(ui).length > 0) {
      return simulation ? { ...base, lessonUi: ui, simulation } : { ...base, lessonUi: ui };
    }
    return simulation ? { ...base, simulation } : base;
  },

  loadGraphJson: (graph) => {
    const { nodes, edges, feedbackLoops } = deserializeGraph(graph);
    const savedSimulation = readSavedSimulation(graph);
    set({
      isReplayingHistory: true,
      nodes,
      edges,
      feedbackLoops,
      lessonUi: readLessonUi(graph),
      steps: savedSimulation.configuredSteps ?? get().steps,
      dt: savedSimulation.dt ?? get().dt,
      algorithm: savedSimulation.algorithm ?? get().algorithm,
      simulationSteps: savedSimulation.steps,
      sliderIndex: 0,
      lockEditing: false,
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
    });
    queueMicrotask(() => set({ isReplayingHistory: false }));
  },
}));

attachLabHistory(useLabStore, HISTORY_LIMIT, HISTORY_DEBOUNCE_MS);
