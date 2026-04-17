import { Edge, Node } from "reactflow";

import { getCurrentLabColorTokens, getStockColorPresets } from "../uiPreferencesStore";
import {
  BalancingFeedbackLoop,
  CreateBalancingFeedbackLoopPayload,
  CreateReinforcingFeedbackLoopPayload,
  ReinforcingFeedbackLoop,
  ReinforcingPolarity,
} from "./domainTypes";
import {
  asFiniteNumber,
  generateEdgeId,
  nextNodeId,
  opLabel,
} from "./graph";
import {
  correctiveExpression,
  discrepancyExpression,
  reinforcingMultiplierExpression,
} from "./feedbackExpressions";

const MIN_ADJUSTMENT_TIME = 0.000001;

function nextCommentId(nodes: Node[]): string {
  const existing = new Set(nodes.map((node) => String(node.id)));
  let index = nodes.filter((node) => String(node.id).startsWith("comment_")).length + 1;
  let candidate = `comment_${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `comment_${index}`;
  }
  return candidate;
}

export function createStockNode(nodes: Node[], extraData?: Record<string, unknown>): Node {
  const id = nextNodeId(nodes, "stock");
  const index = nodes.filter((node) => node.id.startsWith("stock_")).length + 1;
  const presets = getStockColorPresets();
  const color = presets[(index - 1) % presets.length];
  return {
    id,
    type: "stockNode",
    position: { x: 200 + index * 30, y: 120 + index * 25 },
    data: { label: `Stock ${index}`, quantity: 0, unit: "", color, ...extraData },
  };
}

export function createFlowNode(nodes: Node[], extraData?: Record<string, unknown>): Node {
  const id = nextNodeId(nodes, "flow");
  const index = nodes.filter((node) => node.id.startsWith("flow_")).length + 1;
  return {
    id,
    type: "flowNode",
    position: { x: 300 + index * 35, y: 140 + index * 20 },
    data: { label: `Flow ${index}`, bottleneck: 0, unit: "", ...extraData },
  };
}

export function createConstantNode(nodes: Node[]): Node {
  const id = nextNodeId(nodes, "constant");
  const index = nodes.filter((node) => node.id.startsWith("constant_")).length + 1;
  return {
    id,
    type: "constantNode",
    position: { x: 240 + index * 30, y: 100 + index * 20 },
    data: { label: `Constant ${index}`, quantity: 1, unit: "", op: "add" },
  };
}

export function createVariableNode(nodes: Node[]): Node {
  const id = nextNodeId(nodes, "variable");
  const index = nodes.filter((node) => node.id.startsWith("variable_")).length + 1;
  return {
    id,
    type: "variableNode",
    position: { x: 280 + index * 30, y: 160 + index * 20 },
    data: { label: `Variable ${index}`, quantity: 0, unit: "", op: "add" },
  };
}

export function createNodeAtPosition(
  nodes: Node[],
  type: "stock" | "flow" | "commentNode",
  position: { x: number; y: number },
  extraData?: Record<string, unknown>,
): Node {
  if (type === "stock") {
    const stock = createStockNode(nodes, extraData);
    return { ...stock, position };
  }
  if (type === "flow") {
    const flow = createFlowNode(nodes, extraData);
    return { ...flow, position };
  }
  const id = nextCommentId(nodes);
  return {
    id,
    type: "commentNode",
    position,
    data: { text: "", authorId: 0, authorName: "", authorEmail: "", ...extraData },
  };
}

export type BalancingLoopElements = {
  loopId: string;
  goalNode: Node;
  discrepancyNode: Node;
  correctiveNode: Node;
  edgeGoalToDiscrepancy: Edge;
  edgeStockToDiscrepancy: Edge;
  edgeDiscrepancyToCorrective: Edge;
  edgeCorrectiveToFlow: Edge;
  loop: BalancingFeedbackLoop;
};

export function buildBalancingLoopElements(
  nodes: Node[],
  edges: Edge[],
  payload: CreateBalancingFeedbackLoopPayload,
  baseFlowExpression: string,
): BalancingLoopElements {
  const goalValue = asFiniteNumber(payload.goalValue, 0);
  const adjustmentTime = Math.max(MIN_ADJUSTMENT_TIME, asFiniteNumber(payload.adjustmentTime, 1));
  const delayEnabled = payload.delayEnabled === true;
  const delaySteps = Math.max(0, Math.floor(asFiniteNumber(payload.delaySteps, 0)));
  const loopId = `loop_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const goalNodeId = nextNodeId(nodes, "constant");
  const discrepancyNodeId = nextNodeId(
    [...nodes, { id: goalNodeId, position: { x: 0, y: 0 }, data: {}, type: "constantNode" }],
    "variable",
  );
  const correctiveNodeId = nextNodeId(
    [
      ...nodes,
      { id: goalNodeId, position: { x: 0, y: 0 }, data: {}, type: "constantNode" },
      { id: discrepancyNodeId, position: { x: 0, y: 0 }, data: {}, type: "variableNode" },
    ],
    "variable",
  );

  const discrepancyExpr = discrepancyExpression(payload.boundaryType, goalNodeId, payload.stockId);
  const correctiveExpr = correctiveExpression(adjustmentTime, discrepancyNodeId, delayEnabled, delaySteps);

  const goalNode: Node = {
    id: goalNodeId,
    type: "constantNode",
    position: { ...payload.positions.goal },
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
    position: { ...payload.positions.discrepancy },
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
    position: { ...payload.positions.corrective },
    data: {
      label: (payload.correctiveLabel ?? "").trim() || "Corrective Action",
      quantity: 0,
      unit: "",
      expression: correctiveExpr,
      loopId,
      loopRole: "correctiveAction",
    },
  };

  const neutralLoopEdgeData = { kind: "neutral", weight: 1, feedbackLoop: true } as const;

  const edgeGoalToDiscrepancy: Edge = {
    id: generateEdgeId(edges),
    source: goalNodeId,
    target: discrepancyNodeId,
    label: "",
    data: { ...neutralLoopEdgeData },
  };

  const edgeStockToDiscrepancy: Edge = {
    id: generateEdgeId([...edges, edgeGoalToDiscrepancy]),
    source: payload.stockId,
    target: discrepancyNodeId,
    label: "",
    data: { ...neutralLoopEdgeData },
  };

  const edgeDiscrepancyToCorrective: Edge = {
    id: generateEdgeId([...edges, edgeGoalToDiscrepancy, edgeStockToDiscrepancy]),
    source: discrepancyNodeId,
    target: correctiveNodeId,
    label: "",
    data: { ...neutralLoopEdgeData },
  };

  const edgeCorrectiveToFlow: Edge = {
    id: generateEdgeId([
      ...edges,
      edgeGoalToDiscrepancy,
      edgeStockToDiscrepancy,
      edgeDiscrepancyToCorrective,
    ]),
    source: correctiveNodeId,
    target: payload.controlledFlowId,
    label: opLabel(payload.operation),
    data: { ...neutralLoopEdgeData, op: payload.operation },
  };

  const loop: BalancingFeedbackLoop = {
    id: loopId,
    type: "balancing",
    name: (payload.name ?? "").trim() || undefined,
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

  return {
    loopId,
    goalNode,
    discrepancyNode,
    correctiveNode,
    edgeGoalToDiscrepancy,
    edgeStockToDiscrepancy,
    edgeDiscrepancyToCorrective,
    edgeCorrectiveToFlow,
    loop,
  };
}

export type ReinforcingLoopElements = {
  loopId: string;
  multiplierNode: Node;
  growthLimitNode: Node | null;
  markerNode: Node | null;
  edgeStockToMultiplier: Edge;
  edgeGrowthLimitToMultiplier: Edge | null;
  edgeMultiplierToFlow: Edge;
  loop: ReinforcingFeedbackLoop;
};

export function buildReinforcingLoopElements(
  nodes: Node[],
  edges: Edge[],
  payload: CreateReinforcingFeedbackLoopPayload,
  baseFlowExpression: string,
): ReinforcingLoopElements {
  const loopId = `loop_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const k = asFiniteNumber(payload.k, 1);
  const multiplierLabel = (payload.multiplierLabel ?? "").trim() || "Multiplier";
  const collapseMultiplier = Math.abs(k - 1) <= 1e-9 && multiplierLabel === "Multiplier";
  const delayEnabled = payload.delayEnabled === true;
  const delaySteps = Math.max(0, Math.floor(asFiniteNumber(payload.delaySteps, 0)));
  const clampNonNegative = payload.clampNonNegative !== false;
  const polarity: ReinforcingPolarity = payload.polarity === "negative" ? "negative" : "positive";

  const multiplierNodeId = nextNodeId(nodes, "variable");
  const nodesWithMultiplier: Node[] = [
    ...nodes,
    { id: multiplierNodeId, type: "variableNode", position: { x: 0, y: 0 }, data: {} },
  ];
  const growthLimitNodeId =
    payload.growthLimit === undefined ? undefined : nextNodeId(nodesWithMultiplier, "constant");
  const markerNodeId = `loop_marker_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const multiplierExpression = reinforcingMultiplierExpression(k, payload.stockId, growthLimitNodeId);

  const multiplierNode: Node = {
    id: multiplierNodeId,
    type: "variableNode",
    position: { ...payload.positions.multiplier },
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
        position: { ...payload.positions.marker },
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
  const baseEdgeData = {
    kind: "neutral" as const,
    weight: 1,
    feedbackLoop: true,
    feedbackLoopType: "reinforcing" as const,
    reinforcingPolarity: polarity,
    feedbackLoopPersistent: true,
  };
  const edgeStyle = { stroke: color, strokeWidth: 2.1 };

  const edgeStockToMultiplier: Edge = {
    id: generateEdgeId(edges),
    source: payload.stockId,
    target: multiplierNodeId,
    label: "",
    data: { ...baseEdgeData },
    style: edgeStyle,
  };

  const edgeGrowthLimitToMultiplier: Edge | null =
    growthLimitNodeId === undefined
      ? null
      : {
          id: generateEdgeId([...edges, edgeStockToMultiplier]),
          source: growthLimitNodeId,
          target: multiplierNodeId,
          label: "",
          data: { ...baseEdgeData },
          style: edgeStyle,
        };

  const edgeMultiplierToFlow: Edge = {
    id: generateEdgeId(
      edgeGrowthLimitToMultiplier
        ? [...edges, edgeStockToMultiplier, edgeGrowthLimitToMultiplier]
        : [...edges, edgeStockToMultiplier],
    ),
    source: multiplierNodeId,
    target: payload.controlledFlowId,
    label: polarity === "positive" ? "+" : "-",
    data: { ...baseEdgeData },
    style: { stroke: color, strokeWidth: 2.2 },
  };

  const loop: ReinforcingFeedbackLoop = {
    id: loopId,
    type: "reinforcing",
    name: (payload.name ?? "").trim() || undefined,
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

  return {
    loopId,
    multiplierNode,
    growthLimitNode,
    markerNode,
    edgeStockToMultiplier,
    edgeGrowthLimitToMultiplier,
    edgeMultiplierToFlow,
    loop,
  };
}

export function resolveBaseFlowExpression(flowNode: Node | undefined): string {
  const raw =
    flowNode?.data?.baseFlowExpression ??
    flowNode?.data?.expression ??
    flowNode?.data?.bottleneck ??
    flowNode?.data?.quantity ??
    0;
  return String(raw).trim() || "0";
}
