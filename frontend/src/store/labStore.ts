import { create } from "zustand";
import {
  Connection,
  Edge,
  Node,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  EdgeChange,
  NodeChange,
} from "reactflow";
import { RunStep } from "../types/api";
import { getCurrentLabColorTokens, getStockColorPresets } from "./uiPreferencesStore";

export type BoundaryType = "upper" | "lower";
export type LoopOperation = "add" | "sub";

export type BalancingFeedbackLoop = {
  id: string;
  type: "balancing";
  stockId: string;
  goalNodeId: string;
  discrepancyNodeId: string;
  correctiveNodeId: string;
  controlledFlowId: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  baseFlowExpression: string;
  edgeIds: string[];
};

export type ReinforcingPolarity = "positive" | "negative";

export type ReinforcingFeedbackLoop = {
  id: string;
  type: "reinforcing";
  stockId: string;
  multiplierNodeId: string;
  growthLimitNodeId?: string;
  controlledFlowId: string;
  k: number;
  polarity: ReinforcingPolarity;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  baseFlowExpression: string;
  edgeIds: string[];
};

export type FeedbackLoop = BalancingFeedbackLoop | ReinforcingFeedbackLoop;

export type CreateBalancingFeedbackLoopPayload = {
  stockId: string;
  controlledFlowId: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  correctiveLabel?: string;
  positions: {
    goal: { x: number; y: number };
    discrepancy: { x: number; y: number };
    corrective: { x: number; y: number };
  };
};

export type CreateReinforcingFeedbackLoopPayload = {
  stockId: string;
  controlledFlowId: string;
  k: number;
  polarity: ReinforcingPolarity;
  delayEnabled: boolean;
  delaySteps: number;
  growthLimit?: number;
  clampNonNegative: boolean;
  multiplierLabel?: string;
  positions: {
    multiplier: { x: number; y: number };
    growthLimit?: { x: number; y: number };
    marker: { x: number; y: number };
  };
};

export type UpdateBalancingFeedbackLoopPayload = {
  id: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  controlledFlowId: string;
  correctiveLabel?: string;
  correctivePosition?: { x: number; y: number };
};

export type CreateBalancingFeedbackLoopResult =
  | { ok: true; loopId: string }
  | { ok: false; error: string };

type LabState = {
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  activeSystemId: number | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  steps: number;
  dt: number;
  algorithm: "euler_v2" | "rk4_v2";
  simulationSteps: RunStep[];
  sliderIndex: number;
  lockEditing: boolean;
  setSteps: (value: number) => void;
  setDt: (value: number) => void;
  setAlgorithm: (value: "euler_v2" | "rk4_v2") => void;
  setSliderIndex: (value: number) => void;
  setLockEditing: (value: boolean) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setActiveSystemId: (id: number | null) => void;
  updateSelectedNode: (patch: Record<string, unknown>) => void;
  updateSelectedEdge: (patch: Record<string, unknown>) => void;
  addStock: () => void;
  addFlow: () => void;
  addConstant: () => void;
  addVariable: () => void;
  createBalancingFeedbackLoop: (payload: CreateBalancingFeedbackLoopPayload) => CreateBalancingFeedbackLoopResult;
  createReinforcingFeedbackLoop: (payload: CreateReinforcingFeedbackLoopPayload) => CreateBalancingFeedbackLoopResult;
  updateBalancingFeedbackLoop: (payload: UpdateBalancingFeedbackLoopPayload) => CreateBalancingFeedbackLoopResult;
  deleteBalancingFeedbackLoop: (id: string) => CreateBalancingFeedbackLoopResult;
  setSimulationSteps: (steps: RunStep[]) => void;
  clearSimulation: () => void;
  resetToInitialGraph: () => void;
  replaceGraph: (nodes: Node[], edges: Edge[]) => void;
  toGraphJson: () => Record<string, unknown>;
  loadGraphJson: (graph: Record<string, unknown>) => void;
};

type EdgeKind = "inflow" | "outflow" | "neutral";
type NodeKind = "stock" | "flow" | "constant" | "variable" | "other";
type ControlOp =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "pow"
  | "mod";
const CONTROL_OPS: ControlOp[] = ["add", "sub", "mul", "div", "pow", "mod"];

function nodeKind(node: Node | undefined): NodeKind {
  if (!node) return "other";
  if (node.type === "stockNode" || String(node.id).startsWith("stock_")) return "stock";
  if (node.type === "flowNode" || String(node.id).startsWith("flow_")) return "flow";
  if (node.type === "constantNode" || String(node.id).startsWith("constant_")) return "constant";
  if (node.type === "variableNode" || String(node.id).startsWith("variable_")) return "variable";
  return "other";
}

function inferEdgeKind(sourceNode: Node | undefined, targetNode: Node | undefined): EdgeKind {
  if (!sourceNode || !targetNode) return "neutral";
  const sourceType = nodeKind(sourceNode);
  const targetType = nodeKind(targetNode);
  if (sourceType === "stock" && targetType === "flow") return "outflow";
  if (sourceType === "flow" && targetType === "stock") return "inflow";
  return "neutral";
}

function isControlEdge(sourceNode: Node | undefined, targetNode: Node | undefined): boolean {
  if (!sourceNode || !targetNode) return false;
  const sourceType = nodeKind(sourceNode);
  const targetType = nodeKind(targetNode);
  return (sourceType === "constant" || sourceType === "variable") && targetType === "flow";
}

function canConnect(sourceNode: Node | undefined, targetNode: Node | undefined): boolean {
  if (!sourceNode || !targetNode) return false;
  if (sourceNode.id === targetNode.id) return false;
  const sourceType = nodeKind(sourceNode);
  const targetType = nodeKind(targetNode);

  // Constants can point to Flow and Variable. Variables can point only to Flow.
  if (sourceType === "constant") {
    return targetType === "flow" || targetType === "variable";
  }
  if (sourceType === "variable") {
    return targetType === "flow";
  }

  if (targetType === "constant") return false;
  if (targetType === "variable") return true;

  return true;
}

