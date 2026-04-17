import { Connection, Edge, Node } from "reactflow";

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
  return (source === "constant" || source === "variable") && target === "flow";
}

export function edgeWeightByKind(kind: EdgeKind): number {
  return kind === "outflow" ? -1 : 1;
}

export function canConnect(sourceNode: Node | undefined, targetNode: Node | undefined): boolean {
  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
  const source = nodeKind(sourceNode);
  const target = nodeKind(targetNode);
  // Standard system-dynamics rule: stocks ↔ stocks and flows ↔ flows must go through
  // the opposite kind, never directly.
  if (source === "stock" && target === "stock") return false;
  if (source === "flow" && target === "flow") return false;
  if (source === "constant") return target === "flow" || target === "variable";
  if (source === "variable") return target === "flow";
  if (target === "constant") return false;
  return true;
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
