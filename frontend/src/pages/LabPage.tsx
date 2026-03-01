import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, { Background, BackgroundVariant, Edge, MarkerType, Node, ReactFlowInstance } from "reactflow";
import { useLocation } from "react-router-dom";
import "reactflow/dist/style.css";

import { ConstantNode } from "../components/ConstantNode";
import { BalancingSubmitPayload, ConnectedFlowOption, FeedbackLoopModal } from "../components/FeedbackLoopModal";
import { FlowNode } from "../components/FlowNode";
import { StockNode } from "../components/StockNode";
import { VariableNode } from "../components/VariableNode";
import { SimulationChart } from "../components/SimulationChart";
import { createSystem, fetchSystems, updateSystem } from "../features/systems/api";
import { RunStep, SystemModel } from "../types/api";
import { useAuthStore } from "../store/authStore";
import { BalancingFeedbackLoop, STOCK_COLOR_PRESETS, useLabStore } from "../store/labStore";

const DEFAULT_ZOOM = 0.6;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 3.0;
const MAX_ANIMATION_MS = 30_000;
const TARGET_FPS = 30;

type ControlOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";
type SourceHandleId = "source-left" | "source-right" | "source-top" | "source-bottom";
type TargetHandleId = "target-left" | "target-right" | "target-top" | "target-bottom";

const CONTROL_OPS: Array<{ value: ControlOp; label: string }> = [
  { value: "add", label: "+" },
  { value: "sub", label: "-" },
  { value: "mul", label: "*" },
  { value: "div", label: "/" },
  { value: "pow", label: "^" },
  { value: "mod", label: "%" },
];

function isVariableNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "variableNode" || String(node.id).startsWith("variable_");
}

function isConstantNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "constantNode" || String(node.id).startsWith("constant_");
}

function asNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function parseNumericString(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
}

function formatDisplayNumber(value: unknown, precision: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const fixed = num.toFixed(precision);
  const trimmed = fixed.replace(/\.?0+$/, "");
  if (trimmed === "-0") return "0";
  return trimmed;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildSaveSignature(title: string, graph: Record<string, unknown>): string {
  return JSON.stringify({ title: title.trim(), graph });
}

function cloneNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...(node.data ?? {}) } }));
}

function cloneEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge, data: { ...(edge.data ?? {}) } }));
}

function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function applyOperation(current: number, input: number, op: ControlOp): number {
  switch (op) {
    case "add":
      return current + input;
    case "sub":
      return current - input;
    case "mul":
      return current * input;
    case "div":
      return input === 0 ? current : current / input;
    case "pow":
      return current ** input;
    case "mod":
      return input === 0 ? current : current % input;
    default:
      return current;
  }
}

function controlEdgeColor(op: ControlOp): string {
  const palette: Record<ControlOp, string> = {
    add: "#22c55e",
    sub: "#ef4444",
    mul: "#a855f7",
    div: "#eab308",
    pow: "#06b6d4",
    mod: "#f97316",
  };
  return palette[op];
}

function isFlowNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "flowNode" || String(node.id).startsWith("flow_");
}

function isStockNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "stockNode" || String(node.id).startsWith("stock_");
}

function edgeKind(edge: Edge, nodesById: Map<string, Node>): "inflow" | "outflow" | "neutral" {
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (!sourceNode || !targetNode) return "neutral";
  if (isStockNode(sourceNode) && isFlowNode(targetNode)) return "outflow";
  if (isFlowNode(sourceNode) && isStockNode(targetNode)) return "inflow";
  return "neutral";
}

function getNodeSize(node: Node): { width: number; height: number } {
  const n = node as Node & { measured?: { width?: number; height?: number } };
  const width = Number(n.width ?? n.measured?.width ?? 180);
  const height = Number(n.height ?? n.measured?.height ?? 64);
  return { width, height };
}

function getNodeCenter(node: Node): { x: number; y: number } {
  const { width, height } = getNodeSize(node);
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
}

