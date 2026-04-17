import { Edge, Node } from "reactflow";

import {
  BoundaryType,
  FeedbackLoop,
  LoopOperation,
  ReinforcingPolarity,
} from "./domainTypes";
import {
  asFiniteNumber,
  clampFlowNonNegative,
  edgeWeightByKind,
  inferEdgeKind,
  isControlOp,
  nodeKind,
  opLabel,
} from "./graph";

const MIN_ADJUSTMENT_TIME = 0.000001;

export function sanitizeLoopCollection(
  loops: FeedbackLoop[],
  nodes: Node[],
  edges: Edge[],
): FeedbackLoop[] {
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
    return hasNodes && loop.edgeIds.every((id) => edgeIds.has(id));
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

function sanitizeReinforcingPolarity(value: unknown): ReinforcingPolarity {
  return value === "negative" ? "negative" : "positive";
}

export function parseLoopRecord(item: Record<string, unknown>): FeedbackLoop | null {
  const id = String(item.id ?? "").trim();
  const type = String(item.type ?? "").trim();
  const stockId = String(item.stockId ?? "").trim();
  const controlledFlowId = String(item.controlledFlowId ?? "").trim();
  if (!id || !stockId || !controlledFlowId) return null;

  const edgeIds = Array.isArray(item.edgeIds)
    ? item.edgeIds.map((edgeId) => String(edgeId)).filter((edgeId) => edgeId.trim().length > 0)
    : [];
  const name = String(item.name ?? "").trim() || undefined;

  if (type === "reinforcing") {
    const multiplierNodeId = String(item.multiplierNodeId ?? "").trim();
    if (!multiplierNodeId) return null;
    const growthLimitNodeId = String(item.growthLimitNodeId ?? "").trim();
    return {
      id,
      type: "reinforcing",
      name,
      stockId,
      multiplierNodeId,
      growthLimitNodeId: growthLimitNodeId || undefined,
      controlledFlowId,
      k: asFiniteNumber(item.k, 1),
      polarity: sanitizeReinforcingPolarity(item.polarity),
      delayEnabled: item.delayEnabled === true || item.delay_enabled === true,
      delaySteps: Math.max(0, Math.floor(asFiniteNumber(item.delaySteps ?? item.delay_steps, 0))),
      clampNonNegative: item.clampNonNegative !== false && item.clamp_non_negative !== false,
      baseFlowExpression:
        String(item.baseFlowExpression ?? item.base_flow_expression ?? "0") || "0",
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
    name,
    stockId,
    goalNodeId,
    discrepancyNodeId,
    correctiveNodeId,
    controlledFlowId,
    boundaryType: sanitizeBoundaryType(item.boundaryType),
    goalValue: asFiniteNumber(item.goalValue, 0),
    adjustmentTime: Math.max(
      MIN_ADJUSTMENT_TIME,
      asFiniteNumber(item.adjustmentTime ?? item.adjustment_time ?? item.k, 1),
    ),
    operation: sanitizeLoopOperation(item.operation ?? item.mode),
    delayEnabled: item.delayEnabled === true || item.delay_enabled === true,
    delaySteps: Math.max(0, Math.floor(asFiniteNumber(item.delaySteps ?? item.delay_steps, 0))),
    clampNonNegative: true,
    baseFlowExpression: String(item.baseFlowExpression ?? "0") || "0",
    edgeIds,
  };
}

function serializeCommentNode(node: Node): Record<string, unknown> {
  return {
    id: node.id,
    kind: "commentNode",
    x: Number(node.position.x ?? 0),
    y: Number(node.position.y ?? 0),
    comment_text: String(node.data?.text ?? ""),
    author_id: Number(node.data?.authorId ?? 0),
    author_name: String(node.data?.authorName ?? ""),
    author_email: String(node.data?.authorEmail ?? ""),
    author_avatar_path: node.data?.authorAvatarPath ?? null,
  };
}

function serializeGraphNode(node: Node): Record<string, unknown> {
  if (node.type === "commentNode") return serializeCommentNode(node);
  const isFlow = nodeKind(node) === "flow";
  const rawQuantity = Number(node.data?.quantity ?? node.data?.initial ?? 0);
  const quantity = isFlow ? clampFlowNonNegative(rawQuantity) : rawQuantity;
  return {
    id: node.id,
    kind: String(node.type ?? "default"),
    x: Number(node.position.x ?? 0),
    y: Number(node.position.y ?? 0),
    initial: quantity,
    quantity,
    bottleneck: clampFlowNonNegative(
      node.data?.bottleneck ?? node.data?.quantity ?? node.data?.initial ?? 0,
    ),
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
    op: isControlOp(String(node.data?.op ?? "")) ? String(node.data?.op) : "",
  };
}

function serializeGraphEdge(edge: Edge): Record<string, unknown> {
  return {
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
  };
}

export function serializeGraph(
  nodes: Node[],
  edges: Edge[],
  feedbackLoops: FeedbackLoop[],
): Record<string, unknown> {
  return {
    nodes: nodes.map(serializeGraphNode),
    edges: edges.map(serializeGraphEdge),
    feedbackLoops,
  };
}

function deserializeCommentNode(item: Record<string, unknown>, index: number): Node {
  return {
    id: String(item.id ?? `comment_${index + 1}`),
    type: "commentNode",
    position: {
      x: Number(item.x ?? 160 + index * 40),
      y: Number(item.y ?? 140 + index * 30),
    },
    data: {
      text: String(item.comment_text ?? ""),
      authorId: Number(item.author_id ?? 0),
      authorName: String(item.author_name ?? ""),
      authorEmail: String(item.author_email ?? ""),
      authorAvatarPath: item.author_avatar_path ?? null,
    },
  };
}

function deserializeGraphNode(item: Record<string, unknown>, index: number): Node {
  const kindStr = String(item.kind ?? "stockNode");
  if (kindStr === "commentNode") return deserializeCommentNode(item, index);
  const type =
    kindStr === "flowNode"
      ? "flowNode"
      : kindStr === "constantNode"
        ? "constantNode"
        : kindStr === "variableNode"
          ? "variableNode"
          : "stockNode";
  const isFlow = type === "flowNode";
  const isControlNode = type === "constantNode" || type === "variableNode";
  const quantityRaw = item.quantity ?? item.initial ?? 0;
  const rawOp = String(item.op ?? "");
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
      feedbackLoopPersistent:
        item.feedback_loop_persistent === true || item.feedbackLoopPersistent === true,
      reinforcingTextOnly:
        item.reinforcing_text_only === true || item.reinforcingTextOnly === true,
      reinforcingMarker: item.reinforcing_marker === true || item.reinforcingMarker === true,
      unit: String(item.unit ?? ""),
      color: String(item.color ?? ""),
      op: isControlNode ? (isControlOp(rawOp) ? rawOp : "add") : undefined,
    },
  };
}

