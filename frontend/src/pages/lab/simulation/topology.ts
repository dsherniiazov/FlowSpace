import { Edge, Node } from "reactflow";

import { asNumber, edgeKind, isFlowNode } from "../utils";

export function buildOutflowMap(
  edges: Edge[],
  nodesById: Map<string, Node>,
): Map<string, string[]> {
  const outflowByFlow = new Map<string, string[]>();
  for (const edge of edges) {
    if (edgeKind(edge, nodesById) !== "outflow") continue;
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    const list = outflowByFlow.get(targetNode.id) ?? [];
    list.push(sourceNode.id);
    outflowByFlow.set(targetNode.id, list);
  }
  return outflowByFlow;
}

export function clampFlowRatesByStock(
  nodes: Node[],
  stepState: Record<string, number>,
  flowBottleneckRaw: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  stepDt: number,
): Record<string, number> {
  const flowEffectiveRate: Record<string, number> = {};
  for (const node of nodes) {
    if (!isFlowNode(node)) continue;
    const raw = asNumber(flowBottleneckRaw[node.id], 0);
    const sourceStocks = outflowByFlow.get(node.id) ?? [];
    if (sourceStocks.length === 0) {
      flowEffectiveRate[node.id] = raw;
      continue;
    }
    const totalAvailable = sourceStocks.reduce(
      (acc, stockId) => acc + Math.max(0, asNumber(stepState[stockId], 0)),
      0,
    );
    if (totalAvailable <= 0) {
      flowEffectiveRate[node.id] = 0;
      continue;
    }
    flowEffectiveRate[node.id] = Math.min(raw, totalAvailable / stepDt);
  }
  return flowEffectiveRate;
}

export function applyOutflows(
  nextState: Record<string, number>,
  stepState: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  flowEffectiveRate: Record<string, number>,
  stepDt: number,
): void {
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
}

export function applyInflows(
  nextState: Record<string, number>,
  stepState: Record<string, number>,
  edges: Edge[],
  nodesById: Map<string, Node>,
  flowEffectiveRate: Record<string, number>,
  stepDt: number,
): void {
  for (const edge of edges) {
    if (edgeKind(edge, nodesById) !== "inflow") continue;
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    const delta = Math.max(0, asNumber(flowEffectiveRate[sourceNode.id], 0) * stepDt);
    nextState[targetNode.id] =
      asNumber(nextState[targetNode.id], asNumber(stepState[targetNode.id], 0)) + delta;
  }
}