function closestSourceHandle(sourceNode: Node, targetNode: Node, allowed?: SourceHandleId[]): string {
  const { width, height } = getNodeSize(sourceNode);
  const target = getNodeCenter(targetNode);
  const candidates = [
    { id: "source-left" as SourceHandleId, x: sourceNode.position.x, y: sourceNode.position.y + height / 2 },
    { id: "source-right" as SourceHandleId, x: sourceNode.position.x + width, y: sourceNode.position.y + height / 2 },
    { id: "source-top" as SourceHandleId, x: sourceNode.position.x + width / 2, y: sourceNode.position.y },
    { id: "source-bottom" as SourceHandleId, x: sourceNode.position.x + width / 2, y: sourceNode.position.y + height },
  ];
  const pool = allowed?.length ? candidates.filter((item) => allowed.includes(item.id)) : candidates;
  const fallback = pool[0] ?? candidates[0];
  let best = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of pool) {
    const dist = (item.x - target.x) ** 2 + (item.y - target.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best.id;
}

function closestTargetHandle(sourceNode: Node, targetNode: Node, allowed?: TargetHandleId[]): string {
  const { width, height } = getNodeSize(targetNode);
  const source = getNodeCenter(sourceNode);
  const candidates = [
    { id: "target-left" as TargetHandleId, x: targetNode.position.x, y: targetNode.position.y + height / 2 },
    { id: "target-right" as TargetHandleId, x: targetNode.position.x + width, y: targetNode.position.y + height / 2 },
    { id: "target-top" as TargetHandleId, x: targetNode.position.x + width / 2, y: targetNode.position.y },
    { id: "target-bottom" as TargetHandleId, x: targetNode.position.x + width / 2, y: targetNode.position.y + height },
  ];
  const pool = allowed?.length ? candidates.filter((item) => allowed.includes(item.id)) : candidates;
  const fallback = pool[0] ?? candidates[0];
  let best = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of pool) {
    const dist = (item.x - source.x) ** 2 + (item.y - source.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best.id;
}

function feedbackLoopHandlePolicy(
  edge: Edge,
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
): { sourceAllowed?: SourceHandleId[]; targetAllowed?: TargetHandleId[] } {
  if (!sourceNode || !targetNode) return {};
  if (edge.data?.feedbackLoop !== true) return {};

  const sourceRole = String(sourceNode.data?.loopRole ?? "");
  const targetRole = String(targetNode.data?.loopRole ?? "");

  // Stock -> Discrepancy should leave stock only through top/bottom handles.
  if (isStockNode(sourceNode) && targetRole === "discrepancy") {
    return { sourceAllowed: ["source-top", "source-bottom"] };
  }

  // Goal -> Discrepancy may enter from top or bottom only.
  if (sourceRole === "goal" && targetRole === "discrepancy") {
    return { targetAllowed: ["target-top", "target-bottom"] };
  }

  // Discrepancy -> Corrective should leave discrepancy from side handles only.
  if (sourceRole === "discrepancy" && targetRole === "correctiveAction") {
    return { sourceAllowed: ["source-left", "source-right"] };
  }

  // Corrective -> Flow should always enter flow via top/bottom handles.
  if (sourceRole === "correctiveAction" && isFlowNode(targetNode)) {
    return { targetAllowed: ["target-top", "target-bottom"] };
  }

  return {};
}

const EXPRESSION_FN_CACHE = new Map<string, (scope: Record<string, unknown>) => unknown>();

function evaluateExpression(expression: string, scope: Record<string, unknown>): number | null {
  const source = expression.trim();
  if (!source) return null;
  let compiled = EXPRESSION_FN_CACHE.get(source);
  if (!compiled) {
    // eslint-disable-next-line no-new-func
    compiled = new Function("scope", `with (scope) { return (${source}); }`) as (scope: Record<string, unknown>) => unknown;
    EXPRESSION_FN_CACHE.set(source, compiled);
  }
  try {
    const value = Number(compiled(scope));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function expressionScope(
  values: Record<string, number>,
  delayedValueResolver?: (nodeId: string, steps: number, currentValues: Record<string, number>) => number,
): Record<string, unknown> {
  const delayFn = (nodeId: unknown, steps: unknown): number => {
    if (!delayedValueResolver) return 0;
    const id = String(nodeId ?? "").trim();
    if (!id) return 0;
    const stepsNumber = Math.max(0, Math.floor(asNumber(steps, 0)));
    return delayedValueResolver(id, stepsNumber, values);
  };
  return {
    ...values,
    max: Math.max,
    min: Math.min,
    abs: Math.abs,
    pow: Math.pow,
    sqrt: Math.sqrt,
    exp: Math.exp,
    log: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    PI: Math.PI,
    E: Math.E,
    delay: delayFn,
  };
}

function collectConnectedFlows(stockId: string, nodesById: Map<string, Node>, edges: Edge[]): ConnectedFlowOption[] {
  const result = new Map<string, ConnectedFlowOption>();
  for (const edge of edges) {
    if (edge.source === stockId) {
      const flowNode = nodesById.get(edge.target);
      if (flowNode && isFlowNode(flowNode)) {
        result.set(flowNode.id, {
          id: flowNode.id,
          label: String(flowNode.data?.label ?? flowNode.id),
          direction: "outflow",
        });
      }
      continue;
    }
    if (edge.target === stockId) {
      const flowNode = nodesById.get(edge.source);
      if (flowNode && isFlowNode(flowNode)) {
        result.set(flowNode.id, {
          id: flowNode.id,
          label: String(flowNode.data?.label ?? flowNode.id),
          direction: "inflow",
        });
      }
    }
  }
  return Array.from(result.values()).sort((a, b) => a.label.localeCompare(b.label));
}

type NodeRect = { x: number; y: number; width: number; height: number };

function rectOverlaps(a: NodeRect, b: NodeRect, gap = 22): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function resolveFreePosition(
  initial: { x: number; y: number },
  size: { width: number; height: number },
  occupied: NodeRect[],
): { x: number; y: number } {
  const limit = 120;
  for (let i = 0; i < limit; i += 1) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const candidate = {
      x: initial.x + col * 26,
      y: initial.y + row * 26,
      width: size.width,
      height: size.height,
    };
    if (!occupied.some((item) => rectOverlaps(candidate, item))) {
      occupied.push(candidate);
      return { x: candidate.x, y: candidate.y };
    }
  }
  occupied.push({ x: initial.x, y: initial.y, width: size.width, height: size.height });
  return initial;
}

function proposeBalancingLoopPositions(stockNode: Node, flowNode: Node, existingNodes: Node[]): {
  goal: { x: number; y: number };
  discrepancy: { x: number; y: number };
  corrective: { x: number; y: number };
} {
  const occupied: NodeRect[] = existingNodes.map((node) => {
    const size = getNodeSize(node);
    return { x: node.position.x, y: node.position.y, width: size.width, height: size.height };
  });

  const stockSize = getNodeSize(stockNode);
  const flowSize = getNodeSize(flowNode);
  const lineNodeSize = { width: 190, height: 34 };

  const goal = resolveFreePosition(
    {
      x: stockNode.position.x + stockSize.width * 0.1,
      y: stockNode.position.y - 150,
    },
    lineNodeSize,
    occupied,
  );
  const discrepancy = resolveFreePosition(
    {
      x: stockNode.position.x + stockSize.width * 0.2,
      y: stockNode.position.y - 78,
    },
    lineNodeSize,
    occupied,
  );
  const corrective = {
    x: flowNode.position.x + flowSize.width / 2 - lineNodeSize.width / 2,
    y: flowNode.position.y - 86,
  };

  return { goal, discrepancy, corrective };
}

function proposeCorrectivePosition(flowNode: Node): { x: number; y: number } {
  const flowSize = getNodeSize(flowNode);
  const x = flowNode.position.x + flowSize.width / 2 - 190 / 2;
  const y = flowNode.position.y - 86;
  return { x, y };
}

function LockToggleIcon({ locked }: { locked: boolean }): JSX.Element {
  if (locked) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.4-2.1" />
      <path d="M18.5 8.2L20.8 6" />
    </svg>
  );
}

export function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("My dynamic system");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [pasteCounter, setPasteCounter] = useState(0);
  const [stepsInput, setStepsInput] = useState("60");
  const [dtInput, setDtInput] = useState("1");
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const [selectedNodeNumericInput, setSelectedNodeNumericInput] = useState("");
  const [createFeedbackLoopStockId, setCreateFeedbackLoopStockId] = useState<string | null>(null);
  const [editingFeedbackLoopId, setEditingFeedbackLoopId] = useState<string | null>(null);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.dataset.theme === "light";
  });
  const animationRef = useRef<number | null>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const skipHistoryPushRef = useRef(false);
  const lastHistorySigRef = useRef("");
  const loadedSystemGraphIdRef = useRef<number | null>(null);
  const userId = useAuthStore((state) => state.userId);
  const location = useLocation();
  const systemsQuery = useQuery({ queryKey: ["systems"], queryFn: fetchSystems });

  const {
    nodes,
    edges,
    feedbackLoops,
    steps,
    dt,
    algorithm,
    simulationSteps,
    sliderIndex,
    selectedNodeId,
    selectedEdgeId,
    activeSystemId,
    lockEditing,
    setSteps,
    setDt,
    setAlgorithm,
    setSliderIndex,
    setLockEditing,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNodeId,
    setSelectedEdgeId,
    setActiveSystemId,
    updateSelectedNode,
    updateSelectedEdge,
    addStock,
    addFlow,
    addConstant,
    addVariable,
    toGraphJson,
    clearSimulation,
    setSimulationSteps,
    replaceGraph,
    loadGraphJson,
    createBalancingFeedbackLoop,
    updateBalancingFeedbackLoop,
    deleteBalancingFeedbackLoop,
  } = useLabStore();

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const isSelectedStock = selectedNode?.type === "stockNode";
  const selectedEdgeIsControl = useMemo(() => {
    if (!selectedEdge) return false;
    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);
    return (
      (isConstantNode(sourceNode) || isVariableNode(sourceNode)) &&
      isFlowNode(targetNode) &&
      selectedEdge.data?.feedbackLoop !== true
    );
  }, [nodes, selectedEdge]);
  const selectedEdgeOp = useMemo(() => {
    if (!selectedEdgeIsControl || !selectedEdge) return "add";
    const op = String(selectedEdge.data?.op ?? "add");
    return CONTROL_OPS.some((item) => item.value === op) ? (op as ControlOp) : "add";
  }, [selectedEdge, selectedEdgeIsControl]);
  const nodeTypes = useMemo(
    () => ({
      flowNode: FlowNode,
      stockNode: StockNode,
      constantNode: ConstantNode,
      variableNode: VariableNode,
    }),
    [],
  );
  const titleTrimmed = title.trim();
  const duplicateTitleExists = useMemo(() => {
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    if (!userId || !titleTrimmed) return false;
    const current = normalizeTitle(titleTrimmed);
    return systems.some(
      (system) => system.owner_id === userId && system.id !== activeSystemId && normalizeTitle(system.title) === current,
    );
  }, [systemsQuery.data, titleTrimmed, userId, activeSystemId]);
  const saveBlockedReason = useMemo(() => {
    if (!titleTrimmed) return "System title is required.";
    if (duplicateTitleExists) return "A system with this title already exists.";
    return null;
  }, [titleTrimmed, duplicateTitleExists]);
  const currentSaveSignature = useMemo(
    () => buildSaveSignature(titleTrimmed, toGraphJson() as Record<string, unknown>),
    [titleTrimmed, nodes, edges, feedbackLoops, toGraphJson],
  );
  const hasUnsavedChanges = useMemo(() => {
    if (lastSavedSignature === null) return true;
    return currentSaveSignature !== lastSavedSignature;
  }, [currentSaveSignature, lastSavedSignature]);
  const saveDisabledNoChanges = lastSavedSignature !== null && !hasUnsavedChanges;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user id");
      if (!titleTrimmed) throw new Error("System title is required.");
      if (duplicateTitleExists) throw new Error("A system with this title already exists.");
      const graph = toGraphJson() as {
        nodes?: Array<Record<string, unknown>>;
        edges?: Array<Record<string, unknown>>;
      };
      const snapshot = simulationSteps.length
        ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)]
        : null;

      if (snapshot && Array.isArray(graph.nodes)) {
        graph.nodes = graph.nodes.map((node) => {
          const nodeId = String(node.id ?? "");
          const live = snapshot.values[nodeId];
          if (live === undefined) return node;
          const isFlow = String(node.kind ?? "").includes("flow") || nodeId.startsWith("flow_");
          if (isFlow) {
            return {
              ...node,
              initial: live,
              quantity: live,
              bottleneck: live,
            };
          }
          return {
            ...node,
            initial: live,
            quantity: live,
          };
        });
      }

      if (activeSystemId) {
        return updateSystem(activeSystemId, { title: titleTrimmed, graph_json: graph });
      }
      return createSystem({ owner_id: userId, title: titleTrimmed, graph_json: graph });
    },
    onSuccess: (saved) => {
      setActiveSystemId(saved.id);
      loadedSystemGraphIdRef.current = saved.id;
      setSaveAttempted(false);
      const savedGraph =
        saved.graph_json && typeof saved.graph_json === "object"
          ? (saved.graph_json as Record<string, unknown>)
          : (toGraphJson() as Record<string, unknown>);
      setLastSavedSignature(buildSaveSignature(String(saved.title ?? titleTrimmed), savedGraph));
      queryClient.invalidateQueries({ queryKey: ["systems"] });
    },
  });
  const saveButtonDisabled = saveMutation.isPending || saveDisabledNoChanges;

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    const state = (location.state ?? {}) as { systemId?: number; systemTitle?: string; systemGraph?: Record<string, unknown> };
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
    if (typeof state.systemTitle === "string" && state.systemTitle.trim()) setTitle(state.systemTitle);
  }, [location.state, loadGraphJson, setActiveSystemId]);

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const editingFeedbackLoop = useMemo<BalancingFeedbackLoop | null>(
    () => feedbackLoops.find((loop) => loop.id === editingFeedbackLoopId) ?? null,
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
      feedbackLoops.map((loop) => ({
        ...loop,
        stockLabel: String(nodesById.get(loop.stockId)?.data?.label ?? loop.stockId),
        flowLabel: String(nodesById.get(loop.controlledFlowId)?.data?.label ?? loop.controlledFlowId),
        correctiveLabel: String(nodesById.get(loop.correctiveNodeId)?.data?.label ?? "Corrective Action"),
      })),
    [feedbackLoops, nodesById],
  );
  const feedbackLoopModalInitialValues = useMemo<Partial<BalancingSubmitPayload> | undefined>(() => {
    if (!editingFeedbackLoop) return undefined;
    return {
      boundaryType: editingFeedbackLoop.boundaryType,
      goalValue: editingFeedbackLoop.goalValue,
      adjustmentTime: editingFeedbackLoop.adjustmentTime,
      controlledFlowId: editingFeedbackLoop.controlledFlowId,
      operation: editingFeedbackLoop.operation,
      delayEnabled: editingFeedbackLoop.delayEnabled,
      delaySteps: editingFeedbackLoop.delaySteps,
      correctiveLabel: String(nodesById.get(editingFeedbackLoop.correctiveNodeId)?.data?.label ?? "Corrective Action"),
    };
  }, [editingFeedbackLoop, nodesById]);
  useEffect(() => {
    if (!createFeedbackLoopStockId) return;
    if (!nodesById.has(createFeedbackLoopStockId)) setCreateFeedbackLoopStockId(null);
  }, [createFeedbackLoopStockId, nodesById]);
  useEffect(() => {
    if (!editingFeedbackLoopId) return;
    if (!feedbackLoops.some((loop) => loop.id === editingFeedbackLoopId)) setEditingFeedbackLoopId(null);
  }, [editingFeedbackLoopId, feedbackLoops]);
  useEffect(() => {
    if (!lockEditing) return;
    if (createFeedbackLoopStockId) setCreateFeedbackLoopStockId(null);
    if (editingFeedbackLoopId) setEditingFeedbackLoopId(null);
  }, [lockEditing, createFeedbackLoopStockId, editingFeedbackLoopId]);

  const currentSnapshot = useMemo(
    () => (simulationSteps.length ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)] : null),
    [simulationSteps, sliderIndex],
  );
  const selectedNodeLiveValue = useMemo(() => {
    if (!selectedNode || !currentSnapshot) return undefined;
    return currentSnapshot.values[selectedNode.id];
  }, [selectedNode, currentSnapshot]);
  const selectedNodeNumericCurrent = useMemo(() => {
    if (!selectedNode) return null;
    if (isFlowNode(selectedNode)) {
      return Number(selectedNodeLiveValue ?? selectedNode.data?.bottleneck ?? selectedNode.data?.quantity ?? 0);
    }
    return Number(selectedNodeLiveValue ?? selectedNode.data?.quantity ?? selectedNode.data?.initial ?? 0);
  }, [selectedNode, selectedNodeLiveValue]);
  useEffect(() => {
    setStepsInput(String(steps));
  }, [steps]);

  useEffect(() => {
    setDtInput(String(dt));
  }, [dt]);

  useEffect(() => {
    if (!selectedNode || selectedNodeNumericCurrent === null) {
      setSelectedNodeNumericInput("");
      return;
    }
    setSelectedNodeNumericInput(String(selectedNodeNumericCurrent));
  }, [selectedNode?.id, selectedNodeNumericCurrent]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const syncTheme = () => setIsLightTheme(root.dataset.theme === "light");
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (activeSystemId === null) {
      loadedSystemGraphIdRef.current = null;
      setLastSavedSignature(null);
      return;
    }
    if (loadedSystemGraphIdRef.current === activeSystemId) return;
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    const currentSystem = systems.find((system) => system.id === activeSystemId);
    if (!currentSystem) return;
    const graph =
      currentSystem.graph_json && typeof currentSystem.graph_json === "object"
        ? (currentSystem.graph_json as Record<string, unknown>)
        : {};
    loadGraphJson(graph);
    loadedSystemGraphIdRef.current = activeSystemId;
    setLastSavedSignature(buildSaveSignature(String(currentSystem.title ?? ""), graph));
    if (currentSystem.title) setTitle(currentSystem.title);
  }, [activeSystemId, systemsQuery.data, loadGraphJson]);

  const displayedNodes: Node[] = useMemo(() => {
    const displayPrecision = algorithm === "rk4_v2" ? 8 : 3;
    const loopByDiscrepancyId = new Map(feedbackLoops.map((loop) => [loop.discrepancyNodeId, loop] as const));
    const baseNodes = nodes.map((node) => {
      const liveValue = currentSnapshot?.values[node.id];
      const quantity =
        liveValue !== undefined && !isFlowNode(node)
          ? liveValue
          : node.data?.quantity;
      const bottleneck =
        liveValue !== undefined && isFlowNode(node)
          ? liveValue
          : node.data?.bottleneck;
      const discrepancyLoop = loopByDiscrepancyId.get(node.id);
      const stockNode = discrepancyLoop ? nodesById.get(discrepancyLoop.stockId) : undefined;
      const correctiveNode = discrepancyLoop ? nodesById.get(discrepancyLoop.correctiveNodeId) : undefined;
      const flowNode = discrepancyLoop ? nodesById.get(discrepancyLoop.controlledFlowId) : undefined;
      const discrepancyCenter = discrepancyLoop ? getNodeCenter(node) : null;
      const centroid =
        discrepancyLoop && stockNode && correctiveNode && flowNode && discrepancyCenter
          ? (() => {
              const points = [
                getNodeCenter(stockNode),
                getNodeCenter(correctiveNode),
                getNodeCenter(flowNode),
                discrepancyCenter,
              ];
              return {
                x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
                y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
              };
            })()
          : null;
      const balancingBadgeOffsetX =
        centroid && discrepancyCenter ? Math.max(-520, Math.min(520, centroid.x - discrepancyCenter.x)) : undefined;
      const balancingBadgeOffsetY =
        centroid && discrepancyCenter ? Math.max(-360, Math.min(360, centroid.y - discrepancyCenter.y)) : undefined;
      return {
        ...node,
        data: {
          ...node.data,
          quantity,
          bottleneck,
          displayQuantity: formatDisplayNumber(quantity, displayPrecision),
          displayBottleneck: formatDisplayNumber(bottleneck, displayPrecision),
          balancingLoopType: discrepancyLoop ? "B" : "",
          balancingBadgeOffsetX,
          balancingBadgeOffsetY,
        },
      };
    });
    return baseNodes;
  }, [nodes, currentSnapshot, algorithm, feedbackLoops, nodesById]);

  const displayedEdges: Edge[] = useMemo(
    () => {
      const baseEdges: Edge[] = edges.map((edge): Edge => {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        const handlePolicy = feedbackLoopHandlePolicy(edge, sourceNode, targetNode);
        const sourceHandle =
          sourceNode && targetNode
            ? closestSourceHandle(sourceNode, targetNode, handlePolicy.sourceAllowed)
            : edge.sourceHandle;
        const targetHandle =
          sourceNode && targetNode
            ? closestTargetHandle(sourceNode, targetNode, handlePolicy.targetAllowed)
            : edge.targetHandle;
        const kind = edgeKind(edge, nodesById);
        if (kind === "inflow") {
          return {
            ...edge,
            sourceHandle,
            targetHandle,
            className: "lab-edge-inflow",
            label: "+",
            style: { stroke: "#22c55e", strokeWidth: 2.2 },
            labelStyle: { fill: "#22c55e", fontWeight: 700 },
            labelBgStyle: { fill: "#050505" },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#22c55e" },
            data: { ...(edge.data ?? {}), kind: "inflow", weight: 1 },
          };
        }
        if (kind === "outflow") {
          return {
            ...edge,
            sourceHandle,
            targetHandle,
            className: "lab-edge-outflow",
            label: "-",
            style: { stroke: "#ef4444", strokeWidth: 2.2 },
            labelStyle: { fill: "#ef4444", fontWeight: 700 },
            labelBgStyle: { fill: "#050505" },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444" },
            data: { ...(edge.data ?? {}), kind: "outflow", weight: -1 },
          };
        }
        const isControl =
          (isConstantNode(sourceNode) || isVariableNode(sourceNode)) &&
          isFlowNode(targetNode);
        if (isControl) {
          const opRaw = String(edge.data?.op ?? "add");
          const op: ControlOp = CONTROL_OPS.some((item) => item.value === opRaw) ? (opRaw as ControlOp) : "add";
          const color = controlEdgeColor(op);
          return {
            ...edge,
            sourceHandle,
            targetHandle,
            className: `lab-edge-control lab-edge-control-${op}`,
            label: opRaw ? CONTROL_OPS.find((item) => item.value === op)?.label ?? String(edge.label ?? "") : String(edge.label ?? ""),
            style: { stroke: color, strokeWidth: 2.1 },
            labelStyle: { fill: color, fontWeight: 700 },
            labelBgStyle: { fill: "#050505" },
            markerEnd: { type: MarkerType.ArrowClosed, color },
            data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
          };
        }
        return {
          ...edge,
          sourceHandle,
          targetHandle,
          className: "lab-edge-neutral",
          label: String(edge.label ?? ""),
          style: { stroke: "#6b7280", strokeWidth: 2 },
          labelStyle: { fill: "#a3a3a3", fontWeight: 600 },
          labelBgStyle: { fill: "#050505" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
          data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
        };
      });
      return baseEdges;
    },
    [edges, nodesById],
  );

  function valueOfNode(
    node: Node,
    state: Record<string, number>,
    flowBottleneck: Record<string, number>,
  ): number {
    if (isFlowNode(node)) return flowBottleneck[node.id] ?? state[node.id] ?? asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0);
    return state[node.id] ?? asNumber(node.data?.quantity ?? node.data?.initial ?? 0);
  }

  function simulateTimeline(startState: Record<string, number>): RunStep[] {
    const dataSteps: RunStep[] = [];
    let state: Record<string, number> = { ...startState };
    const stepDt = Math.max(0.000001, asNumber(dt, 1));
    const expressionNodes = nodes.filter((node) => isConstantNode(node) || isVariableNode(node));
    const goalFallbackByLoopId = new Map<string, number>();
    const loopsByFlowId = new Map<string, BalancingFeedbackLoop[]>();
    for (const loop of feedbackLoops) {
      const list = loopsByFlowId.get(loop.controlledFlowId) ?? [];
      list.push(loop);
      loopsByFlowId.set(loop.controlledFlowId, list);
      const goalNode = nodesById.get(loop.goalNodeId);
      goalFallbackByLoopId.set(loop.id, asNumber(goalNode?.data?.quantity, loop.goalValue));
    }
    const stateHistory: Record<string, number>[] = [];
    const loopZeroHoldById = new Map<string, boolean>();

    function delayedValue(
      nodeId: string,
      stepsBack: number,
      currentValues: Record<string, number>,
    ): number {
      if (stepsBack <= 0) return asNumber(currentValues[nodeId], 0);
      if (stateHistory.length <= stepsBack) return 0;
      const historical = stateHistory[stateHistory.length - 1 - stepsBack];
      return asNumber(historical?.[nodeId], 0);
    }

    function resolveExpressionNodes(baseState: Record<string, number>, flowValues: Record<string, number>): Record<string, number> {
      const resolved: Record<string, number> = { ...baseState };
      const maxPasses = Math.max(2, expressionNodes.length);
      for (let pass = 0; pass < maxPasses; pass += 1) {
        let changed = false;
        for (const node of expressionNodes) {
          const expression = String(node.data?.expression ?? "").trim();
          if (!expression) continue;
          const fallback = asNumber(resolved[node.id], asNumber(node.data?.quantity ?? 0));
          const evaluated = evaluateExpression(
            expression,
            expressionScope({ ...resolved, ...flowValues }, delayedValue),
          );
          const nextValue = evaluated === null ? fallback : evaluated;
          if (Math.abs(asNumber(resolved[node.id], 0) - nextValue) > 1e-9) changed = true;
          resolved[node.id] = nextValue;
        }
        if (!changed) break;
      }
      return resolved;
    }

    function loopGapWithDelay(loop: BalancingFeedbackLoop, values: Record<string, number>): number {
      const delaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
      const resolveGap = (scope: Record<string, number>) => {
        const stock = asNumber(scope[loop.stockId], 0);
        const goalFallback = goalFallbackByLoopId.get(loop.id) ?? asNumber(loop.goalValue, 0);
        const goal = asNumber(scope[loop.goalNodeId], goalFallback);
        const rawGap = loop.boundaryType === "upper" ? stock - goal : goal - stock;
        return rawGap > 1e-9 ? rawGap : 0;
      };
      if (delaySteps <= 0) return resolveGap(values);
      if (stateHistory.length <= delaySteps) return 0;
      const historical = stateHistory[stateHistory.length - 1 - delaySteps];
      return resolveGap(historical);
    }

    function loopCorrectiveFromGap(loop: BalancingFeedbackLoop, gap: number): number {
      const adjustmentTime = Math.max(0.000001, asNumber(loop.adjustmentTime, 1));
      return gap / adjustmentTime;
    }

    state = resolveExpressionNodes(state, {});
    for (const loop of feedbackLoops) {
      const discrepancy = loopGapWithDelay(loop, state);
      state[loop.discrepancyNodeId] = discrepancy;
      state[loop.correctiveNodeId] = discrepancy > 1e-9 ? loopCorrectiveFromGap(loop, discrepancy) : 0;
      loopZeroHoldById.set(loop.id, false);
    }
    stateHistory.push({ ...state });
    const initialValues: Record<string, number> = {};
    for (const node of nodes) {
      initialValues[node.id] = asNumber(state[node.id], isFlowNode(node) ? asNumber(node.data?.bottleneck ?? 0) : asNumber(node.data?.quantity ?? 0));
    }
    dataSteps.push({ step_index: 0, time: 0, values: initialValues });

    for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
      const stepState = resolveExpressionNodes(state, {});
      const flowBottleneckRaw: Record<string, number> = {};
      const flowEffectiveRate: Record<string, number> = {};
      const nextState: Record<string, number> = { ...stepState };
      const loopDiscrepancyById = new Map<string, number>();
      const loopCorrectiveById = new Map<string, number>();

      for (const node of nodes) {
        if (!isFlowNode(node)) continue;
        const flowLoops = loopsByFlowId.get(node.id) ?? [];
        const isLoopControlledFlow = flowLoops.length > 0;
        const flowExpression = String(node.data?.expression ?? "").trim();
        let current = asNumber(stepState[node.id], asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));
        if (isLoopControlledFlow) {
          const baseFallback = asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0);
          const baseFlowExpression = String(
            node.data?.baseFlowExpression ?? flowLoops[0]?.baseFlowExpression ?? "",
          ).trim();
          current = baseFallback;
          if (baseFlowExpression.length > 0) {
            const evaluated = evaluateExpression(
              baseFlowExpression,
              expressionScope({ ...stepState, ...flowBottleneckRaw }, delayedValue),
            );
            if (evaluated !== null) {
              current = evaluated;
            } else {
              current = asNumber(baseFlowExpression, baseFallback);
            }
          }
        } else if (flowExpression.length > 0) {
          const evaluated = evaluateExpression(
            flowExpression,
            expressionScope({ ...stepState, ...flowBottleneckRaw }, delayedValue),
          );
          if (evaluated !== null) current = evaluated;
        }
        for (const edge of edges) {
          if (edge.target !== node.id) continue;
          if (edge.data?.feedbackLoop === true) continue;
          const sourceNode = nodesById.get(edge.source);
          if (!sourceNode) continue;
          if (!(isConstantNode(sourceNode) || isVariableNode(sourceNode))) continue;
          const input = valueOfNode(sourceNode, stepState, flowBottleneckRaw);
          const op = String(edge.data?.op ?? "add") as ControlOp;
          current = applyOperation(current, input, op);
        }
        if (isLoopControlledFlow) {
          for (const loop of flowLoops) {
            const sourceGap = loopGapWithDelay(loop, stepState);
            loopDiscrepancyById.set(loop.id, sourceGap);
            const isActive = sourceGap > 1e-9;
            const correctiveInput = isActive ? loopCorrectiveFromGap(loop, sourceGap) : 0;
            let zeroHold = loopZeroHoldById.get(loop.id) ?? false;

            if (!isActive) {
              zeroHold = false;
            } else if (loop.operation === "sub" && correctiveInput >= current - 1e-9) {
              zeroHold = true;
            }

            loopZeroHoldById.set(loop.id, zeroHold);
            loopCorrectiveById.set(loop.id, correctiveInput);

            if (zeroHold && loop.operation === "sub") {
              current = 0;
            } else {
              current = applyOperation(current, correctiveInput, loop.operation as ControlOp);
            }
          }
        }
        flowBottleneckRaw[node.id] = Math.max(0, Number.isFinite(current) ? current : 0);
      }

      const outflowByFlow = new Map<string, string[]>();
      for (const edge of edges) {
        const kind = edgeKind(edge, nodesById);
        if (kind !== "outflow") continue;
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) continue;
        const list = outflowByFlow.get(targetNode.id) ?? [];
        list.push(sourceNode.id);
        outflowByFlow.set(targetNode.id, list);
      }

      for (const node of nodes) {
        if (!isFlowNode(node)) continue;
        const flowId = node.id;
        const raw = asNumber(flowBottleneckRaw[flowId], 0);
        const sourceStocks = outflowByFlow.get(flowId) ?? [];
        if (sourceStocks.length === 0) {
          flowEffectiveRate[flowId] = raw;
          continue;
        }
        const totalAvailable = sourceStocks.reduce((acc, stockId) => acc + Math.max(0, asNumber(stepState[stockId], 0)), 0);
        if (totalAvailable <= 0) {
          flowEffectiveRate[flowId] = 0;
          continue;
        }
        const maxRateFromStocks = totalAvailable / stepDt;
        flowEffectiveRate[flowId] = Math.min(raw, maxRateFromStocks);
      }

      for (const [flowId, sourceStocks] of outflowByFlow.entries()) {
        const draw = Math.max(0, asNumber(flowEffectiveRate[flowId], 0) * stepDt);
        if (draw <= 0) continue;
        const availableList = sourceStocks.map((stockId) => ({
          stockId,
          available: Math.max(0, asNumber(stepState[stockId], 0)),
        }));
        const totalAvailable = availableList.reduce((acc, item) => acc + item.available, 0);
        if (totalAvailable <= 0) continue;
        for (const item of availableList) {
          const share = (item.available / totalAvailable) * draw;
          nextState[item.stockId] = Math.max(0, asNumber(nextState[item.stockId], 0) - share);
        }
      }

      for (const edge of edges) {
        const kind = edgeKind(edge, nodesById);
        if (kind === "neutral") continue;
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) continue;
        if (kind === "inflow") {
          const flowNode = sourceNode.id;
          const targetStock = targetNode.id;
          const delta = Math.max(0, asNumber(flowEffectiveRate[flowNode], 0) * stepDt);
          nextState[targetStock] = asNumber(nextState[targetStock], asNumber(stepState[targetStock], 0)) + delta;
        }
      }

      for (const node of nodes) {
        if (!isFlowNode(node)) continue;
        // Keep flow state as computed bottleneck (base +/- corrective actions).
        nextState[node.id] = asNumber(flowBottleneckRaw[node.id], asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));
      }

      let settledState = resolveExpressionNodes(nextState, flowEffectiveRate);

      for (const node of nodes) {
        if (!isVariableNode(node)) continue;
        const expression = String(node.data?.expression ?? "").trim();
        if (expression.length > 0) continue;
        const incoming = edges.filter((edge) => edge.target === node.id);
        if (incoming.length === 0) continue;
        let total = 0;
        for (const edge of incoming) {
          const sourceNode = nodesById.get(edge.source);
          if (!sourceNode) continue;
          total += valueOfNode(sourceNode, settledState, flowEffectiveRate);
        }
        settledState[node.id] = total;
      }
      settledState = resolveExpressionNodes(settledState, flowEffectiveRate);
      for (const loop of feedbackLoops) {
        const discrepancy = loopDiscrepancyById.get(loop.id) ?? loopGapWithDelay(loop, stepState);
        settledState[loop.discrepancyNodeId] = discrepancy;
        settledState[loop.correctiveNodeId] = loopCorrectiveById.get(loop.id) ?? 0;
      }

      const values: Record<string, number> = {};
      for (const node of nodes) {
        values[node.id] = asNumber(settledState[node.id], asNumber(node.data?.quantity ?? node.data?.bottleneck ?? 0));
      }
      dataSteps.push({ step_index: stepIndex, time: stepIndex, values });
      state = settledState;
      stateHistory.push({ ...state });
    }

    return dataSteps;
  }

  function playSimulation(stepsData: RunStep[]): void {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (stepsData.length === 0) return;

    const totalDurationMs = Math.min(MAX_ANIMATION_MS, Math.max(1000, stepsData.length * (1000 / TARGET_FPS)));
    const startTs = performance.now();
    setLockEditing(true);
    setIsPlaying(true);
    setSliderIndex(0);

    const tick = (now: number) => {
      const elapsed = now - startTs;
      const progress = Math.min(1, elapsed / totalDurationMs);
      const index = Math.min(stepsData.length - 1, Math.floor(progress * (stepsData.length - 1)));
      setSliderIndex(index);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      setSliderIndex(stepsData.length - 1);
      setLockEditing(false);
      setIsPlaying(false);
      animationRef.current = null;
    };

    animationRef.current = requestAnimationFrame(tick);
  }

  function resetZoomToDefault(): void {
    if (!rfInstance) return;
    rfInstance.zoomTo(DEFAULT_ZOOM, { duration: 180 });
    setZoomPercent(100);
  }

  function runLocalSimulation(): void {
    const startSnapshot =
      simulationSteps.length > 0 ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)] : null;
    const startState: Record<string, number> = {};
    for (const node of nodes) {
      if (startSnapshot && startSnapshot.values[node.id] !== undefined) {
        const raw = asNumber(startSnapshot.values[node.id], 0);
        startState[node.id] = isFlowNode(node) ? Math.max(0, raw) : raw;
      } else {
        if (isFlowNode(node)) {
          startState[node.id] = Math.max(0, asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));
        } else {
          startState[node.id] = asNumber(node.data?.quantity ?? node.data?.initial ?? 0);
        }
      }
    }
    const stepsData = simulateTimeline(startState);
    setSimulationSteps(stepsData);
    playSimulation(stepsData);
  }

  function exportJson(): void {
    const graph = toGraphJson() as Record<string, unknown>;
    const json = JSON.stringify(graph, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const safeTitle = titleTrimmed.replace(/[^a-zA-Z0-9_-]+/g, "_") || "system";
    const fileName = `${safeTitle}.json`;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleSaveSystem(): void {
    if (saveDisabledNoChanges) return;
    setSaveAttempted(true);
    if (saveBlockedReason) return;
    saveMutation.mutate();
  }

  function commitStepsInput(): void {
    const parsed = parseNumericString(stepsInput);
    if (parsed === null) {
      setStepsInput(String(steps));
      return;
    }
    setSteps(Math.max(1, Math.round(parsed)));
  }

  function commitDtInput(): void {
    const parsed = parseNumericString(dtInput);
    if (parsed === null) {
      setDtInput(String(dt));
      return;
    }
    setDt(Math.max(0.001, parsed));
  }

  function commitSelectedNodeNumericInput(): void {
    if (!selectedNode || selectedNodeNumericCurrent === null) return;
    const parsed = parseNumericString(selectedNodeNumericInput);
    if (parsed === null) {
      setSelectedNodeNumericInput(String(selectedNodeNumericCurrent));
      return;
    }
    if (simulationSteps.length > 0) {
      clearSimulation();
    }
    if (isFlowNode(selectedNode)) {
      updateSelectedNode({ bottleneck: Math.max(0, parsed) });
      return;
    }
    updateSelectedNode({ quantity: parsed });
  }

  function createBalancingLoopFromModal(payload: BalancingSubmitPayload) {
    if (!activeFeedbackLoopStockNode) {
      return { ok: false as const, error: "Selected stock is no longer available." };
    }
    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) {
      return { ok: false as const, error: "Selected controlled flow is not available." };
    }
    if (editingFeedbackLoop) {
      const correctivePosition = proposeCorrectivePosition(controlledFlow);
      const result = updateBalancingFeedbackLoop({
        id: editingFeedbackLoop.id,
        boundaryType: payload.boundaryType,
        goalValue: payload.goalValue,
        adjustmentTime: payload.adjustmentTime,
        operation: payload.operation,
        delayEnabled: payload.delayEnabled,
        delaySteps: payload.delaySteps,
        controlledFlowId: payload.controlledFlowId,
        correctiveLabel: payload.correctiveLabel,
        correctivePosition,
      });
      if (result.ok) setEditingFeedbackLoopId(null);
      return result;
    }
    const positions = proposeBalancingLoopPositions(activeFeedbackLoopStockNode, controlledFlow, nodes);
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
      correctiveLabel: payload.correctiveLabel,
      positions,
    });
    if (result.ok) setCreateFeedbackLoopStockId(null);
    return result;
  }

  function pushHistorySnapshot(nextNodes: Node[], nextEdges: Edge[]): void {
    const snapshot = { nodes: cloneNodes(nextNodes), edges: cloneEdges(nextEdges) };
    const history = historyRef.current;
    const last = history[history.length - 1];
    const isSame =
      !!last &&
      JSON.stringify(last.nodes) === JSON.stringify(snapshot.nodes) &&
      JSON.stringify(last.edges) === JSON.stringify(snapshot.edges);
    if (isSame) return;
    history.push(snapshot);
    if (history.length > 5) history.splice(0, history.length - 5);
  }

  function undoGraph(): void {
    const history = historyRef.current;
    if (history.length <= 1 || lockEditing) return;
    history.pop();
    const previous = history[history.length - 1];
    if (!previous) return;
    skipHistoryPushRef.current = true;
    replaceGraph(cloneNodes(previous.nodes), cloneEdges(previous.edges));
  }

  function getEffectiveSelection(): { nodeIds: string[]; edgeIds: string[] } {
    const nodeIds = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    const edgeIds = selectedEdgeIds.length ? selectedEdgeIds : selectedEdgeId ? [selectedEdgeId] : [];
    return { nodeIds, edgeIds };
  }

  function copySelection(): void {
    const { nodeIds, edgeIds } = getEffectiveSelection();
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    const nodeSet = new Set(nodeIds);
    const copiedNodes = nodes.filter((node) => nodeSet.has(node.id));
    const copiedEdges = edges.filter((edge) => {
      const selectedDirectly = edgeIds.includes(edge.id);
      const betweenCopiedNodes = nodeSet.has(edge.source) && nodeSet.has(edge.target);
      return selectedDirectly || betweenCopiedNodes;
    });
    clipboardRef.current = { nodes: cloneNodes(copiedNodes), edges: cloneEdges(copiedEdges) };
  }

  function deleteSelection(): void {
    if (lockEditing) return;
    const { nodeIds, edgeIds } = getEffectiveSelection();
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    const nodeSet = new Set(nodeIds);
    const edgeSet = new Set(edgeIds);
    const nextNodes = nodes.filter((node) => !nodeSet.has(node.id));
    const nextEdges = edges.filter((edge) => !edgeSet.has(edge.id) && !nodeSet.has(edge.source) && !nodeSet.has(edge.target));
    skipHistoryPushRef.current = true;
    replaceGraph(nextNodes, nextEdges);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function copySingleNode(nodeId: string): void {
    if (lockEditing) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    clipboardRef.current = { nodes: cloneNodes([node]), edges: [] };
    pasteSelection();
  }

  function deleteSingleNode(nodeId: string): void {
    if (lockEditing) return;
    const nextNodes = nodes.filter((node) => node.id !== nodeId);
    const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    skipHistoryPushRef.current = true;
    replaceGraph(nextNodes, nextEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function cutSelection(): void {
    copySelection();
    deleteSelection();
  }

  function pasteSelection(): void {
    if (lockEditing) return;
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const nextPasteCounter = pasteCounter + 1;
    setPasteCounter(nextPasteCounter);
    const idMap = new Map<string, string>();
    for (const node of clip.nodes) {
      idMap.set(node.id, `${node.id}_copy_${Date.now()}_${nextPasteCounter}`);
    }
    const offset = 26 * nextPasteCounter;
    const newNodes = clip.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? `${node.id}_copy_${Date.now()}`,
      selected: false,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      data: { ...(node.data ?? {}) },
    }));
    const newEdges: Edge[] = [];
    for (const edge of clip.edges) {
      const mappedSource = idMap.get(edge.source);
      const mappedTarget = idMap.get(edge.target);
      if (!mappedSource || !mappedTarget) continue;
      newEdges.push({
        ...edge,
        id: `${edge.id}_copy_${Date.now()}_${nextPasteCounter}`,
        selected: false,
        source: mappedSource,
        target: mappedTarget,
        data: { ...(edge.data ?? {}) },
      });
    }
    skipHistoryPushRef.current = true;
    replaceGraph([...nodes, ...newNodes], [...edges, ...newEdges]);
    setSelectedNodeIds(newNodes.map((node) => node.id));
    setSelectedEdgeIds(newEdges.map((edge) => edge.id));
  }

  useEffect(() => {
    const sig = JSON.stringify({
      n: nodes.map((node) => ({ id: node.id, p: node.position, d: node.data, t: node.type })),
      e: edges.map((edge) => ({ id: edge.id, s: edge.source, t: edge.target, d: edge.data })),
    });
    if (sig === lastHistorySigRef.current) return;
    lastHistorySigRef.current = sig;
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      pushHistorySnapshot(nodes, edges);
      return;
    }
    pushHistorySnapshot(nodes, edges);
  }, [nodes, edges]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);
      if (!event.ctrlKey && !event.metaKey && !isTextInput && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier) return;
      const key = event.key.toLowerCase();
      if (isTextInput && key !== "s") return;
      if (key === "s") {
        event.preventDefault();
        handleSaveSystem();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        undoGraph();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const nextNodeIds = selectedNodes.map((node) => node.id).sort();
      const nextEdgeIds = selectedEdges.map((edge) => edge.id).sort();

      setSelectedNodeIds((prev) => (sameIdList(prev, nextNodeIds) ? prev : nextNodeIds));
      setSelectedEdgeIds((prev) => (sameIdList(prev, nextEdgeIds) ? prev : nextEdgeIds));

      if (selectedNodes.length === 1 && selectedEdges.length === 0) {
        const onlyId = selectedNodes[0].id;
        if (selectedNodeId !== onlyId) setSelectedNodeId(onlyId);
        return;
      }
      if (selectedEdges.length === 1 && selectedNodes.length === 0) {
        const onlyId = selectedEdges[0].id;
        if (selectedEdgeId !== onlyId) setSelectedEdgeId(onlyId);
        return;
      }
      if (selectedNodes.length === 0 && selectedEdges.length === 0) {
        if (selectedNodeId !== null) setSelectedNodeId(null);
        else if (selectedEdgeId !== null) setSelectedEdgeId(null);
      }
    },
    [selectedNodeId, selectedEdgeId, setSelectedNodeId, setSelectedEdgeId],
  );

  return (
    <section className="lab-editor-shell">
      <div className="lab-canvas-wrap">
        <div className="h-full w-full min-h-0 overflow-hidden">
          <ReactFlow
            className="lab-reactflow"
            style={{ background: isLightTheme ? "#ffffff" : "transparent" }}
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={handleSelectionChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setSelectedNodeIds([]);
              setSelectedEdgeIds([]);
            }}
            onInit={(instance) => {
              setRfInstance(instance);
              instance.zoomTo(DEFAULT_ZOOM, { duration: 0 });
              setZoomPercent(100);
            }}
            onMove={(_, viewport) => setZoomPercent(Math.round((viewport.zoom / DEFAULT_ZOOM) * 100))}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            panOnDrag={!canvasLocked}
            panOnScroll={!canvasLocked}
            zoomOnScroll={!canvasLocked}
            zoomOnPinch={!canvasLocked}
            zoomOnDoubleClick={!canvasLocked}
            selectionOnDrag
            selectionKeyCode="Shift"
            multiSelectionKeyCode="Shift"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color={isLightTheme ? "#d1d5db" : "#2b2b2b"} gap={24} size={1} />
          </ReactFlow>
        </div>
      </div>

      <div className="lab-canvas-toolbar" role="group" aria-label="Canvas controls">
        <button
          className="lab-canvas-btn"
          type="button"
          onClick={resetZoomToDefault}
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
        >
          <span aria-hidden="true">⤢</span>
        </button>
        <div className="lab-canvas-sep" />
        <button
          className="lab-canvas-btn"
          type="button"
          onClick={() => rfInstance?.zoomIn({ duration: 180 })}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <span aria-hidden="true">⊕</span>
        </button>
        <div className="lab-canvas-zoom">{Math.max(1, zoomPercent)}%</div>
        <button
          className="lab-canvas-btn"
          type="button"
          onClick={() => rfInstance?.zoomOut({ duration: 180 })}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <span aria-hidden="true">⊖</span>
        </button>
        <div className="lab-canvas-sep" />
        <button
          className={`lab-canvas-btn ${canvasLocked ? "lab-canvas-btn-active" : ""}`}
          type="button"
          onClick={() => setCanvasLocked((prev) => !prev)}
          aria-label={canvasLocked ? "Unlock workspace" : "Lock workspace"}
          title={canvasLocked ? "Unlock workspace" : "Lock workspace"}
        >
          <span className="lab-canvas-lock-icon" aria-hidden="true">
            <LockToggleIcon locked={canvasLocked} />
          </span>
        </button>
        <div className="lab-canvas-sep" />
        <button className="lab-canvas-btn lab-canvas-export" type="button" onClick={exportJson}>
          <span>Export</span>
          <span aria-hidden="true">⇩</span>
        </button>
      </div>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-left space-y-4">
        <h3 className="lab-panel-title">Simulation</h3>

        <label className="block text-sm lab-field">
          Steps
          <input
            className="lab-input mt-1"
            type="text"
            inputMode="numeric"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            onBlur={commitStepsInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitStepsInput();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        </label>

        <label className="block text-sm lab-field">
          dt
          <input
            className="lab-input mt-1"
            type="text"
            inputMode="decimal"
            value={dtInput}
            onChange={(e) => setDtInput(e.target.value)}
            onBlur={commitDtInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDtInput();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        </label>

        <label className="block text-sm lab-field">
          <span className="lab-label-row">
            <span>Solver</span>
              <span
                className="lab-help-dot"
                title={"Euler: simpler method for less complex systems when precision is not critical.\n\nRK4: more advanced method with more computations per step and higher accuracy."}
                aria-label="Solver help"
              >
                ?
              </span>
          </span>
          <select className="lab-input mt-1" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as "euler_v2" | "rk4_v2")}>
            <option value="euler_v2">Euler</option>
            <option value="rk4_v2">RK4</option>
          </select>
        </label>

        <button className="lab-btn lab-btn-primary w-full" onClick={runLocalSimulation} disabled={isPlaying}>
          {isPlaying ? "Running..." : "Run simulation"}
        </button>
        <button className="lab-btn lab-btn-secondary w-full" onClick={() => clearSimulation()}>Reset simulation</button>

        <div className="lab-divider pt-4">
          <label className="mb-1 block text-sm lab-field">Timeline</label>
          <input
            className="lab-range w-full"
            type="range"
            min={0}
            max={Math.max(0, simulationSteps.length - 1)}
            value={Math.min(sliderIndex, Math.max(0, simulationSteps.length - 1))}
            onChange={(e) => setSliderIndex(Number(e.target.value))}
            disabled={simulationSteps.length === 0}
          />
          <div className="mt-2 text-xs lab-muted">
            {simulationSteps.length
              ? `Step ${Math.min(sliderIndex, simulationSteps.length - 1)} / ${Math.max(0, simulationSteps.length - 1)}`
              : "Run simulation to enable slider"}
          </div>
        </div>

      </aside>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-right lab-system-panel">
        <div className="lab-system-row">
          <input
            className="lab-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="System title"
            aria-label="System title"
          />
          <button
            className={`lab-btn lab-btn-secondary ${saveDisabledNoChanges ? "lab-btn-save-idle" : ""}`}
            onClick={handleSaveSystem}
            disabled={saveButtonDisabled}
            title={saveDisabledNoChanges ? "No changes to save" : "Save system"}
          >
            Save system
          </button>
        </div>
        {saveAttempted && saveBlockedReason ? <div className="mt-2 text-xs lab-error">{saveBlockedReason}</div> : null}
        {saveMutation.isError ? <div className="mt-2 text-xs lab-error">Unable to save system.</div> : null}
      </aside>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-right lab-floating-panel-editor space-y-4">
        <h3 className="lab-panel-title">Editor</h3>
        <div className="grid grid-cols-2 gap-2">
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addStock} disabled={lockEditing}>+ Stock</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addFlow} disabled={lockEditing}>+ Flow</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addConstant} disabled={lockEditing}>+ Constant</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={addVariable} disabled={lockEditing}>+ Variable</button>
        </div>

        <div className="text-xs lab-muted">
          {lockEditing
            ? "Editing is locked while animation is running."
            : "Select a node or edge. Stock -> Flow = outflow (-, red). Flow -> Stock = inflow (+, green)."}
        </div>

        {selectedNode ? (
          <div className="space-y-2">
            <label className="block text-xs lab-field">
              Name
              <input
                className="lab-input mt-1"
                disabled={lockEditing}
                value={String(selectedNode.data?.label ?? "")}
                onChange={(e) => updateSelectedNode({ label: e.target.value })}
                placeholder="Label"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="lab-btn lab-btn-secondary"
                type="button"
                onClick={() => copySingleNode(selectedNode.id)}
                disabled={lockEditing}
                title="Copy node (Ctrl/Cmd+C)"
              >
                Copy
              </button>
              <button
                className="lab-btn lab-btn-secondary"
                type="button"
                onClick={() => deleteSingleNode(selectedNode.id)}
                disabled={lockEditing}
                title="Delete node"
              >
                Delete
              </button>
            </div>

            {isFlowNode(selectedNode) ? (
              <label className="block text-xs lab-field">
                <span className="lab-label-row">
                  <span>Bottleneck</span>
                  <span
                    className="lab-help-dot"
                    title="Defines how much a Flow transfers per time unit."
                    aria-label="Bottleneck help"
                  >
                    ?
                  </span>
                </span>
                <input
                  className="lab-input mt-1"
                  disabled={lockEditing}
                  type="text"
                  inputMode="decimal"
                  value={selectedNodeNumericInput}
                  onChange={(e) => setSelectedNodeNumericInput(e.target.value)}
                  onBlur={commitSelectedNodeNumericInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitSelectedNodeNumericInput();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Bottleneck"
                />
              </label>
            ) : (
              <label className="block text-xs lab-field">
                <span className="lab-label-row">
                  <span>Quantity</span>
                  <span
                    className="lab-help-dot"
                    title="Stores the current value for Stock, Constant, or Variable."
                    aria-label="Quantity help"
                  >
                    ?
                  </span>
                </span>
                <input
                  className="lab-input mt-1"
                  disabled={lockEditing}
                  type="text"
                  inputMode="decimal"
                  value={selectedNodeNumericInput}
                  onChange={(e) => setSelectedNodeNumericInput(e.target.value)}
                  onBlur={commitSelectedNodeNumericInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitSelectedNodeNumericInput();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Quantity"
                />
              </label>
            )}

            <label className="block text-xs lab-field">
              <span className="lab-label-row">
                <span>Unit (optional)</span>
                <span className="lab-help-dot" title="Optional metadata, for example kg, items, or L." aria-label="Unit help">
                  ?
                </span>
              </span>
              <input
                className="lab-input mt-1"
                disabled={lockEditing}
                type="text"
                value={String(selectedNode.data?.unit ?? "")}
                onChange={(e) => updateSelectedNode({ unit: e.target.value })}
                placeholder="e.g. kg, items, L"
              />
            </label>

            {isSelectedStock ? (
              <div className="space-y-2">
                <button
                  className="lab-btn lab-btn-secondary w-full"
                  type="button"
                  onClick={() => {
                    setEditingFeedbackLoopId(null);
                    setCreateFeedbackLoopStockId(selectedNode.id);
                  }}
                  disabled={lockEditing}
                >
                  Create Feedback Loop
                </button>
                <div className="text-xs lab-field">Stock color</div>
                <div className="lab-stock-palette">
                  {STOCK_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="lab-stock-color-btn"
                      style={{ backgroundColor: color }}
                      onClick={() => updateSelectedNode({ color })}
                      aria-label={`Select stock color ${color}`}
                      title={color}
                    />
                  ))}
                  <input
                    className="lab-stock-color-picker"
                    type="color"
                    value={String(selectedNode.data?.color ?? STOCK_COLOR_PRESETS[0])}
                    onChange={(e) => updateSelectedNode({ color: e.target.value })}
                    aria-label="Pick stock color"
                  />
                </div>
              </div>
            ) : null}

          </div>
        ) : null}

        <div className="lab-divider pt-3 space-y-2">
          <div className="text-sm lab-field">Feedback loops</div>
          {feedbackLoopList.length === 0 ? (
            <div className="text-xs lab-muted">No feedback loops yet.</div>
          ) : (
            <div className="lab-loop-list">
              {feedbackLoopList.map((loop) => (
                <div key={loop.id} className="lab-loop-item">
                  <div className="lab-loop-item-meta">
                    <div className="lab-loop-item-title">{loop.correctiveLabel}</div>
                    <div className="lab-loop-item-sub">
                      {loop.stockLabel} {"->"} {loop.flowLabel} ({loop.operation}) | t={loop.adjustmentTime}
                      {loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="lab-btn lab-btn-secondary lab-btn-compact"
                      type="button"
                      disabled={lockEditing}
                      onClick={() => {
                        setCreateFeedbackLoopStockId(null);
                        setEditingFeedbackLoopId(loop.id);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="lab-btn lab-btn-secondary lab-btn-compact"
                      type="button"
                      disabled={lockEditing}
                      onClick={() => {
                        const confirmed = window.confirm("Delete this feedback loop?");
                        if (!confirmed) return;
                        const result = deleteBalancingFeedbackLoop(loop.id);
                        if (!result.ok) window.alert(result.error);
                        setEditingFeedbackLoopId((prev) => (prev === loop.id ? null : prev));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEdge && selectedEdgeIsControl ? (
          <div className="lab-divider pt-3 space-y-2">
            <div className="text-sm lab-field">Edge: {selectedEdge.id}</div>
            <label className="block text-xs lab-field">
              Operation on flow bottleneck
              <select
                className="lab-input mt-1"
                disabled={lockEditing}
                value={selectedEdgeOp}
                onChange={(e) => updateSelectedEdge({ op: e.target.value })}
              >
                {CONTROL_OPS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label} ({op.value})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="lab-divider pt-3">
          <div className="lab-chart-head">
            <span className="text-xs lab-field">Simulation chart</span>
            <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(true)}>
              Expand
            </button>
          </div>
          <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} chartHeight={220} isLightTheme={isLightTheme} />
        </div>
      </aside>
      <FeedbackLoopModal
        isOpen={activeFeedbackLoopStockNode !== null}
        mode={editingFeedbackLoop ? "edit" : "create"}
        initialValues={feedbackLoopModalInitialValues}
        stockLabel={String(activeFeedbackLoopStockNode?.data?.label ?? activeFeedbackLoopStockNode?.id ?? "Stock")}
        connectedFlows={feedbackLoopFlowOptions}
        onClose={() => {
          setCreateFeedbackLoopStockId(null);
          setEditingFeedbackLoopId(null);
        }}
        onSubmitBalancingLoop={createBalancingLoopFromModal}
      />
      {isChartModalOpen ? (
        <div className="lab-modal-overlay" onClick={() => setIsChartModalOpen(false)}>
          <div className="lab-chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Simulation chart</h3>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(false)}>
                Close
              </button>
            </div>
            <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} chartHeight="72vh" isLightTheme={isLightTheme} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