function deserializeGraphEdge(
  item: Record<string, unknown>,
  index: number,
  nodesById: Map<string, Node>,
): Edge {
  const source = String(item.source);
  const target = String(item.target);
  const inferredKind = inferEdgeKind(nodesById.get(source), nodesById.get(target));
  const rawKind =
    item.kind === "inflow" || item.kind === "outflow" || item.kind === "neutral" ? item.kind : null;
  const kind = rawKind ?? inferredKind ?? "neutral";
  const weight = Number(item.weight ?? edgeWeightByKind(kind));
  const rawOp = String(item.op ?? "");
  const label =
    kind === "outflow" ? "-" : kind === "inflow" ? "+" : isControlOp(rawOp) ? opLabel(rawOp) : "";
  return {
    id: String(item.id ?? `edge_${index + 1}`),
    source,
    target,
    sourceHandle: String(item.source_handle ?? item.sourceHandle ?? ""),
    targetHandle: String(item.target_handle ?? item.targetHandle ?? ""),
    label,
    data: {
      kind,
      weight,
      op: isControlOp(rawOp) ? rawOp : "add",
      feedbackLoop: item.feedback_loop === true || item.feedbackLoop === true,
      feedbackLoopType: String(item.feedback_loop_type ?? item.feedbackLoopType ?? ""),
      reinforcingPolarity: String(item.reinforcing_polarity ?? item.reinforcingPolarity ?? ""),
      feedbackLoopPersistent:
        item.feedback_loop_persistent === true || item.feedbackLoopPersistent === true,
    },
  };
}

export type DeserializedGraph = {
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
};

export function deserializeGraph(graph: Record<string, unknown>): DeserializedGraph {
  const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as Array<Record<string, unknown>>) : [];
  const rawEdges = Array.isArray(graph.edges) ? (graph.edges as Array<Record<string, unknown>>) : [];
  const nodes: Node[] = rawNodes.map((item, index) => deserializeGraphNode(item, index));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges: Edge[] = rawEdges.map((item, index) => deserializeGraphEdge(item, index, nodesById));
  const rawLoops = Array.isArray(graph.feedbackLoops)
    ? (graph.feedbackLoops as Array<Record<string, unknown>>)
    : Array.isArray(graph.feedback_loops)
      ? (graph.feedback_loops as Array<Record<string, unknown>>)
      : [];
  const feedbackLoops = sanitizeLoopCollection(
    rawLoops.map(parseLoopRecord).filter((loop): loop is FeedbackLoop => Boolean(loop)),
    nodes,
    edges,
  );
  return { nodes, edges, feedbackLoops };
}
