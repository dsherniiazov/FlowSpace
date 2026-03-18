import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, { Background, BackgroundVariant, Edge, MarkerType, Node, ReactFlowInstance } from "reactflow";
import { useLocation, useNavigate } from "react-router-dom";
import "reactflow/dist/style.css";

import { ConstantNode } from "../components/ConstantNode";
import { CommentNode } from "../components/CommentNode";
import {
  BalancingSubmitPayload,
  ConnectedFlowOption,
  FeedbackLoopModal,
  ReinforcingSubmitPayload,
} from "../components/FeedbackLoopModal";
import { FlowNode } from "../components/FlowNode";
import { StockNode } from "../components/StockNode";
import { VariableNode } from "../components/VariableNode";
import { SimulationChart } from "../components/SimulationChart";
import { AnimatedParticleEdge } from "../components/AnimatedParticleEdge";
import { fetchLessonTasks } from "../features/lessonTasks/api";
import { createSystem, fetchSystems, markSystemChangesSeen, submitSystemForReview, updateSystem } from "../features/systems/api";
import { completeTask, fetchCompletedTasks } from "../features/taskProgress/api";
import { LessonTask, RunStep, SystemModel } from "../types/api";
import { useAuthStore } from "../store/authStore";
import { BalancingFeedbackLoop, FeedbackLoop, ReinforcingFeedbackLoop, useLabStore } from "../store/labStore";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";
import { getLabColorTokens, resolveStockColor, useUiPreferencesStore } from "../store/uiPreferencesStore";
import { useTutorialStore } from "../store/tutorialStore";
import { TutorialOverlay } from "../components/TutorialOverlay";

const DEFAULT_ZOOM = 0.6;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 3.0;
const MAX_ANIMATION_MS = 30_000;
const TARGET_FPS = 30;

type ControlOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";
type SourceHandleId = "source-left" | "source-right" | "source-top" | "source-bottom";
type TargetHandleId = "target-left" | "target-right" | "target-top" | "target-bottom";
type LabTaskContext = {
  taskId: number;
  lessonId: number;
  taskTitle: string;
  taskDescription: string;
};
type LabNavigationState = {
  systemId?: number;
  systemTitle?: string;
  systemGraph?: Record<string, unknown>;
  taskContext?: LabTaskContext;
};

const CONTROL_OPS: Array<{ value: ControlOp; label: string }> = [
  { value: "add", label: "+" },
  { value: "sub", label: "-" },
  { value: "mul", label: "*" },
  { value: "div", label: "/" },
  { value: "pow", label: "^" },
  { value: "mod", label: "%" },
];

