import { Edge, Node } from "reactflow";
import { getLabColorTokens } from "../../store/uiPreferencesStore";
import { ControlOp, SourceHandleId, TargetHandleId } from "./types";

export function isVariableNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "variableNode" || String(node.id).startsWith("variable_");
}

export function isConstantNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "constantNode" || String(node.id).startsWith("constant_");
}

export function isFlowNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "flowNode" || String(node.id).startsWith("flow_");
}

export function isStockNode(node: Node | undefined): boolean {
  if (!node) return false;
  return node.type === "stockNode" || String(node.id).startsWith("stock_");
}

export function asNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function parseNumericString(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
}

export function formatDisplayNumber(value: unknown, precision: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const fixed = num.toFixed(precision);
  const trimmed = fixed.replace(/\.?0+$/, "");
  if (trimmed === "-0") return "0";
  return trimmed;
}

export function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildSaveSignature(title: string, graph: Record<string, unknown>): string {
  return JSON.stringify({ title: title.trim(), graph });
}

export function cloneNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...(node.data ?? {}) } }));
}

export function cloneEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge, data: { ...(edge.data ?? {}) } }));
}

export function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function applyOperation(current: number, input: number, op: ControlOp): number {
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

export function controlEdgeColor(op: ControlOp, colorPalette: ReturnType<typeof getLabColorTokens>): string {
  return colorPalette.control[op];
}

export function edgeKind(edge: Edge, nodesById: Map<string, Node>): "inflow" | "outflow" | "neutral" {
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (!sourceNode || !targetNode) return "neutral";
  if (isStockNode(sourceNode) && isFlowNode(targetNode)) return "outflow";
  if (isFlowNode(sourceNode) && isStockNode(targetNode)) return "inflow";
  return "neutral";
}

export function getNodeSize(node: Node): { width: number; height: number } {
  const n = node as Node & { measured?: { width?: number; height?: number } };
  const width = Number(n.width ?? n.measured?.width ?? 180);
  const height = Number(n.height ?? n.measured?.height ?? 64);
  return { width, height };
}

export function getNodeCenter(node: Node): { x: number; y: number } {
  const { width, height } = getNodeSize(node);
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
}

export function closestSourceHandle(
  sourceNode: Node,
  targetNode: Node,
  allowed?: SourceHandleId[],
): string {
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

export function closestTargetHandle(
  sourceNode: Node,
  targetNode: Node,
  allowed?: TargetHandleId[],
): string {
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

export function feedbackLoopHandlePolicy(
  edge: Edge,
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
): { sourceAllowed?: SourceHandleId[]; targetAllowed?: TargetHandleId[] } {
  if (!sourceNode || !targetNode) return {};
  if (edge.data?.feedbackLoop !== true) return {};

  const sourceRole = String(sourceNode.data?.loopRole ?? "");
  const targetRole = String(targetNode.data?.loopRole ?? "");

  if (isStockNode(sourceNode) && targetRole === "discrepancy") {
    return { sourceAllowed: ["source-top", "source-bottom"] };
  }
  if (sourceRole === "goal" && targetRole === "discrepancy") {
    return { targetAllowed: ["target-top", "target-bottom"] };
  }
  if (sourceRole === "discrepancy" && targetRole === "correctiveAction") {
    return { sourceAllowed: ["source-left", "source-right"] };
  }
  if (sourceRole === "correctiveAction" && isFlowNode(targetNode)) {
    return { targetAllowed: ["target-top", "target-bottom"] };
  }
  if (isStockNode(sourceNode) && targetRole === "reinforcingMultiplier") {
    return { sourceAllowed: ["source-top", "source-bottom"] };
  }
  if (sourceRole === "reinforcingMultiplier" && isFlowNode(targetNode)) {
    return { targetAllowed: ["target-top", "target-bottom"] };
  }

  return {};
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

export function proposeBalancingLoopPositions(
  stockNode: Node,
  flowNode: Node,
  existingNodes: Node[],
): {
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
    { x: stockNode.position.x + stockSize.width * 0.1, y: stockNode.position.y - 150 },
    lineNodeSize,
    occupied,
  );
  const discrepancy = resolveFreePosition(
    { x: stockNode.position.x + stockSize.width * 0.2, y: stockNode.position.y - 78 },
    lineNodeSize,
    occupied,
  );
  const corrective = {
    x: flowNode.position.x + flowSize.width / 2 - lineNodeSize.width / 2,
    y: flowNode.position.y - 86,
  };

  return { goal, discrepancy, corrective };
}

export function proposeCorrectivePosition(flowNode: Node): { x: number; y: number } {
  const flowSize = getNodeSize(flowNode);
  return {
    x: flowNode.position.x + flowSize.width / 2 - 190 / 2,
    y: flowNode.position.y - 86,
  };
}

export function proposeReinforcingLoopPositions(
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
    ? resolveFreePosition({ x: multiplier.x, y: multiplier.y - 78 }, multiplierSize, occupied)
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

export type ConnectedFlowOption = {
  id: string;
  label: string;
  direction: "inflow" | "outflow";
};

export function collectConnectedFlows(
  stockId: string,
  nodesById: Map<string, Node>,
  edges: Edge[],
): ConnectedFlowOption[] {
  const result = new Map<string, ConnectedFlowOption>();
  for (const edge of edges) {
    if (edge.source === stockId) {
      const flowNode = nodesById.get(edge.target);
      if (flowNode && isFlowNode(flowNode)) {
        result.set(flowNode.id, { id: flowNode.id, label: String(flowNode.data?.label ?? flowNode.id), direction: "outflow" });
      }
      continue;
    }
    if (edge.target === stockId) {
      const flowNode = nodesById.get(edge.source);
      if (flowNode && isFlowNode(flowNode)) {
        result.set(flowNode.id, { id: flowNode.id, label: String(flowNode.data?.label ?? flowNode.id), direction: "inflow" });
      }
    }
  }
  return Array.from(result.values()).sort((a, b) => a.label.localeCompare(b.label));
}
