import { Connection, Edge, Node } from "reactflow";

import type { FeedbackLoop } from "./domainTypes";

export type EdgeKind = "inflow" | "outflow" | "neutral";
export type NodeKind = "stock" | "flow" | "constant" | "variable" | "other";
export type ControlOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";

export const CONTROL_OPS: ControlOp[] = ["add", "sub", "mul", "div", "pow", "mod"];

const OP_LABEL: Record<ControlOp, string> = {
  add: "+",
  sub: "-",
  mul: "*",
  div: "/",
  pow: "^",
  mod: "%",
};

export function isControlOp(value: string): value is ControlOp {
  return CONTROL_OPS.includes(value as ControlOp);
}

export function opLabel(op: ControlOp): string {
  return OP_LABEL[op];
}

export function nodeKind(node: Node | undefined): NodeKind {
  if (!node) return "other";
  const id = String(node.id);
  if (node.type === "stockNode" || id.startsWith("stock_")) return "stock";
  if (node.type === "flowNode" || id.startsWith("flow_")) return "flow";
  if (node.type === "constantNode" || id.startsWith("constant_")) return "constant";
  if (node.type === "variableNode" || id.startsWith("variable_")) return "variable";
  return "other";
}

export function inferEdgeKind(sourceNode: Node | undefined, targetNode: Node | undefined): EdgeKind {
  if (!sourceNode || !targetNode) return "neutral";
  const source = nodeKind(sourceNode);
  const target = nodeKind(targetNode);
  if (source === "stock" && target === "flow") return "outflow";
  if (source === "flow" && target === "stock") return "inflow";
  return "neutral";
}

export function isControlEdge(sourceNode: Node | undefined, targetNode: Node | undefined): boolean {
  if (!sourceNode || !targetNode) return false;
  const source = nodeKind(sourceNode);
  const target = nodeKind(targetNode);
  if (source === "constant") return target === "flow" || target === "variable";
  if (source === "variable") return target === "flow" || target === "variable" || target === "constant";
  return false;
}

export function edgeWeightByKind(kind: EdgeKind): number {
  return kind === "outflow" ? -1 : 1;
}

export function canConnect(sourceNode: Node | undefined, targetNode: Node | undefined): boolean {
  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
  const source = nodeKind(sourceNode);
  const target = nodeKind(targetNode);
  if (source === "stock" && target === "stock") return false;
  if (source === "flow" && target === "flow") return false;
  if (source === "constant") return target === "flow" || target === "variable";
  if (source === "variable") return target === "flow" || target === "variable" || target === "constant";
  if (target === "constant") return false;
  return true;
}

export function feedbackLoopEdgeOverlay(
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  loops: readonly FeedbackLoop[],
): Partial<{
  feedbackLoop: boolean;
  feedbackLoopType: "balancing" | "reinforcing";
  reinforcingPolarity: string;
}> {
  if (!sourceNode || !targetNode) return {};
  if (isControlEdge(sourceNode, targetNode)) return {};

  const s = sourceNode.id;
  const t = targetNode.id;
  const sk = nodeKind(sourceNode);

  for (const loop of loops) {
    if (loop.type === "reinforcing") {
      if (t === loop.multiplierNodeId) {
        if (sk === "stock" || sk === "constant" || sk === "variable") {
          return {
            feedbackLoop: true,
            feedbackLoopType: "reinforcing",
            reinforcingPolarity: loop.polarity,
          };
        }
      }
      if (loop.growthLimitNodeId && t === loop.growthLimitNodeId) {
        if (sk === "stock" || sk === "constant" || sk === "variable") {
          return {
            feedbackLoop: true,
            feedbackLoopType: "reinforcing",
            reinforcingPolarity: loop.polarity,
          };
        }
      }
      if (s === loop.multiplierNodeId && t === loop.controlledFlowId) {
        return {
          feedbackLoop: true,
          feedbackLoopType: "reinforcing",
          reinforcingPolarity: loop.polarity,
        };
      }
    } else {
      if (t === loop.discrepancyNodeId && (s === loop.goalNodeId || s === loop.stockId)) {
        return { feedbackLoop: true, feedbackLoopType: "balancing" };
      }
      if (
        t === loop.discrepancyNodeId &&
        (sk === "constant" || sk === "variable") &&
        s !== loop.goalNodeId &&
        s !== loop.stockId
      ) {
        return { feedbackLoop: true, feedbackLoopType: "balancing" };
      }
      if (s === loop.discrepancyNodeId && t === loop.correctiveNodeId) {
        return { feedbackLoop: true, feedbackLoopType: "balancing" };
      }
      if (s === loop.correctiveNodeId && t === loop.controlledFlowId) {
        return { feedbackLoop: true, feedbackLoopType: "balancing" };
      }
      if (t === loop.correctiveNodeId && (sk === "constant" || sk === "variable") && s !== loop.discrepancyNodeId) {
        return { feedbackLoop: true, feedbackLoopType: "balancing" };
      }
    }
  }
  return {};
}

export function isValidLabConnection(connection: Connection, nodes: Node[]): boolean {
  if (!connection.source || !connection.target) return false;
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  return canConnect(sourceNode, targetNode);
}

export function nextNodeId(nodes: Node[], prefix: NodeKind | "constant" | "variable"): string {
  const existing = new Set(nodes.map((node) => String(node.id)));
  let index = nodes.filter((node) => String(node.id).startsWith(`${prefix}_`)).length + 1;
  let candidate = `${prefix}_${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${prefix}_${index}`;
  }
  return candidate;
}

export function generateEdgeId(edges: Edge[]): string {
  const existing = new Set(edges.map((edge) => String(edge.id)));
  let index = edges.filter((edge) => String(edge.id).startsWith("edge_")).length + 1;
  let candidate = `edge_${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `edge_${index}`;
  }
  return candidate;
}

export function asFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function clampFlowNonNegative(value: unknown): number {
  return Math.max(0, asFiniteNumber(value, 0));
}

export function isFeedbackLoopActionNode(nodeId: string, loops: readonly FeedbackLoop[]): boolean {
  for (const loop of loops) {
    if (loop.type === "balancing" && nodeId === loop.correctiveNodeId) return true;
    if (loop.type === "reinforcing" && nodeId === loop.multiplierNodeId) return true;
  }
  return false;
}