function edgeWeightByKind(kind: EdgeKind): number {
  return kind === "outflow" ? -1 : 1;
}

function opLabel(op: ControlOp): string {
  const map: Record<ControlOp, string> = {
    add: "+",
    sub: "-",
    mul: "*",
    div: "/",
    pow: "^",
    mod: "%",
  };
  return map[op];
}

function isControlOp(value: string): value is ControlOp {
  return CONTROL_OPS.includes(value as ControlOp);
}

function nextNodeId(nodes: Node[], prefix: "stock" | "flow" | "constant" | "variable"): string {
  const existing = new Set(nodes.map((node) => String(node.id)));
  const count = nodes.filter((node) => String(node.id).startsWith(`${prefix}_`)).length;
  let index = count + 1;
  let nextId = `${prefix}_${index}`;
  while (existing.has(nextId)) {
    index += 1;
    nextId = `${prefix}_${index}`;
  }
  return nextId;
}

function generateEdgeId(edges: Edge[]): string {
  const existing = new Set(edges.map((edge) => String(edge.id)));
  const count = edges.filter((edge) => String(edge.id).startsWith("edge_")).length;
  let index = count + 1;
  let nextId = `edge_${index}`;
  while (existing.has(nextId)) {
    index += 1;
    nextId = `edge_${index}`;
  }
  return nextId;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampFlowNonNegative(value: unknown): number {
  return Math.max(0, asFiniteNumber(value, 0));
}

function sanitizeLoopCollection(loops: FeedbackLoop[], nodes: Node[], edges: Edge[]): FeedbackLoop[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  return loops.filter((loop) => {
    const hasNodes =
      loop.type === "balancing"
        ? nodeIds.has(loop.stockId) &&
          nodeIds.has(loop.controlledFlowId) &&
          nodeIds.has(loop.goalNodeId) &&
          nodeIds.has(loop.discrepancyNodeId) &&
          nodeIds.has(loop.correctiveNodeId)
        : nodeIds.has(loop.stockId) &&
          nodeIds.has(loop.controlledFlowId) &&
          nodeIds.has(loop.multiplierNodeId) &&
          (!loop.growthLimitNodeId || nodeIds.has(loop.growthLimitNodeId));
    if (!hasNodes) return false;
    return loop.edgeIds.every((id) => edgeIds.has(id));
  });
}

function sanitizeBoundaryType(value: unknown): BoundaryType {
  return value === "lower" ? "lower" : "upper";
}

function sanitizeLoopOperation(value: unknown): LoopOperation {
  if (value === "sub" || value === "add") return value;
  if (value === "dec") return "sub";
  if (value === "inc") return "add";
  return "add";
}

function discrepancyExpression(boundaryType: BoundaryType, goalNodeId: string, stockId: string): string {
  return boundaryType === "upper"
    ? `(${stockId} > ${goalNodeId} ? (${stockId} - ${goalNodeId}) : 0)`
    : `(${stockId} < ${goalNodeId} ? (${goalNodeId} - ${stockId}) : 0)`;
}

function correctiveExpression(
  adjustmentTime: number,
  discrepancyNodeId: string,
  delayEnabled: boolean,
  delaySteps: number,
): string {
  const source =
    delayEnabled && delaySteps > 0 ? `delay("${discrepancyNodeId}", ${Math.max(1, Math.floor(delaySteps))})` : discrepancyNodeId;
  const gap = `max(0, (${source}))`;
  return `(${gap}) / (${Math.max(0.000001, adjustmentTime)})`;
}

function flowExpression(baseFlowExpression: string, correctiveNodeId: string, operation: LoopOperation): string {
  const expression =
    operation === "sub"
      ? `(${baseFlowExpression}) - (${correctiveNodeId})`
      : `(${baseFlowExpression}) + (${correctiveNodeId})`;
  return `max(0, ${expression})`;
}

function sanitizeReinforcingPolarity(value: unknown): ReinforcingPolarity {
  return value === "negative" ? "negative" : "positive";
}

function reinforcingFlowExpression(
  baseFlowExpression: string,
  multiplierNodeId: string,
  polarity: ReinforcingPolarity,
  clampNonNegative: boolean,
): string {
  const expression =
    polarity === "negative"
      ? `(${baseFlowExpression}) - (${multiplierNodeId})`
      : `(${baseFlowExpression}) + (${multiplierNodeId})`;
  return clampNonNegative ? `max(0, ${expression})` : expression;
}

function rebuildFlowExpression(
  baseFlowExpression: string,
  loopsForFlow: FeedbackLoop[],
): string {
  let expression = baseFlowExpression;
  for (const loop of loopsForFlow) {
    if (loop.type === "balancing") {
      expression = flowExpression(expression, loop.correctiveNodeId, loop.operation);
    } else {
      expression = reinforcingFlowExpression(expression, loop.multiplierNodeId, loop.polarity, loop.clampNonNegative);
    }
  }
  return expression;
}

function parseLoopRecord(item: Record<string, unknown>): FeedbackLoop | null {
  const id = String(item.id ?? "").trim();
  const type = String(item.type ?? "").trim();
  const stockId = String(item.stockId ?? "").trim();
  const controlledFlowId = String(item.controlledFlowId ?? "").trim();
  if (!id || !stockId || !controlledFlowId) {
    return null;
  }
  const edgeIds = Array.isArray(item.edgeIds)
    ? item.edgeIds.map((edgeId) => String(edgeId)).filter((edgeId) => edgeId.trim().length > 0)
    : [];
  if (type === "reinforcing") {
    const multiplierNodeId = String(item.multiplierNodeId ?? "").trim();
    if (!multiplierNodeId) return null;
    const growthLimitNodeId = String(item.growthLimitNodeId ?? "").trim();
    return {
      id,
      type: "reinforcing",
      stockId,
      multiplierNodeId,
      growthLimitNodeId: growthLimitNodeId || undefined,
      controlledFlowId,
      k: asFiniteNumber(item.k, 1),
      polarity: sanitizeReinforcingPolarity(item.polarity),
      delayEnabled: item.delayEnabled === true || item.delay_enabled === true,
      delaySteps: Math.max(0, Math.floor(asFiniteNumber(item.delaySteps ?? item.delay_steps, 0))),
      clampNonNegative: item.clampNonNegative !== false && item.clamp_non_negative !== false,
      baseFlowExpression: String(item.baseFlowExpression ?? item.base_flow_expression ?? "0") || "0",
      edgeIds,
    };
  }
  const goalNodeId = String(item.goalNodeId ?? "").trim();
  const discrepancyNodeId = String(item.discrepancyNodeId ?? "").trim();
  const correctiveNodeId = String(item.correctiveNodeId ?? "").trim();
  if (type !== "balancing" || !goalNodeId || !discrepancyNodeId || !correctiveNodeId) return null;
  return {
    id,
    type: "balancing",
    stockId,
    goalNodeId,
    discrepancyNodeId,
    correctiveNodeId,
    controlledFlowId,
    boundaryType: sanitizeBoundaryType(item.boundaryType),
    goalValue: asFiniteNumber(item.goalValue, 0),
    adjustmentTime: Math.max(0.000001, asFiniteNumber(item.adjustmentTime ?? item.adjustment_time ?? item.k, 1)),
    operation: sanitizeLoopOperation(item.operation ?? item.mode),
    delayEnabled: item.delayEnabled === true || item.delay_enabled === true,
    delaySteps: Math.max(0, Math.floor(asFiniteNumber(item.delaySteps ?? item.delay_steps, 0))),
    clampNonNegative: true,
    baseFlowExpression: String(item.baseFlowExpression ?? "0") || "0",
    edgeIds,
  };
}

function buildInitialNodes(): Node[] {
  const stockColorPresets = getStockColorPresets();
  return [
    {
      id: "stock_1",
      type: "stockNode",
      position: { x: 260, y: 180 },
      data: { label: "Stock A", quantity: 100, unit: "", color: stockColorPresets[0] },
    },
    {
      id: "stock_2",
      type: "stockNode",
      position: { x: 560, y: 250 },
      data: { label: "Stock B", quantity: 50, unit: "", color: stockColorPresets[1] ?? stockColorPresets[0] },
    },
    {
      id: "flow_1",
      type: "flowNode",
      position: { x: 420, y: 130 },
      data: { label: "Flow 1", bottleneck: 10, unit: "" },
    },
  ];
}

const initialEdges: Edge[] = [
  { id: "edge_1", source: "stock_1", target: "flow_1", label: "-", data: { kind: "outflow", weight: -1 } },
  { id: "edge_2", source: "flow_1", target: "stock_2", label: "+", data: { kind: "inflow", weight: 1 } },
];

export const useLabStore = create<LabState>((set, get) => ({
  nodes: buildInitialNodes(),
  edges: initialEdges,
  feedbackLoops: [],
  activeSystemId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  steps: 60,
  dt: 1,
  algorithm: "euler_v2",
  simulationSteps: [],
  sliderIndex: 0,
  lockEditing: false,

  setSteps: (value) => set({ steps: Math.max(1, value) }),
  setDt: (value) => set({ dt: Math.max(0.001, value) }),
  setAlgorithm: (value) => set({ algorithm: value }),
  setSliderIndex: (value) => set({ sliderIndex: Math.max(0, value) }),
  setLockEditing: (value) => set({ lockEditing: value }),

  onNodesChange: (changes) => {
    if (get().lockEditing) return;
    const currentNodes = get().nodes;
    const protectedNodeIds = new Set(
      currentNodes
        .filter((node) => node.data?.feedbackLoopPersistent === true)
        .map((node) => node.id),
    );
    const filteredChanges = changes.filter((change) => {
      if (!("id" in change)) return true;
      if (!protectedNodeIds.has(change.id)) return true;
      if (change.type === "remove") return false;
      if (change.type === "dimensions" || change.type === "position" || change.type === "select") return true;
      return false;
    });
    const nextNodes = applyNodeChanges(filteredChanges, currentNodes).map((node) =>
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
    const protectedEdgeIds = new Set(
      currentEdges
        .filter((edge) => edge.data?.feedbackLoopPersistent === true)
        .map((edge) => edge.id),
    );
    const filteredChanges = changes.filter((change) => {
      if (!("id" in change)) return true;
      if (!protectedEdgeIds.has(change.id)) return true;
      return change.type !== "remove";
    });
    const nextEdges = applyEdgeChanges(filteredChanges, currentEdges).map((edge) =>
      edge.data?.feedbackLoopPersistent === true ? { ...edge, hidden: false } : edge,
    );
    const selectedEdgeId = get().selectedEdgeId;
    set({
      edges: nextEdges,
      selectedEdgeId: selectedEdgeId && nextEdges.some((edge) => edge.id === selectedEdgeId) ? selectedEdgeId : null,
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
    const op: ControlOp = "add";
    const nextEdgeId = generateEdgeId(get().edges);
    const label = kind === "outflow" ? "-" : kind === "inflow" ? "+" : control ? opLabel(op) : "";
    set({
      edges: addEdge(
        {
          ...connection,
          id: nextEdgeId,
          label,
          data: { kind, weight: edgeWeightByKind(kind), op },
        },
        get().edges,
      ),
    });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setActiveSystemId: (id) => set({ activeSystemId: id }),
  updateSelectedNode: (patch) => {
    if (get().lockEditing) return;
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId) return;
    set((state) => {
      let nextFeedbackLoops = state.feedbackLoops;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== selectedNodeId) return node;
        const nextData = { ...node.data, ...patch };
        if (nodeKind(node) === "flow") {
          if (nextData.bottleneck !== undefined) nextData.bottleneck = clampFlowNonNegative(nextData.bottleneck);
          if (nextData.quantity !== undefined) nextData.quantity = clampFlowNonNegative(nextData.quantity);

          const flowLoops = state.feedbackLoops.filter((loop) => loop.controlledFlowId === node.id);
          const hasFlowInputPatch =
            Object.prototype.hasOwnProperty.call(patch, "bottleneck") ||
            Object.prototype.hasOwnProperty.call(patch, "quantity");
          if (flowLoops.length > 0 && hasFlowInputPatch) {
            const baseValue = clampFlowNonNegative(
              nextData.bottleneck ?? nextData.quantity ?? node.data?.bottleneck ?? node.data?.quantity ?? 0,
            );
            const nextBaseFlowExpression = String(baseValue);
            nextFeedbackLoops = state.feedbackLoops.map((loop) =>
              loop.controlledFlowId === node.id
                ? {
                    ...loop,
                    baseFlowExpression: nextBaseFlowExpression,
                  }
                : loop,
            );
            const loopsForFlow = nextFeedbackLoops.filter((loop) => loop.controlledFlowId === node.id);
            nextData.baseFlowExpression = nextBaseFlowExpression;
            nextData.expression = rebuildFlowExpression(nextBaseFlowExpression, loopsForFlow);
          }
        }
        return {
          ...node,
          data: nextData,
        };
      });

      return {
        nodes: nextNodes,
        feedbackLoops: nextFeedbackLoops,
      };
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
        const nextOp = String(nextData.op ?? "");
        const nextLabel =
          nextData.kind === "outflow"
            ? "-"
            : nextData.kind === "inflow"
              ? "+"
              : isControlOp(nextOp)
                ? opLabel(nextOp as ControlOp)
                : String(edge.label ?? "");
        return {
          ...edge,
          data: nextData,
          label: nextLabel,
        };
      }),
    });
  },

  addStock: () => {
    if (get().lockEditing) return;
    const id = nextNodeId(get().nodes, "stock");
    const index = get().nodes.filter((node) => node.id.startsWith("stock_")).length + 1;
    const stockColorPresets = getStockColorPresets();
    const color = stockColorPresets[(index - 1) % stockColorPresets.length];
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: "stockNode",
          position: { x: 200 + index * 30, y: 120 + index * 25 },
          data: { label: `Stock ${index}`, quantity: 0, unit: "", color },
        },
      ],
    });
  },

  addFlow: () => {
    if (get().lockEditing) return;
    const id = nextNodeId(get().nodes, "flow");
    const index = get().nodes.filter((node) => node.id.startsWith("flow_")).length + 1;
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: "flowNode",
          position: { x: 300 + index * 35, y: 140 + index * 20 },
          data: { label: `Flow ${index}`, bottleneck: 0, unit: "" },
        },
      ],
    });
  },

  addConstant: () => {
    if (get().lockEditing) return;
    const id = nextNodeId(get().nodes, "constant");
    const index = get().nodes.filter((node) => node.id.startsWith("constant_")).length + 1;
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: "constantNode",
          position: { x: 240 + index * 30, y: 100 + index * 20 },
          data: { label: `Constant ${index}`, quantity: 1, unit: "" },
        },
      ],
    });
  },

  addVariable: () => {
    if (get().lockEditing) return;
    const id = nextNodeId(get().nodes, "variable");
    const index = get().nodes.filter((node) => node.id.startsWith("variable_")).length + 1;
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: "variableNode",
          position: { x: 280 + index * 30, y: 160 + index * 20 },
          data: { label: `Variable ${index}`, quantity: 0, unit: "" },
        },
      ],
    });
  },

  createBalancingFeedbackLoop: (payload) => {
    if (get().lockEditing) return { ok: false, error: "Editing is locked while simulation is running." };

    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const currentLoops = get().feedbackLoops;
    const stockNode = currentNodes.find((node) => node.id === payload.stockId);
    const flowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);

    if (nodeKind(stockNode) !== "stock") return { ok: false, error: "Selected stock was not found." };
    if (nodeKind(flowNode) !== "flow") return { ok: false, error: "Selected controlled flow was not found." };

    const duplicate = currentLoops.some(
      (loop) => loop.type === "balancing" && loop.stockId === payload.stockId && loop.controlledFlowId === payload.controlledFlowId,
    );
    if (duplicate) {
      return {
        ok: false,
        error: "A balancing loop for this stock and flow already exists. Delete it first to create a new one.",
      };
    }

    const goalValue = asFiniteNumber(payload.goalValue, 0);
    const adjustmentTime = Math.max(0.000001, asFiniteNumber(payload.adjustmentTime, 1));
    const delayEnabled = payload.delayEnabled === true;
    const delaySteps = Math.max(0, Math.floor(asFiniteNumber(payload.delaySteps, 0)));
    const loopId = `loop_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const goalNodeId = nextNodeId(currentNodes, "constant");
    const discrepancyNodeId = nextNodeId(
      [...currentNodes, { id: goalNodeId, position: { x: 0, y: 0 }, data: {}, type: "constantNode" }],
      "variable",
    );
    const correctiveNodeId = nextNodeId(
      [
        ...currentNodes,
        { id: goalNodeId, position: { x: 0, y: 0 }, data: {}, type: "constantNode" },
        { id: discrepancyNodeId, position: { x: 0, y: 0 }, data: {}, type: "variableNode" },
      ],
      "variable",
    );

    const discrepancyExpr = discrepancyExpression(payload.boundaryType, goalNodeId, payload.stockId);
    const correctiveExpr = correctiveExpression(adjustmentTime, discrepancyNodeId, delayEnabled, delaySteps);

    const baseFlowExpression = String(
      flowNode?.data?.baseFlowExpression ?? flowNode?.data?.expression ?? flowNode?.data?.bottleneck ?? flowNode?.data?.quantity ?? 0,
    ).trim() || "0";

    const nextFlowExpression = rebuildFlowExpression(
      baseFlowExpression,
      [
        ...currentLoops.filter((item) => item.controlledFlowId === payload.controlledFlowId),
        {
          id: "__preview_balancing_loop__",
          type: "balancing",
          stockId: payload.stockId,
          goalNodeId,
          discrepancyNodeId,
          correctiveNodeId,
          controlledFlowId: payload.controlledFlowId,
          boundaryType: payload.boundaryType,
          goalValue: asFiniteNumber(payload.goalValue, 0),
          adjustmentTime,
          operation: payload.operation,
          delayEnabled,
          delaySteps,
          clampNonNegative: true,
          baseFlowExpression,
          edgeIds: [],
        } satisfies BalancingFeedbackLoop,
      ],
    );

    const goalNode: Node = {
      id: goalNodeId,
      type: "constantNode",
      position: { x: payload.positions.goal.x, y: payload.positions.goal.y },
      data: {
        label: "Goal",
        quantity: goalValue,
        unit: "",
        expression: String(goalValue),
        loopId,
        loopRole: "goal",
      },
    };

    const discrepancyNode: Node = {
      id: discrepancyNodeId,
      type: "variableNode",
      position: { x: payload.positions.discrepancy.x, y: payload.positions.discrepancy.y },
      data: {
        label: "Discrepancy",
        quantity: 0,
        unit: "",
        expression: discrepancyExpr,
        loopId,
        loopRole: "discrepancy",
      },
    };

    const correctiveNode: Node = {
      id: correctiveNodeId,
      type: "variableNode",
      position: { x: payload.positions.corrective.x, y: payload.positions.corrective.y },
      data: {
        label: (payload.correctiveLabel ?? "").trim() || "Corrective Action",
        quantity: 0,
        unit: "",
        expression: correctiveExpr,
        loopId,
        loopRole: "correctiveAction",
      },
    };

    const edgeGoalToDiscrepancy: Edge = {
      id: generateEdgeId(currentEdges),
      source: goalNodeId,
      target: discrepancyNodeId,
      label: "",
      data: { kind: "neutral", weight: 1, feedbackLoop: true },
    };

    const edgeStockToDiscrepancy: Edge = {
      id: generateEdgeId([...currentEdges, edgeGoalToDiscrepancy]),
      source: payload.stockId,
      target: discrepancyNodeId,
      label: "",
      data: { kind: "neutral", weight: 1, feedbackLoop: true },
    };

    const edgeDiscrepancyToCorrective: Edge = {
      id: generateEdgeId([...currentEdges, edgeGoalToDiscrepancy, edgeStockToDiscrepancy]),
      source: discrepancyNodeId,
      target: correctiveNodeId,
      label: "",
      data: { kind: "neutral", weight: 1, feedbackLoop: true },
    };

    const edgeCorrectiveToFlow: Edge = {
      id: generateEdgeId([...currentEdges, edgeGoalToDiscrepancy, edgeStockToDiscrepancy, edgeDiscrepancyToCorrective]),
      source: correctiveNodeId,
      target: payload.controlledFlowId,
      label: opLabel(payload.operation),
      data: { kind: "neutral", weight: 1, feedbackLoop: true, op: payload.operation },
    };

    const nextNodes = [
      ...currentNodes.map((node) => {
        if (node.id !== payload.controlledFlowId) return node;
        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            baseFlowExpression: String(node.data?.baseFlowExpression ?? baseFlowExpression),
            expression: nextFlowExpression,
          },
        };
      }),
      goalNode,
      discrepancyNode,
      correctiveNode,
    ];

    const nextEdges = [
      ...currentEdges,
      edgeGoalToDiscrepancy,
      edgeStockToDiscrepancy,
      edgeDiscrepancyToCorrective,
      edgeCorrectiveToFlow,
    ];

    const nextLoop: BalancingFeedbackLoop = {
      id: loopId,
      type: "balancing",
      stockId: payload.stockId,
      goalNodeId,
      discrepancyNodeId,
      correctiveNodeId,
      controlledFlowId: payload.controlledFlowId,
      boundaryType: payload.boundaryType,
      goalValue,
      adjustmentTime,
      operation: payload.operation,
      delayEnabled,
      delaySteps,
      clampNonNegative: true,
      baseFlowExpression,
      edgeIds: [
        edgeGoalToDiscrepancy.id,
        edgeStockToDiscrepancy.id,
        edgeDiscrepancyToCorrective.id,
        edgeCorrectiveToFlow.id,
      ],
    };

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: [...currentLoops, nextLoop],
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: correctiveNodeId,
      selectedEdgeId: null,
    });

    return { ok: true, loopId };
  },

  createReinforcingFeedbackLoop: (payload) => {
    if (get().lockEditing) return { ok: false, error: "Editing is locked while simulation is running." };

    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const currentLoops = get().feedbackLoops;
    const stockNode = currentNodes.find((node) => node.id === payload.stockId);
    const flowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);

    if (nodeKind(stockNode) !== "stock") return { ok: false, error: "Selected stock was not found." };
    if (nodeKind(flowNode) !== "flow") return { ok: false, error: "Selected controlled flow was not found." };

    const loopId = `loop_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const k = asFiniteNumber(payload.k, 1);
    const multiplierLabel = (payload.multiplierLabel ?? "").trim() || "Multiplier";
    const collapseMultiplier = Math.abs(k - 1) <= 1e-9 && multiplierLabel === "Multiplier";
    const delayEnabled = payload.delayEnabled === true;
    const delaySteps = Math.max(0, Math.floor(asFiniteNumber(payload.delaySteps, 0)));
    const clampNonNegative = payload.clampNonNegative !== false;
    const polarity: ReinforcingPolarity = payload.polarity === "negative" ? "negative" : "positive";
    const multiplierNodeId = nextNodeId(currentNodes, "variable");
    const withMultiplierNode: Node[] = [
      ...currentNodes,
      { id: multiplierNodeId, type: "variableNode", position: { x: 0, y: 0 }, data: {} },
    ];
    const growthLimitNodeId =
      payload.growthLimit === undefined ? undefined : nextNodeId(withMultiplierNode, "constant");
    const markerNodeId = `loop_marker_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const baseFlowExpression = String(
      flowNode?.data?.baseFlowExpression ?? flowNode?.data?.expression ?? flowNode?.data?.bottleneck ?? flowNode?.data?.quantity ?? 0,
    ).trim() || "0";

    const multiplierExpression =
      growthLimitNodeId === undefined
        ? `(${k}) * (${payload.stockId})`
        : `(${k}) * (${payload.stockId}) * max(0, (${growthLimitNodeId}) - (${payload.stockId}))`;

    const multiplierNode: Node = {
      id: multiplierNodeId,
      type: "variableNode",
      position: { x: payload.positions.multiplier.x, y: payload.positions.multiplier.y },
      data: {
        label: collapseMultiplier ? "(R)" : multiplierLabel,
        quantity: 0,
        unit: "",
        expression: multiplierExpression,
        reinforcingK: k,
        reinforcingCollapsed: collapseMultiplier,
        loopId,
        loopRole: "reinforcingMultiplier",
        feedbackLoopType: "reinforcing",
        feedbackLoopPersistent: true,
        reinforcingTextOnly: !collapseMultiplier,
      },
    };

    const growthLimitNode: Node | null =
      growthLimitNodeId === undefined
        ? null
        : {
            id: growthLimitNodeId,
            type: "constantNode",
            position: {
              x: payload.positions.growthLimit?.x ?? payload.positions.multiplier.x,
              y: payload.positions.growthLimit?.y ?? payload.positions.multiplier.y - 72,
            },
            data: {
              label: "GrowthLimit",
              quantity: asFiniteNumber(payload.growthLimit, 0),
              unit: "",
              expression: String(asFiniteNumber(payload.growthLimit, 0)),
              loopId,
              loopRole: "growthLimit",
              feedbackLoopType: "reinforcing",
              feedbackLoopPersistent: true,
            },
          };

    const markerNode: Node | null = collapseMultiplier
      ? null
      : {
          id: markerNodeId,
          type: "variableNode",
          position: { x: payload.positions.marker.x, y: payload.positions.marker.y },
          draggable: false,
          selectable: false,
          deletable: false,
          data: {
            label: "(R)",
            quantity: "",
            displayQuantity: "",
            unit: "",
            loopId,
            loopRole: "reinforcingMarker",
            feedbackLoopType: "reinforcing",
            feedbackLoopPersistent: true,
            reinforcingMarker: true,
          },
        };

    const color = getCurrentLabColorTokens().reinforcing[polarity];

    const edgeStockToMultiplier: Edge = {
      id: generateEdgeId(currentEdges),
      source: payload.stockId,
      target: multiplierNodeId,
      label: "",
      data: {
        kind: "neutral",
        weight: 1,
        feedbackLoop: true,
        feedbackLoopType: "reinforcing",
        reinforcingPolarity: polarity,
        feedbackLoopPersistent: true,
      },
      style: { stroke: color, strokeWidth: 2.1 },
    };

    const edgeGrowthLimitToMultiplier: Edge | null =
      growthLimitNodeId === undefined
        ? null
        : {
            id: generateEdgeId([...currentEdges, edgeStockToMultiplier]),
            source: growthLimitNodeId,
            target: multiplierNodeId,
            label: "",
            data: {
              kind: "neutral",
              weight: 1,
              feedbackLoop: true,
              feedbackLoopType: "reinforcing",
              reinforcingPolarity: polarity,
              feedbackLoopPersistent: true,
            },
            style: { stroke: color, strokeWidth: 2.1 },
          };

    const edgeMultiplierToFlow: Edge = {
      id: generateEdgeId(
        edgeGrowthLimitToMultiplier
          ? [...currentEdges, edgeStockToMultiplier, edgeGrowthLimitToMultiplier]
          : [...currentEdges, edgeStockToMultiplier],
      ),
      source: multiplierNodeId,
      target: payload.controlledFlowId,
      label: polarity === "positive" ? "+" : "-",
      data: {
        kind: "neutral",
        weight: 1,
        feedbackLoop: true,
        feedbackLoopType: "reinforcing",
        reinforcingPolarity: polarity,
        feedbackLoopPersistent: true,
      },
      style: { stroke: color, strokeWidth: 2.2 },
    };

    const nextLoop: ReinforcingFeedbackLoop = {
      id: loopId,
      type: "reinforcing",
      stockId: payload.stockId,
      multiplierNodeId,
      growthLimitNodeId,
      controlledFlowId: payload.controlledFlowId,
      k,
      polarity,
      delayEnabled,
      delaySteps,
      clampNonNegative,
      baseFlowExpression,
      edgeIds: [
        edgeStockToMultiplier.id,
        ...(edgeGrowthLimitToMultiplier ? [edgeGrowthLimitToMultiplier.id] : []),
        edgeMultiplierToFlow.id,
      ],
    };

    const nextLoops = [...currentLoops, nextLoop];
    const flowLoops = nextLoops.filter((loop) => loop.controlledFlowId === payload.controlledFlowId);
    const nextFlowExpression = rebuildFlowExpression(baseFlowExpression, flowLoops);

    const nextNodes = [
      ...currentNodes.map((node) => {
        if (node.id !== payload.controlledFlowId) return node;
        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            baseFlowExpression: String(node.data?.baseFlowExpression ?? baseFlowExpression),
            expression: nextFlowExpression,
          },
        };
      }),
      multiplierNode,
      ...(growthLimitNode ? [growthLimitNode] : []),
      ...(markerNode ? [markerNode] : []),
    ];

    const nextEdges = [
      ...currentEdges,
      edgeStockToMultiplier,
      ...(edgeGrowthLimitToMultiplier ? [edgeGrowthLimitToMultiplier] : []),
      edgeMultiplierToFlow,
    ];

    set({
      nodes: nextNodes,
      edges: nextEdges,
      feedbackLoops: nextLoops,
      simulationSteps: [],
      sliderIndex: 0,
      selectedNodeId: multiplierNodeId,
      selectedEdgeId: null,
    });

    return { ok: true, loopId };
  },

  updateBalancingFeedbackLoop: (payload) => {
    if (get().lockEditing) return { ok: false, error: "Editing is locked while simulation is running." };
    const currentLoops = get().feedbackLoops;
    const loop = currentLoops.find((item) => item.id === payload.id);
    if (!loop) return { ok: false, error: "Feedback loop was not found." };
    if (loop.type !== "balancing") return { ok: false, error: "Only balancing loops are editable." };

    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const stockNode = currentNodes.find((node) => node.id === loop.stockId);
    const goalNode = currentNodes.find((node) => node.id === loop.goalNodeId);
    const discrepancyNode = currentNodes.find((node) => node.id === loop.discrepancyNodeId);
    const correctiveNode = currentNodes.find((node) => node.id === loop.correctiveNodeId);
    const nextFlowNode = currentNodes.find((node) => node.id === payload.controlledFlowId);
    if (!stockNode || !goalNode || !discrepancyNode || !correctiveNode || !nextFlowNode) {
      return { ok: false, error: "Loop graph elements were not found." };
    }
    if (nodeKind(nextFlowNode) !== "flow") return { ok: false, error: "Selected controlled flow was not found." };

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

    const goalValue = asFiniteNumber(payload.goalValue, 0);
    const adjustmentTime = Math.max(0.000001, asFiniteNumber(payload.adjustmentTime, 1));
    const delayEnabled = payload.delayEnabled === true;
    const delaySteps = Math.max(0, Math.floor(asFiniteNumber(payload.delaySteps, 0)));
    const nextBaseFlowExpression =
      payload.controlledFlowId === loop.controlledFlowId
        ? loop.baseFlowExpression
        : String(
            nextFlowNode.data?.baseFlowExpression ??
              nextFlowNode.data?.expression ??
              nextFlowNode.data?.bottleneck ??
              nextFlowNode.data?.quantity ??
              0,
          ).trim() || "0";
    const nextFlowExpression = rebuildFlowExpression(
      nextBaseFlowExpression,
      [
        ...currentLoops.filter((item) => item.id !== loop.id && item.controlledFlowId === payload.controlledFlowId),
        {
          ...loop,
          boundaryType: payload.boundaryType,
          goalValue,
          adjustmentTime,
          operation: payload.operation,
          delayEnabled,
          delaySteps,
          controlledFlowId: payload.controlledFlowId,
          baseFlowExpression: nextBaseFlowExpression,
        } satisfies BalancingFeedbackLoop,
      ],
    );
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
          data: {
            ...(node.data ?? {}),
            quantity: goalValue,
            expression: String(goalValue),
          },
        };
      }
      if (node.id === loop.discrepancyNodeId) {
        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            expression: nextDiscrepancyExpr,
          },
        };
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
      if (node.id === loop.controlledFlowId && payload.controlledFlowId !== loop.controlledFlowId) {
        const restoreBase = String(node.data?.baseFlowExpression ?? loop.baseFlowExpression).trim() || "0";
        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            baseFlowExpression: restoreBase,
            expression: restoreBase,
          },
        };
      }
      if (node.id === payload.controlledFlowId) {
        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            baseFlowExpression: String(node.data?.baseFlowExpression ?? nextBaseFlowExpression),
            expression: nextFlowExpression,
          },
        };
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
      return {
        ...item,
        boundaryType: payload.boundaryType,
        goalValue,
        adjustmentTime,
        operation: payload.operation,
        delayEnabled,
        delaySteps,
        clampNonNegative: true,
        controlledFlowId: payload.controlledFlowId,
        baseFlowExpression: nextBaseFlowExpression,
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
    if (get().lockEditing) return { ok: false, error: "Editing is locked while simulation is running." };

    const currentLoops = get().feedbackLoops;
    const loop = currentLoops.find((item) => item.id === id);
    if (!loop) return { ok: false, error: "Feedback loop was not found." };

    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const selectedNodeId = get().selectedNodeId;
    const selectedEdgeId = get().selectedEdgeId;
    const nodesToRemove = new Set(
      loop.type === "balancing"
        ? [loop.goalNodeId, loop.discrepancyNodeId, loop.correctiveNodeId]
        : [loop.multiplierNodeId, ...(loop.growthLimitNodeId ? [loop.growthLimitNodeId] : [])],
    );
    const markerNodeIds = currentNodes
      .filter(
        (node) =>
          node.data?.feedbackLoopType === "reinforcing" &&
          node.data?.loopRole === "reinforcingMarker" &&
          node.data?.loopId === loop.id,
      )
      .map((node) => node.id);
    for (const markerId of markerNodeIds) nodesToRemove.add(markerId);
    const edgesToRemove = new Set(loop.edgeIds);
    const nextLoops = currentLoops.filter((item) => item.id !== loop.id);

    const nextEdges = currentEdges.filter(
      (edge) => !edgesToRemove.has(edge.id) && !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target),
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

        if (flowLoopsLeft.length === 0) {
          return {
            ...node,
            data: {
              ...(node.data ?? {}),
              baseFlowExpression: restoredBase,
              expression: restoredBase,
            },
          };
        }

        const rebuiltExpression = rebuildFlowExpression(restoredBase, flowLoopsLeft);

        return {
          ...node,
          data: {
            ...(node.data ?? {}),
            baseFlowExpression: restoredBase,
            expression: rebuiltExpression,
          },
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
    set({
      simulationSteps: steps,
      sliderIndex: 0,
      lockEditing: false,
    }),

  clearSimulation: () => set({ simulationSteps: [], sliderIndex: 0, lockEditing: false }),

  resetToInitialGraph: () =>
    set({
      nodes: buildInitialNodes().map((node) => ({
        ...node,
        position: { ...node.position },
        data: { ...(node.data ?? {}) },
      })),
      edges: initialEdges.map((edge) => ({
        ...edge,
        data: { ...(edge.data ?? {}) },
      })),
      feedbackLoops: [],
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
      selectedNodeId: null,
      selectedEdgeId: null,
    }),

  toGraphJson: () => {
    const nodes = get().nodes.map((node) => ({
      id: node.id,
      kind: String(node.type ?? "default"),
      x: Number(node.position.x ?? 0),
      y: Number(node.position.y ?? 0),
      initial: nodeKind(node) === "flow" ? clampFlowNonNegative(node.data?.quantity ?? node.data?.initial ?? 0) : Number(node.data?.quantity ?? node.data?.initial ?? 0),
      quantity: nodeKind(node) === "flow" ? clampFlowNonNegative(node.data?.quantity ?? node.data?.initial ?? 0) : Number(node.data?.quantity ?? node.data?.initial ?? 0),
      bottleneck: clampFlowNonNegative(node.data?.bottleneck ?? node.data?.quantity ?? node.data?.initial ?? 0),
      expression: String(node.data?.expression ?? ""),
      base_flow_expression: String(node.data?.baseFlowExpression ?? ""),
      loop_id: String(node.data?.loopId ?? ""),
      loop_role: String(node.data?.loopRole ?? ""),
      feedback_loop_type: String(node.data?.feedbackLoopType ?? ""),
      feedback_loop_persistent: Boolean(node.data?.feedbackLoopPersistent),
      reinforcing_text_only: Boolean(node.data?.reinforcingTextOnly),
      reinforcing_marker: Boolean(node.data?.reinforcingMarker),
      unit: String(node.data?.unit ?? ""),
      color: String(node.data?.color ?? ""),
      decay: 0,
      bias: 0,
      label: String(node.data?.label ?? node.id),
    }));
    const edges = get().edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: String(edge.sourceHandle ?? ""),
      target_handle: String(edge.targetHandle ?? ""),
      kind: String(edge.data?.kind ?? ""),
      op: String(edge.data?.op ?? ""),
      weight: Number(edge.data?.weight ?? 0),
      feedback_loop: Boolean(edge.data?.feedbackLoop),
      feedback_loop_type: String(edge.data?.feedbackLoopType ?? ""),
      reinforcing_polarity: String(edge.data?.reinforcingPolarity ?? ""),
      feedback_loop_persistent: Boolean(edge.data?.feedbackLoopPersistent),
    }));
    return {
      nodes,
      edges,
      feedbackLoops: get().feedbackLoops,
    };
  },

  loadGraphJson: (graph) => {
    const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as Array<Record<string, unknown>>) : [];
    const rawEdges = Array.isArray(graph.edges) ? (graph.edges as Array<Record<string, unknown>>) : [];

    const nodes: Node[] = rawNodes.map((item, index) => {
      const type =
        String(item.kind ?? "stockNode") === "flowNode"
          ? "flowNode"
          : String(item.kind ?? "stockNode") === "constantNode"
            ? "constantNode"
            : String(item.kind ?? "stockNode") === "variableNode"
              ? "variableNode"
              : "stockNode";
      const isFlow = type === "flowNode";
      const quantityRaw = item.quantity ?? item.initial ?? 0;
      return {
        id: String(item.id ?? `stock_${index + 1}`),
        type,
        position: {
          x: Number(item.x ?? 160 + index * 40),
          y: Number(item.y ?? 140 + index * 30),
        },
        data: {
          label: String(item.label ?? item.id ?? `Stock ${index + 1}`),
          quantity: isFlow ? clampFlowNonNegative(quantityRaw) : Number(quantityRaw),
          bottleneck: clampFlowNonNegative(item.bottleneck ?? quantityRaw),
          expression: String(item.expression ?? ""),
          baseFlowExpression: String(item.base_flow_expression ?? item.baseFlowExpression ?? ""),
          loopId: String(item.loop_id ?? item.loopId ?? ""),
          loopRole: String(item.loop_role ?? item.loopRole ?? ""),
          feedbackLoopType: String(item.feedback_loop_type ?? item.feedbackLoopType ?? ""),
          feedbackLoopPersistent: item.feedback_loop_persistent === true || item.feedbackLoopPersistent === true,
          reinforcingTextOnly: item.reinforcing_text_only === true || item.reinforcingTextOnly === true,
          reinforcingMarker: item.reinforcing_marker === true || item.reinforcingMarker === true,
          unit: String(item.unit ?? ""),
          color: String(item.color ?? ""),
        },
      };
    });

    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const edges: Edge[] = rawEdges.map((item, index) => {
      const source = String(item.source);
      const target = String(item.target);
      const sourceNode = nodesById.get(source);
      const targetNode = nodesById.get(target);
      const inferredKind = inferEdgeKind(sourceNode, targetNode);
      const rawKind = item.kind === "inflow" || item.kind === "outflow" || item.kind === "neutral" ? item.kind : null;
      const kind = rawKind ?? inferredKind ?? "neutral";
      const weight = Number(item.weight ?? edgeWeightByKind(kind));
      return {
        id: String(item.id ?? `edge_${index + 1}`),
        source,
        target,
        sourceHandle: String(item.source_handle ?? item.sourceHandle ?? ""),
        targetHandle: String(item.target_handle ?? item.targetHandle ?? ""),
        label: (() => {
          if (kind === "outflow") return "-";
          if (kind === "inflow") return "+";
          const op = String(item.op ?? "");
          return isControlOp(op) ? opLabel(op) : "";
        })(),
        data: {
          kind,
          weight,
          op: isControlOp(String(item.op ?? "")) ? String(item.op) : "add",
          feedbackLoop: item.feedback_loop === true || item.feedbackLoop === true,
          feedbackLoopType: String(item.feedback_loop_type ?? item.feedbackLoopType ?? ""),
          reinforcingPolarity: String(item.reinforcing_polarity ?? item.reinforcingPolarity ?? ""),
          feedbackLoopPersistent: item.feedback_loop_persistent === true || item.feedbackLoopPersistent === true,
        },
      };
    });

    const rawLoops = Array.isArray(graph.feedbackLoops)
      ? (graph.feedbackLoops as Array<Record<string, unknown>>)
      : Array.isArray(graph.feedback_loops)
        ? (graph.feedback_loops as Array<Record<string, unknown>>)
        : [];

    const parsedLoops = rawLoops
      .map(parseLoopRecord)
      .filter((item): item is FeedbackLoop => Boolean(item));

    const feedbackLoops = sanitizeLoopCollection(parsedLoops, nodes, edges);

    set({
      nodes,
      edges,
      feedbackLoops,
      simulationSteps: [],
      sliderIndex: 0,
      lockEditing: false,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },
}));