function HelpTip({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const BUBBLE_W = 234;
  const MARGIN = 8;

  function show() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const idealLeft = rect.left + rect.width / 2;
      const clampedLeft = Math.min(
        Math.max(idealLeft, MARGIN + BUBBLE_W / 2),
        window.innerWidth - MARGIN - BUBBLE_W / 2,
      );
      setPos({ top: rect.top - 8, left: clampedLeft });
    }
    setOpen(true);
  }

  return (
    <span
      ref={ref}
      className="lab-help-dot"
      style={{ cursor: "help", flexShrink: 0 }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-label="Help"
    >
      ?
      {open && createPortal(
        <span
          className="lab-help-bubble"
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

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

function controlEdgeColor(op: ControlOp, colorPalette: ReturnType<typeof getLabColorTokens>): string {
  return colorPalette.control[op];
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

  // Stock -> Reinforcing Multiplier should leave stock via top/bottom handles only.
  if (isStockNode(sourceNode) && targetRole === "reinforcingMultiplier") {
    return { sourceAllowed: ["source-top", "source-bottom"] };
  }

  // Reinforcing Multiplier -> Flow should enter flow via top/bottom handles only.
  if (sourceRole === "reinforcingMultiplier" && isFlowNode(targetNode)) {
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

function proposeReinforcingLoopPositions(
  stockNode: Node,
  flowNode: Node,
  existingNodes: Node[],
  includeGrowthLimit: boolean,
): {
  multiplier: { x: number; y: number };
  growthLimit?: { x: number; y: number };
  marker: { x: number; y: number };
} {
  const occupied: NodeRect[] = existingNodes.map((node) => {
    const size = getNodeSize(node);
    return { x: node.position.x, y: node.position.y, width: size.width, height: size.height };
  });
  const stockCenter = getNodeCenter(stockNode);
  const flowCenter = getNodeCenter(flowNode);
  const multiplierSize = { width: 190, height: 34 };
  const markerSize = { width: 34, height: 34 };

  const multiplier = resolveFreePosition(
    {
      x: (stockCenter.x + flowCenter.x) / 2 - multiplierSize.width / 2,
      y: Math.min(stockCenter.y, flowCenter.y) - 84,
    },
    multiplierSize,
    occupied,
  );
  const growthLimit = includeGrowthLimit
    ? resolveFreePosition(
        {
          x: multiplier.x,
          y: multiplier.y - 78,
        },
        multiplierSize,
        occupied,
      )
    : undefined;
  const marker = resolveFreePosition(
    {
      x: (stockCenter.x + flowCenter.x + (multiplier.x + multiplierSize.width / 2)) / 3 - markerSize.width / 2,
      y: (stockCenter.y + flowCenter.y + (multiplier.y + multiplierSize.height / 2)) / 3 - markerSize.height / 2,
    },
    markerSize,
    occupied,
  );
  return { multiplier, growthLimit, marker };
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
  const navigate = useNavigate();
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const labColorTokens = useMemo(() => getLabColorTokens(colorblindMode, highContrastMode), [colorblindMode, highContrastMode]);
  const stockColorPresets = labColorTokens.stockPresets;
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const [title, setTitle] = useState("My dynamic system");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isConfirmNewSystemOpen, setIsConfirmNewSystemOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
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
  const [lessonTaskContext, setLessonTaskContext] = useState<LabTaskContext | null>(null);
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; flowX: number; flowY: number } | null>(null);
  const [addCommentNodeId, setAddCommentNodeId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
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
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const userEmail = useAuthStore((state) => state.email);
  const location = useLocation();
  const systemsQuery = useQuery({
    queryKey: ["systems", userId],
    queryFn: fetchSystems,
    enabled: !!userId,
  });
  const lessonTasksQuery = useQuery({
    queryKey: ["lesson-tasks", lessonTaskContext?.lessonId ?? null],
    queryFn: () => fetchLessonTasks(lessonTaskContext?.lessonId),
    enabled: lessonTaskContext !== null,
  });
  const completedTasksQuery = useQuery({
    queryKey: ["completed-tasks", userId],
    queryFn: fetchCompletedTasks,
    enabled: lessonTaskContext !== null && !!userId,
  });
  const currentUserProfileQuery = useQuery({
    queryKey: ["profile-lab", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await (await import("../lib/api")).api.get(`/users/${userId}`);
      return data as { id: number; name: string; last_name: string; email: string; avatar_path?: string | null };
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

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
    addNodeAtPosition,
    toGraphJson,
    clearSimulation,
    setSimulationSteps,
    replaceGraph,
    resetToInitialGraph,
    loadGraphJson,
    createBalancingFeedbackLoop,
    createReinforcingFeedbackLoop,
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
      commentNode: CommentNode,
    }),
    [],
  );
  const edgeTypes = useMemo(
    () => ({ default: AnimatedParticleEdge }),
    [],
  );
  const titleTrimmed = title.trim();
  const duplicateTitleExists = useMemo(() => {
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    if (!userId || !titleTrimmed) return false;
    if (activeSystemId !== null && !systems.some((system) => system.id === activeSystemId && system.owner_id === userId)) {
      return false;
    }
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
  const lessonTasks: LessonTask[] = useMemo(
    () =>
      [...(lessonTasksQuery.data ?? [])].sort(
        (a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER),
      ),
    [lessonTasksQuery.data],
  );
  const completedTaskSet = useMemo(
    () => new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)),
    [completedTasksQuery.data],
  );
  const isCurrentTaskCompleted = lessonTaskContext ? completedTaskSet.has(lessonTaskContext.taskId) : false;
  const nextLessonTask = useMemo(() => {
    if (!lessonTaskContext) return null;
    const currentTaskIndex = lessonTasks.findIndex((task) => task.id === lessonTaskContext.taskId);
    if (currentTaskIndex < 0) return null;
    return lessonTasks[currentTaskIndex + 1] ?? null;
  }, [lessonTaskContext, lessonTasks]);
  const canResolveLessonNavigation = lessonTaskContext !== null && !lessonTasksQuery.isLoading && !lessonTasksQuery.isError;

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
      return createSystem({ title: titleTrimmed, graph_json: graph });
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
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["completed-tasks", userId] });
      queryClient.invalidateQueries({ queryKey: ["completed-lessons", userId] });
      queryClient.invalidateQueries({ queryKey: ["progress", userId] });
    },
  });
  const submitForReviewMutation = useMutation({
    mutationFn: async (systemId: number) => submitSystemForReview(systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });
  const markSeenMutation = useMutation({
    mutationFn: async (systemId: number) => markSystemChangesSeen(systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    },
  });
  const saveButtonDisabled = saveMutation.isPending || saveDisabledNoChanges;

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    const state = (location.state ?? {}) as LabNavigationState;
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
    const taskContext = state.taskContext;
    const hasTaskContext =
      taskContext &&
      typeof taskContext.taskId === "number" &&
      typeof taskContext.lessonId === "number" &&
      typeof taskContext.taskTitle === "string" &&
      typeof taskContext.taskDescription === "string";
    if (hasTaskContext) {
      setLessonTaskContext({
        taskId: taskContext.taskId,
        lessonId: taskContext.lessonId,
        taskTitle: taskContext.taskTitle,
        taskDescription: taskContext.taskDescription,
      });
      setIsTaskModalOpen(false);
      // Auto-start tutorial for intro tasks
      if (taskContext.taskTitle === "Simulation") {
        useTutorialStore.getState().startLesson("simulation");
      } else if (taskContext.taskTitle === "Editor") {
        useTutorialStore.getState().startLesson("editor");
      } else if (taskContext.taskTitle === "Workspace") {
        useTutorialStore.getState().startLesson("workspace");
      }
    } else {
      setLessonTaskContext(null);
      setIsTaskModalOpen(false);
    }
    if (typeof state.systemTitle === "string" && state.systemTitle.trim()) setTitle(state.systemTitle);
  }, [location.state, loadGraphJson, setActiveSystemId]);

  // Auto-mark changes as seen when the system is loaded
  useEffect(() => {
    if (!activeSystemId) return;
    const systems = (systemsQuery.data ?? []) as SystemModel[];
    const current = systems.find((s) => s.id === activeSystemId);
    if (current?.has_unseen_changes) {
      markSeenMutation.mutate(activeSystemId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystemId, systemsQuery.data]);

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
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
      feedbackLoops.map((loop) => ({
        ...loop,
        stockLabel: String(nodesById.get(loop.stockId)?.data?.label ?? loop.stockId),
        flowLabel: String(nodesById.get(loop.controlledFlowId)?.data?.label ?? loop.controlledFlowId),
        loopLabel:
          loop.type === "balancing"
            ? String(nodesById.get(loop.correctiveNodeId)?.data?.label ?? "Corrective Action")
            : String(nodesById.get(loop.multiplierNodeId)?.data?.label ?? "Multiplier"),
      })),
    [feedbackLoops, nodesById],
  );
  const feedbackLoopModalInitialTab = useMemo<"balancing" | "reinforcing" | undefined>(
    () => (editingFeedbackLoop ? editingFeedbackLoop.type : undefined),
    [editingFeedbackLoop],
  );
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
      growthLimit:
        editingFeedbackLoop.growthLimitNodeId
          ? asNumber(nodesById.get(editingFeedbackLoop.growthLimitNodeId)?.data?.quantity, 0)
          : undefined,
      clampNonNegative: editingFeedbackLoop.clampNonNegative,
      multiplierLabel:
        (() => {
          const raw = String(nodesById.get(editingFeedbackLoop.multiplierNodeId)?.data?.label ?? "Multiplier");
          return raw === "(R)" ? "Multiplier" : raw;
        })(),
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
    const balancingLoops = feedbackLoops.filter((loop): loop is BalancingFeedbackLoop => loop.type === "balancing");
    const reinforcingLoops = feedbackLoops.filter((loop): loop is ReinforcingFeedbackLoop => loop.type === "reinforcing");
    const loopByDiscrepancyId = new Map(balancingLoops.map((loop) => [loop.discrepancyNodeId, loop] as const));
    const loopByMultiplierId = new Map(reinforcingLoops.map((loop) => [loop.multiplierNodeId, loop] as const));
    const reinforcingLoopById = new Map(reinforcingLoops.map((loop) => [loop.id, loop] as const));
    const baseNodes = nodes.map((node) => {
      const isReinforcingMarkerNode = String(node.data?.loopRole ?? "") === "reinforcingMarker";
      if (isReinforcingMarkerNode) {
        const loopId = String(node.data?.loopId ?? "");
        const loop = reinforcingLoopById.get(loopId);
        if (!loop) return node;
        const stockNode = nodesById.get(loop.stockId);
        const multiplierNode = nodesById.get(loop.multiplierNodeId);
        const flowNode = nodesById.get(loop.controlledFlowId);
        if (!stockNode || !multiplierNode || !flowNode) return node;
        const stockCenter = getNodeCenter(stockNode);
        const multiplierCenter = getNodeCenter(multiplierNode);
        const flowCenter = getNodeCenter(flowNode);
        const markerWidth = 28;
        const markerHeight = 20;
        const centerX = (stockCenter.x + multiplierCenter.x + flowCenter.x) / 3;
        const centerY = (stockCenter.y + multiplierCenter.y + flowCenter.y) / 3;
        return {
          ...node,
          position: {
            x: centerX - markerWidth / 2,
            y: centerY - markerHeight / 2,
          },
          data: {
            ...node.data,
            quantity: "",
            displayQuantity: "",
            label: String(node.data?.label ?? "(R)"),
          },
        };
      }
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
      const reinforcingLoop = loopByMultiplierId.get(node.id);
      const reinforcingCollapsed =
        reinforcingLoop && Math.abs(asNumber(reinforcingLoop.k, 1) - 1) <= 1e-9
          ? String(node.data?.label ?? "") === "(R)"
          : false;
      return {
        ...node,
        data: {
          ...node.data,
          quantity,
          bottleneck,
          displayQuantity: reinforcingCollapsed ? "" : formatDisplayNumber(quantity, displayPrecision),
          displayBottleneck: formatDisplayNumber(bottleneck, displayPrecision),
          balancingLoopType: discrepancyLoop ? "B" : "",
          balancingBadgeOffsetX,
          balancingBadgeOffsetY,
          reinforcingCollapsed,
          reinforcingK: reinforcingLoop?.k,
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
            style: { stroke: labColorTokens.inflow, strokeWidth: 2.2 },
            labelStyle: { fill: labColorTokens.inflow, fontWeight: 700 },
            labelBgStyle: { fill: isLightTheme ? labColorTokens.labelBgLight : labColorTokens.labelBgDark },
            markerEnd: { type: MarkerType.ArrowClosed, color: labColorTokens.inflow },
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
            style: { stroke: labColorTokens.outflow, strokeWidth: 2.2 },
            labelStyle: { fill: labColorTokens.outflow, fontWeight: 700 },
            labelBgStyle: { fill: isLightTheme ? labColorTokens.labelBgLight : labColorTokens.labelBgDark },
            markerEnd: { type: MarkerType.ArrowClosed, color: labColorTokens.outflow },
            data: { ...(edge.data ?? {}), kind: "outflow", weight: -1 },
          };
        }
        const reinforcingPolarity = String(edge.data?.reinforcingPolarity ?? "");
        if (edge.data?.feedbackLoopType === "reinforcing" && (reinforcingPolarity === "positive" || reinforcingPolarity === "negative")) {
          const color = labColorTokens.reinforcing[reinforcingPolarity];
          return {
            ...edge,
            sourceHandle,
            targetHandle,
            className: `lab-edge-reinforcing-${reinforcingPolarity}`,
            label: String(edge.label ?? ""),
            style: { stroke: color, strokeWidth: 2.1 },
            labelStyle: { fill: color, fontWeight: 700 },
            labelBgStyle: { fill: isLightTheme ? labColorTokens.labelBgLight : labColorTokens.labelBgDark },
            markerEnd: { type: MarkerType.ArrowClosed, color },
            data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
          };
        }
        const isControl =
          (isConstantNode(sourceNode) || isVariableNode(sourceNode)) &&
          isFlowNode(targetNode);
        if (isControl) {
          const opRaw = String(edge.data?.op ?? "add");
          const op: ControlOp = CONTROL_OPS.some((item) => item.value === opRaw) ? (opRaw as ControlOp) : "add";
          const color = controlEdgeColor(op, labColorTokens);
          return {
            ...edge,
            sourceHandle,
            targetHandle,
            className: `lab-edge-control lab-edge-control-${op}`,
            label: opRaw ? CONTROL_OPS.find((item) => item.value === op)?.label ?? String(edge.label ?? "") : String(edge.label ?? ""),
            style: { stroke: color, strokeWidth: 2.1 },
            labelStyle: { fill: color, fontWeight: 700 },
            labelBgStyle: { fill: isLightTheme ? labColorTokens.labelBgLight : labColorTokens.labelBgDark },
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
          style: { stroke: labColorTokens.neutral, strokeWidth: 2 },
          labelStyle: { fill: labColorTokens.neutralLabel, fontWeight: 600 },
          labelBgStyle: { fill: isLightTheme ? labColorTokens.labelBgLight : labColorTokens.labelBgDark },
          markerEnd: { type: MarkerType.ArrowClosed, color: labColorTokens.neutral },
          data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
        };
      });
      return baseEdges.map((e) => {
        let sourceValue = 0;
        if (isPlaying && currentSnapshot) {
          sourceValue = Math.abs(currentSnapshot.values[e.source] ?? 0);
        }
        return {
          ...e,
          data: { ...(e.data ?? {}), animate: isPlaying && sourceValue > 0 },
        };
      });
    },
    [edges, isLightTheme, labColorTokens, nodesById, isPlaying, currentSnapshot],
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
    const balancingLoopsByFlowId = new Map<string, BalancingFeedbackLoop[]>();
    const reinforcingLoopsByFlowId = new Map<string, ReinforcingFeedbackLoop[]>();
    for (const loop of feedbackLoops) {
      if (loop.type === "balancing") {
        const list = balancingLoopsByFlowId.get(loop.controlledFlowId) ?? [];
        list.push(loop);
        balancingLoopsByFlowId.set(loop.controlledFlowId, list);
        const goalNode = nodesById.get(loop.goalNodeId);
        goalFallbackByLoopId.set(loop.id, asNumber(goalNode?.data?.quantity, loop.goalValue));
      } else {
        const list = reinforcingLoopsByFlowId.get(loop.controlledFlowId) ?? [];
        list.push(loop);
        reinforcingLoopsByFlowId.set(loop.controlledFlowId, list);
      }
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

    function reinforcingMultiplierFromScope(
      loop: ReinforcingFeedbackLoop,
      scope: Record<string, number> | null,
    ): number {
      if (!scope) return 0;
      const stockValue = asNumber(scope[loop.stockId], 0);
      const k = asNumber(loop.k, 1);
      if (!loop.growthLimitNodeId) return k * stockValue;
      const growthLimit = asNumber(scope[loop.growthLimitNodeId], 0);
      return k * stockValue * Math.max(0, growthLimit - stockValue);
    }

    state = resolveExpressionNodes(state, {});
    for (const loop of feedbackLoops) {
      if (loop.type !== "balancing") continue;
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
        const balancingFlowLoops = balancingLoopsByFlowId.get(node.id) ?? [];
        const reinforcingFlowLoops = reinforcingLoopsByFlowId.get(node.id) ?? [];
        const isLoopControlledFlow = balancingFlowLoops.length > 0 || reinforcingFlowLoops.length > 0;
        const flowExpression = String(node.data?.expression ?? "").trim();
        let current = asNumber(stepState[node.id], asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));
        if (isLoopControlledFlow) {
          const baseFallback = asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0);
          const baseFlowExpression = String(
            node.data?.baseFlowExpression ??
              balancingFlowLoops[0]?.baseFlowExpression ??
              reinforcingFlowLoops[0]?.baseFlowExpression ??
              "",
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
          for (const loop of balancingFlowLoops) {
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
          for (const loop of reinforcingFlowLoops) {
            const delaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
            const delayedScope =
              delaySteps > 0
                ? stateHistory.length <= delaySteps
                  ? null
                  : stateHistory[stateHistory.length - 1 - delaySteps]
                : stepState;
            const multiplierValue = reinforcingMultiplierFromScope(loop, delayedScope);
            current = loop.polarity === "negative" ? current - multiplierValue : current + multiplierValue;
            if (loop.clampNonNegative) current = Math.max(0, current);
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
        if (loop.type !== "balancing") continue;
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

  function handleSubmitForReview(): void {
    if (!activeSystemId) return;
    if (submitForReviewMutation.isPending) return;
    submitForReviewMutation.mutate(activeSystemId);
  }

  function handlePaneContextMenu(event: React.MouseEvent): void {
    if (lockEditing) return;
    event.preventDefault();
    const rfPos = rfInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
    setContextMenu({ screenX: event.clientX, screenY: event.clientY, flowX: rfPos.x, flowY: rfPos.y });
  }

  function handleContextMenuAddNode(type: "stock" | "flow" | "commentNode"): void {
    if (!contextMenu) return;
    const pos = { x: contextMenu.flowX, y: contextMenu.flowY };
    if (type === "commentNode") {
      const profile = currentUserProfileQuery.data;
      const authorName = profile ? `${profile.name} ${profile.last_name}`.trim() : "";
      const authorEmail = profile?.email ?? userEmail ?? "";
      const nodeId = addNodeAtPosition("commentNode", pos, {
        text: "",
        authorId: userId ?? 0,
        authorName,
        authorEmail,
        authorAvatarPath: profile?.avatar_path ?? null,
      });
      setAddCommentNodeId(nodeId);
      setCommentDraft("");
    } else {
      addNodeAtPosition(type, pos);
    }
    setContextMenu(null);
  }

  function handleMarkTaskCompleted(): void {
    if (!lessonTaskContext || isCurrentTaskCompleted || completeTaskMutation.isPending) return;
    completeTaskMutation.mutate(lessonTaskContext.taskId);
  }

  function handleTaskProgressNavigation(): void {
    if (!lessonTaskContext || !canResolveLessonNavigation) return;
    if (nextLessonTask) {
      navigate(`/app/tasks/${nextLessonTask.id}`);
      return;
    }
    navigate("/app/lessons");
  }

  function createNewSystem(): void {
    if (lockEditing) return;
    // During tutorial, skip confirmation
    if (useTutorialStore.getState().active) {
      doCreateNewSystem();
      return;
    }
    setIsConfirmNewSystemOpen(true);
  }

  function doCreateNewSystem(): void {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    setLockEditing(false);
    resetToInitialGraph();
    setActiveSystemId(null);
    loadedSystemGraphIdRef.current = null;
    setTitle("My dynamic system");
    setCreateFeedbackLoopStockId(null);
    setEditingFeedbackLoopId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setSaveAttempted(false);
    setLastSavedSignature(null);
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
    if (editingFeedbackLoop?.type === "balancing") {
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

  function createReinforcingLoopFromModal(payload: ReinforcingSubmitPayload) {
    if (!activeFeedbackLoopStockNode) {
      return { ok: false as const, error: "Selected stock is no longer available." };
    }
    const controlledFlow = nodesById.get(payload.controlledFlowId);
    if (!controlledFlow || !isFlowNode(controlledFlow)) {
      return { ok: false as const, error: "Selected controlled flow is not available." };
    }
    if (editingFeedbackLoop?.type === "reinforcing") {
      const deleteResult = deleteBalancingFeedbackLoop(editingFeedbackLoop.id);
      if (!deleteResult.ok) return deleteResult;
    }
    const positions = proposeReinforcingLoopPositions(
      activeFeedbackLoopStockNode,
      controlledFlow,
      nodes,
      payload.growthLimit !== undefined,
    );
    const result = createReinforcingFeedbackLoop({
      stockId: activeFeedbackLoopStockNode.id,
      controlledFlowId: payload.controlledFlowId,
      k: payload.k,
      polarity: payload.polarity,
      delayEnabled: payload.delayEnabled,
      delaySteps: payload.delaySteps,
      growthLimit: payload.growthLimit,
      clampNonNegative: payload.clampNonNegative,
      multiplierLabel: payload.multiplierLabel,
      positions,
    });
    if (result.ok) {
      setCreateFeedbackLoopStockId(null);
      setEditingFeedbackLoopId(null);
    }
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
    const nodeSet = new Set(
      nodeIds.filter((id) => nodesById.get(id)?.data?.feedbackLoopPersistent !== true),
    );
    const edgeSet = new Set(
      edgeIds.filter((id) => !edges.find((edge) => edge.id === id)?.data?.feedbackLoopPersistent),
    );
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
    const node = nodesById.get(nodeId);
    if (node?.data?.feedbackLoopPersistent === true) return;
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
      if (!isTextInput && matchesShortcutEvent(event, shortcutBindings.delete_selection)) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.save_system)) {
        event.preventDefault();
        handleSaveSystem();
        return;
      }
      if (isTextInput) return;
      if (matchesShortcutEvent(event, shortcutBindings.undo_graph)) {
        event.preventDefault();
        undoGraph();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.copy_selection)) {
        event.preventDefault();
        copySelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.cut_selection)) {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (matchesShortcutEvent(event, shortcutBindings.paste_selection)) {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    copySelection,
    cutSelection,
    deleteSelection,
    handleSaveSystem,
    pasteSelection,
    shortcutBindings,
    undoGraph,
  ]);

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
      <div className="lab-canvas-wrap" data-tutorial="canvas">
        <div className="h-full w-full min-h-0 overflow-hidden">
          <ReactFlow
            className="lab-reactflow"
            style={{ background: isLightTheme ? "#ffffff" : "transparent" }}
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
              setContextMenu(null);
            }}
            onPaneContextMenu={handlePaneContextMenu}
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

      {/* Right-click context menu */}
      {contextMenu ? (
        <div
          className="lab-context-menu"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button className="lab-context-item" onClick={() => handleContextMenuAddNode("stock")}>+ Stock</button>
          <button className="lab-context-item" onClick={() => handleContextMenuAddNode("flow")}>+ Flow</button>
          <button className="lab-context-item" onClick={() => handleContextMenuAddNode("commentNode")} data-tutorial="ctx-comment">+ Comment</button>
        </div>
      ) : null}

      {/* Comment text-entry dialog */}
      {addCommentNodeId ? (
        <div className="lab-comment-entry-overlay" data-tutorial="comment-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setAddCommentNodeId(null); }}>
          <div className="lab-comment-entry" data-tutorial="comment-entry">
            <div className="lab-comment-entry-title">Add comment</div>
            <textarea
              className="lab-comment-entry-textarea"
              autoFocus
              rows={4}
              placeholder="Write your comment..."
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="lab-comment-entry-actions">
              <button
                className="lab-btn lab-btn-secondary"
                onClick={() => {
                  // Update the node data with the draft text
                  const store = useLabStore.getState();
                  store.onNodesChange([]);  // no-op to flush; we set directly
                  const nodeId = addCommentNodeId;
                  // Use setSelectedNodeId + updateSelectedNode pattern
                  store.setSelectedNodeId(nodeId);
                  store.updateSelectedNode({ text: commentDraft });
                  store.setSelectedNodeId(null);
                  setAddCommentNodeId(null);
                  setCommentDraft("");
                }}
              >
                Save
              </button>
              <button
                className="lab-btn lab-btn-secondary"
                onClick={() => {
                  // Remove the newly created empty comment node
                  const store = useLabStore.getState();
                  store.onNodesChange([{ type: "remove", id: addCommentNodeId }]);
                  setAddCommentNodeId(null);
                  setCommentDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lab-canvas-toolbar" role="group" aria-label="Canvas controls" data-tutorial="toolbar">
        <button
          className="lab-canvas-btn"
          type="button"
          onClick={resetZoomToDefault}
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
          data-tutorial="zoom-reset"
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
          data-tutorial="zoom-in"
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
          data-tutorial="zoom-out"
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
          data-tutorial="lock-canvas"
        >
          <span className="lab-canvas-lock-icon" aria-hidden="true">
            <LockToggleIcon locked={canvasLocked} />
          </span>
        </button>
        <div className="lab-canvas-sep" />
        <button className="lab-canvas-btn lab-canvas-export" type="button" onClick={exportJson} data-tutorial="export">
          <span>Export</span>
          <span aria-hidden="true">⇩</span>
        </button>
      </div>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-left space-y-4">
        <h3 className="lab-panel-title">Simulation</h3>

        <label className="block text-sm lab-field" data-tutorial="steps">
          <span className="lab-label-row">
            <span>Steps</span>
            <HelpTip text={"Number of simulation steps.\nMore steps = longer simulation timeline.\nTypical range: 100–2000."} />
          </span>
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

        <label className="block text-sm lab-field" data-tutorial="dt">
          <span className="lab-label-row">
            <span>dt</span>
            <HelpTip text={"Time step size between each simulation step.\nSmaller dt = higher accuracy but slower.\nTypical range: 0.01 – 1.0."} />
          </span>
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
            <HelpTip text={"Euler: simpler method for less complex systems when precision is not critical.\n\nRK4: more advanced method with more computations per step and higher accuracy."} />
          </span>
          <select className="lab-input mt-1" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as "euler_v2" | "rk4_v2")}>
            <option value="euler_v2">Euler</option>
            <option value="rk4_v2">RK4</option>
          </select>
        </label>

        <button className="lab-btn lab-btn-primary w-full" onClick={runLocalSimulation} disabled={isPlaying} data-tutorial="run-simulation">
          {isPlaying ? "Running..." : "Run simulation"}
        </button>
        <button className="lab-btn lab-btn-secondary w-full" onClick={() => clearSimulation()}>Reset simulation</button>

        <div className="lab-divider pt-4" data-tutorial="timeline">
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

        {lessonTaskContext ? (
          <div className="lab-divider pt-4 space-y-3">
            <div className="lab-chart-head">
              <span className="text-sm lab-field">Task</span>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsTaskModalOpen(true)}>
                Full screen
              </button>
            </div>
            <div className="lab-task-card">
              <div className="lab-task-card-title">{lessonTaskContext.taskTitle}</div>
              <p className="lab-task-card-description">{lessonTaskContext.taskDescription}</p>
            </div>
            <div className={`text-xs ${isCurrentTaskCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
              {isCurrentTaskCompleted ? "Task marked as completed." : "Task is not completed yet."}
            </div>
            {lessonTasksQuery.isError ? <div className="text-xs lab-error">Unable to load lesson tasks.</div> : null}
            <button
              className="lab-btn lab-btn-primary w-full"
              type="button"
              onClick={handleMarkTaskCompleted}
              disabled={isCurrentTaskCompleted || completeTaskMutation.isPending}
            >
              {isCurrentTaskCompleted ? "Task completed" : completeTaskMutation.isPending ? "Saving..." : "Mark task as completed"}
            </button>
            <button
              className="lab-btn lab-btn-secondary w-full"
              type="button"
              onClick={handleTaskProgressNavigation}
              disabled={!canResolveLessonNavigation}
            >
              {!canResolveLessonNavigation ? "Loading lesson tasks..." : nextLessonTask ? "Go to next task" : "Finish lesson"}
            </button>
          </div>
        ) : null}

      </aside>

      <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-right lab-floating-panel-editor space-y-4">
        <h3 className="lab-panel-title">Editor</h3>
        <div className="space-y-2">
          <div className="lab-system-row">
            <input
              className="lab-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="System title"
              aria-label="System title"
              data-tutorial="system-title"
            />
            <button
              className={`lab-btn lab-btn-secondary ${saveDisabledNoChanges ? "lab-btn-save-idle" : ""}`}
              onClick={handleSaveSystem}
              disabled={saveButtonDisabled}
              title={saveDisabledNoChanges ? "No changes to save" : "Save system"}
              data-tutorial="save-system"
            >
              Save system
            </button>
          </div>
          <button className="lab-btn lab-btn-secondary w-full" type="button" onClick={createNewSystem} disabled={lockEditing} data-tutorial="create-new-system">
            Create new system
          </button>
          {activeSystemId && !isAdmin ? (
            <button
              className={`lab-btn lab-btn-secondary w-full ${submitForReviewMutation.isSuccess ? "lab-btn-save-idle" : ""}`}
              type="button"
              onClick={handleSubmitForReview}
              disabled={submitForReviewMutation.isPending || submitForReviewMutation.isSuccess}
              title="Submit this system to an admin for review"
            >
              {submitForReviewMutation.isPending
                ? "Submitting..."
                : submitForReviewMutation.isSuccess
                  ? "Submitted for review ✓"
                  : "Submit for review"}
            </button>
          ) : null}
          {saveAttempted && saveBlockedReason ? <div className="text-xs lab-error">{saveBlockedReason}</div> : null}
          {saveMutation.isError ? <div className="text-xs lab-error">Unable to save system.</div> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="lab-btn lab-btn-secondary flex-1" onClick={() => { addStock(); if (useTutorialStore.getState().active) { const last = useLabStore.getState().nodes.at(-1); if (last) setSelectedNodeId(last.id); } }} disabled={lockEditing} data-tutorial="add-stock">+ Stock</button>
          <button className="lab-btn lab-btn-secondary flex-1" onClick={() => { addFlow(); if (useTutorialStore.getState().active) { const last = useLabStore.getState().nodes.at(-1); if (last) setSelectedNodeId(last.id); } }} disabled={lockEditing} data-tutorial="add-flow">+ Flow</button>
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
            <label className="block text-xs lab-field" data-tutorial="node-name">
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
              <label className="block text-xs lab-field" data-tutorial="node-bottleneck">
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
              <label className="block text-xs lab-field" data-tutorial="node-quantity">
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
                <div className="lab-stock-palette" data-tutorial="stock-color">
                  {stockColorPresets.map((color) => (
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
                    value={resolveStockColor(String(selectedNode.data?.color ?? stockColorPresets[0]), colorblindMode)}
                    onChange={(e) => updateSelectedNode({ color: e.target.value })}
                    aria-label="Pick stock color"
                  />
                </div>
              </div>
            ) : null}

          </div>
        ) : null}

        <div className="lab-divider pt-3 space-y-2">
          <div className="text-sm lab-field lab-label-row">
            <span>Feedback loops</span>
            <HelpTip text={"Feedback loops create automatic control mechanisms.\n\nBalancing (B): pushes the system toward a goal value.\nReinforcing (R): amplifies change over time — growth or collapse."} />
          </div>
          {feedbackLoopList.length === 0 ? (
            <div className="text-xs lab-muted">No feedback loops yet.</div>
          ) : (
            <div className="lab-loop-list">
              {feedbackLoopList.map((loop) => (
                <div key={loop.id} className="lab-loop-item">
                  <div className="lab-loop-item-meta">
                    <div className="lab-loop-item-title">{loop.loopLabel}</div>
                    <div className="lab-loop-item-sub">
                      {loop.type === "balancing"
                        ? `${loop.stockLabel} -> ${loop.flowLabel} (${loop.operation}) | t=${loop.adjustmentTime}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}`
                        : `${loop.stockLabel} -> ${loop.flowLabel} (${loop.polarity}) | k=${loop.k}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}${loop.growthLimitNodeId ? " | growth limit" : ""}${loop.clampNonNegative ? " | clamp>=0" : ""}`}
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

        <div className="lab-divider pt-3" data-tutorial="chart">
          <div className="lab-chart-head">
            <span className="text-sm lab-field lab-label-row">
              <span>Simulation chart</span>
              <HelpTip text={"Shows all variables over time.\n\nClick a line or legend item to focus it — others will fade out.\nClick again to deselect.\nSelect a node on the canvas to view only its chart."} />
            </span>
            <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(true)} data-tutorial="chart-expand">
              Expand
            </button>
          </div>
          <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} chartHeight={220} isLightTheme={isLightTheme} nodes={nodes} feedbackLoops={feedbackLoops} selectedNodeId={selectedNodeId} />
        </div>
      </aside>
      <FeedbackLoopModal
        isOpen={activeFeedbackLoopStockNode !== null}
        mode={editingFeedbackLoop ? "edit" : "create"}
        initialTab={feedbackLoopModalInitialTab}
        initialBalancingValues={feedbackLoopModalInitialBalancingValues}
        initialReinforcingValues={feedbackLoopModalInitialReinforcingValues}
        stockLabel={String(activeFeedbackLoopStockNode?.data?.label ?? activeFeedbackLoopStockNode?.id ?? "Stock")}
        connectedFlows={feedbackLoopFlowOptions}
        onClose={() => {
          setCreateFeedbackLoopStockId(null);
          setEditingFeedbackLoopId(null);
        }}
        onSubmitBalancingLoop={createBalancingLoopFromModal}
        onSubmitReinforcingLoop={createReinforcingLoopFromModal}
      />
      {isTaskModalOpen && lessonTaskContext ? (
        <div className="lab-modal-overlay" onClick={() => setIsTaskModalOpen(false)}>
          <div className="lab-task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Task</h3>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsTaskModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="lab-task-modal-body">
              <h4 className="lab-task-modal-title">{lessonTaskContext.taskTitle}</h4>
              <p className="lab-task-modal-description">{lessonTaskContext.taskDescription}</p>
              <div className={`text-sm ${isCurrentTaskCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
                {isCurrentTaskCompleted ? "Task marked as completed." : "Task is not completed yet."}
              </div>
              {lessonTasksQuery.isError ? <div className="text-sm lab-error">Unable to load lesson tasks.</div> : null}
              <div className="lab-task-modal-actions">
                <button
                  className="lab-btn lab-btn-primary"
                  type="button"
                  onClick={handleMarkTaskCompleted}
                  disabled={isCurrentTaskCompleted || completeTaskMutation.isPending}
                >
                  {isCurrentTaskCompleted ? "Task completed" : completeTaskMutation.isPending ? "Saving..." : "Mark task as completed"}
                </button>
                <button
                  className="lab-btn lab-btn-secondary"
                  type="button"
                  onClick={handleTaskProgressNavigation}
                  disabled={!canResolveLessonNavigation}
                >
                  {!canResolveLessonNavigation ? "Loading lesson tasks..." : nextLessonTask ? "Go to next task" : "Finish lesson"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isChartModalOpen ? (
        <div className="lab-modal-overlay" data-tutorial="chart-modal" onClick={() => setIsChartModalOpen(false)}>
          <div className="lab-chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Simulation chart</h3>
              <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={() => setIsChartModalOpen(false)}>
                Close
              </button>
            </div>
            <SimulationChart steps={simulationSteps} focusIndex={sliderIndex} chartHeight="72vh" isLightTheme={isLightTheme} nodes={nodes} feedbackLoops={feedbackLoops} selectedNodeId={selectedNodeId} />
          </div>
        </div>
      ) : null}
      {isConfirmNewSystemOpen ? (
        <div className="lab-modal-overlay" onClick={() => setIsConfirmNewSystemOpen(false)}>
          <div className="lab-task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lab-chart-modal-head">
              <h3 className="lab-panel-title">Create new system</h3>
            </div>
            <div className="lab-task-modal-body">
              <p className="lab-task-modal-description">
                Are you sure you want to create a new system? Any unsaved changes will be lost.
              </p>
              <div className="lab-task-modal-actions">
                <button
                  className="lab-btn lab-btn-primary"
                  type="button"
                  onClick={() => {
                    setIsConfirmNewSystemOpen(false);
                    doCreateNewSystem();
                  }}
                >
                  Yes, create new
                </button>
                <button
                  className="lab-btn lab-btn-secondary"
                  type="button"
                  onClick={() => setIsConfirmNewSystemOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <TutorialOverlay onFinish={handleMarkTaskCompleted} />
    </section>
  );
}
