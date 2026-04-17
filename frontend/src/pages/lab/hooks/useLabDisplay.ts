import { useMemo } from "react";
import { Edge, MarkerType, Node } from "reactflow";

import {
  BalancingFeedbackLoop,
  FeedbackLoop,
  ReinforcingFeedbackLoop,
} from "../../../store/labStore";
import { getLabColorTokens } from "../../../store/uiPreferencesStore";
import { RunStep } from "../../../types/api";
import { CONTROL_OPS, ControlOp } from "../types";
import {
  asNumber,
  closestSourceHandle,
  closestTargetHandle,
  controlEdgeColor,
  edgeKind,
  feedbackLoopHandlePolicy,
  formatDisplayNumber,
  getNodeCenter,
  isConstantNode,
  isFlowNode,
  isVariableNode,
} from "../utils";

type LabColorTokens = ReturnType<typeof getLabColorTokens>;

function buildDisplayedNodes(
  nodes: Node[],
  nodesById: Map<string, Node>,
  currentSnapshot: RunStep | null,
  feedbackLoops: FeedbackLoop[],
  algorithm: "euler_v2" | "rk4_v2",
): Node[] {
  const displayPrecision = algorithm === "rk4_v2" ? 8 : 3;
  const balancingLoops = feedbackLoops.filter(
    (loop): loop is BalancingFeedbackLoop => loop.type === "balancing",
  );
  const reinforcingLoops = feedbackLoops.filter(
    (loop): loop is ReinforcingFeedbackLoop => loop.type === "reinforcing",
  );
  const loopByDiscrepancyId = new Map(balancingLoops.map((loop) => [loop.discrepancyNodeId, loop]));
  const loopByMultiplierId = new Map(reinforcingLoops.map((loop) => [loop.multiplierNodeId, loop]));
  const reinforcingLoopById = new Map(reinforcingLoops.map((loop) => [loop.id, loop]));

  return nodes.map((node) => {
    if (String(node.data?.loopRole ?? "") === "reinforcingMarker") {
      const loop = reinforcingLoopById.get(String(node.data?.loopId ?? ""));
      if (!loop) return node;
      const stockNode = nodesById.get(loop.stockId);
      const multiplierNode = nodesById.get(loop.multiplierNodeId);
      const flowNode = nodesById.get(loop.controlledFlowId);
      if (!stockNode || !multiplierNode || !flowNode) return node;
      const { x: sx, y: sy } = getNodeCenter(stockNode);
      const { x: mx, y: my } = getNodeCenter(multiplierNode);
      const { x: fx, y: fy } = getNodeCenter(flowNode);
      const markerWidth = 28;
      const markerHeight = 20;
      return {
        ...node,
        position: {
          x: (sx + mx + fx) / 3 - markerWidth / 2,
          y: (sy + my + fy) / 3 - markerHeight / 2,
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
    const quantity = liveValue !== undefined && !isFlowNode(node) ? liveValue : node.data?.quantity;
    const bottleneck = liveValue !== undefined && isFlowNode(node) ? liveValue : node.data?.bottleneck;
    const discrepancyLoop = loopByDiscrepancyId.get(node.id);

    let balancingBadgeOffsetX: number | undefined;
    let balancingBadgeOffsetY: number | undefined;
    if (discrepancyLoop) {
      const stockNode = nodesById.get(discrepancyLoop.stockId);
      const correctiveNode = nodesById.get(discrepancyLoop.correctiveNodeId);
      const flowNode = nodesById.get(discrepancyLoop.controlledFlowId);
      if (stockNode && correctiveNode && flowNode) {
        const discrepancyCenter = getNodeCenter(node);
        const points = [
          getNodeCenter(stockNode),
          getNodeCenter(correctiveNode),
          getNodeCenter(flowNode),
          discrepancyCenter,
        ];
        const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        balancingBadgeOffsetX = Math.max(-520, Math.min(520, cx - discrepancyCenter.x));
        balancingBadgeOffsetY = Math.max(-360, Math.min(360, cy - discrepancyCenter.y));
      }
    }

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
}

function styleEdge(
  edge: Edge,
  nodesById: Map<string, Node>,
  isLightTheme: boolean,
  tokens: LabColorTokens,
): Edge {
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
  const labelBg = { fill: isLightTheme ? tokens.labelBgLight : tokens.labelBgDark };
  const kind = edgeKind(edge, nodesById);

  if (kind === "inflow") {
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      className: "lab-edge-inflow",
      label: "+",
      style: { stroke: tokens.inflow, strokeWidth: 2.2 },
      labelStyle: { fill: tokens.inflow, fontWeight: 700 },
      labelBgStyle: labelBg,
      markerEnd: { type: MarkerType.ArrowClosed, color: tokens.inflow },
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
      style: { stroke: tokens.outflow, strokeWidth: 2.2 },
      labelStyle: { fill: tokens.outflow, fontWeight: 700 },
      labelBgStyle: labelBg,
      markerEnd: { type: MarkerType.ArrowClosed, color: tokens.outflow },
      data: { ...(edge.data ?? {}), kind: "outflow", weight: -1 },
    };
  }

  const reinforcingPolarity = String(edge.data?.reinforcingPolarity ?? "");
  if (
    edge.data?.feedbackLoopType === "reinforcing" &&
    (reinforcingPolarity === "positive" || reinforcingPolarity === "negative")
  ) {
    const color = tokens.reinforcing[reinforcingPolarity];
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      className: `lab-edge-reinforcing-${reinforcingPolarity}`,
      label: String(edge.label ?? ""),
      style: { stroke: color, strokeWidth: 2.1 },
      labelStyle: { fill: color, fontWeight: 700 },
      labelBgStyle: labelBg,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
    };
  }

  const isControl =
    (isConstantNode(sourceNode) || isVariableNode(sourceNode)) && isFlowNode(targetNode);
  if (isControl) {
    const opRaw = String(edge.data?.op ?? "add");
    const op: ControlOp = CONTROL_OPS.some((item) => item.value === opRaw)
      ? (opRaw as ControlOp)
      : "add";
    const color = controlEdgeColor(op, tokens);
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      className: `lab-edge-control lab-edge-control-${op}`,
      label: opRaw
        ? (CONTROL_OPS.find((item) => item.value === op)?.label ?? String(edge.label ?? ""))
        : String(edge.label ?? ""),
      style: { stroke: color, strokeWidth: 2.1 },
      labelStyle: { fill: color, fontWeight: 700 },
      labelBgStyle: labelBg,
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
    style: { stroke: tokens.neutral, strokeWidth: 2 },
    labelStyle: { fill: tokens.neutralLabel, fontWeight: 600 },
    labelBgStyle: labelBg,
    markerEnd: { type: MarkerType.ArrowClosed, color: tokens.neutral },
    data: { ...(edge.data ?? {}), kind: "neutral", weight: 1 },
  };
}

function withFlowAnimation(
  edges: Edge[],
  isPlaying: boolean,
  currentSnapshot: RunStep | null,
): Edge[] {
  return edges.map((edge) => {
    const sourceValue =
      isPlaying && currentSnapshot ? Math.abs(currentSnapshot.values[edge.source] ?? 0) : 0;
    return {
      ...edge,
      data: { ...(edge.data ?? {}), animate: isPlaying && sourceValue > 0 },
    };
  });
}

type UseLabDisplayArgs = {
  nodes: Node[];
  edges: Edge[];
  nodesById: Map<string, Node>;
  feedbackLoops: FeedbackLoop[];
  currentSnapshot: RunStep | null;
  algorithm: "euler_v2" | "rk4_v2";
  labColorTokens: LabColorTokens;
  isLightTheme: boolean;
  isPlaying: boolean;
};

export function useLabDisplay(args: UseLabDisplayArgs) {
  const displayedNodes = useMemo(
    () => buildDisplayedNodes(args.nodes, args.nodesById, args.currentSnapshot, args.feedbackLoops, args.algorithm),
    [args.nodes, args.nodesById, args.currentSnapshot, args.feedbackLoops, args.algorithm],
  );

  const displayedEdges = useMemo(() => {
    const styled = args.edges.map((edge) =>
      styleEdge(edge, args.nodesById, args.isLightTheme, args.labColorTokens),
    );
    return withFlowAnimation(styled, args.isPlaying, args.currentSnapshot);
  }, [args.edges, args.nodesById, args.isLightTheme, args.labColorTokens, args.isPlaying, args.currentSnapshot]);

  return { displayedNodes, displayedEdges };
}
