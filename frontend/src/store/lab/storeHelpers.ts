import type { EdgeChange, Node, NodeChange } from "reactflow";

import type { RunStep } from "../../types/api";

export function readLessonUi(graph: Record<string, unknown>): Record<string, unknown> | null {
  const raw = graph.lessonUi ?? graph.lesson_ui;
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

export function readSavedSimulation(graph: Record<string, unknown>): {
  steps: RunStep[];
  configuredSteps?: number;
  dt?: number;
  algorithm?: "euler_v2" | "rk4_v2";
} {
  const raw = graph.simulation;
  if (!raw || typeof raw !== "object") return { steps: [] };

  const simulation = raw as Record<string, unknown>;
  const rawSteps = Array.isArray(simulation.timeline) ? simulation.timeline : [];
  const parsedSteps = rawSteps
    .map(readRunStep)
    .filter((step): step is RunStep => Boolean(step));
  const algorithm = simulation.algorithm === "rk4_v2"
    ? "rk4_v2"
    : simulation.algorithm === "euler_v2"
      ? "euler_v2"
      : undefined;
  const configuredSteps = Number(simulation.steps);
  const dt = Number(simulation.dt);

  return {
    steps: parsedSteps,
    configuredSteps: Number.isFinite(configuredSteps) && configuredSteps > 0 ? Math.floor(configuredSteps) : undefined,
    dt: Number.isFinite(dt) && dt > 0 ? dt : undefined,
    algorithm,
  };
}

export function filterChanges<T extends NodeChange | EdgeChange>(
  changes: T[],
  protectedIds: Set<string>,
  extraAllowed?: Set<string>,
): T[] {
  return changes.filter((change) => {
    if (!("id" in change) || change.id === undefined) return true;
    if (!protectedIds.has(change.id)) return true;
    if (change.type === "remove") return false;
    if (extraAllowed && extraAllowed.has(change.type)) return true;
    return false;
  });
}

export function rebuildFlowData(
  node: Node,
  baseFlowExpression: string,
  nextFlowExpression: string,
): Node {
  return {
    ...node,
    data: {
      ...(node.data ?? {}),
      baseFlowExpression: String(node.data?.baseFlowExpression ?? baseFlowExpression),
      expression: nextFlowExpression,
    },
  };
}

function readRunStep(item: unknown): RunStep | null {
  if (!item || typeof item !== "object") return null;

  const step = item as Record<string, unknown>;
  const rawValues = step.values;
  if (!rawValues || typeof rawValues !== "object") return null;

  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawValues as Record<string, unknown>)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) values[key] = numeric;
  }

  return {
    step_index: Math.max(0, Math.floor(Number(step.step_index ?? 0))),
    time: Number.isFinite(Number(step.time)) ? Number(step.time) : 0,
    values,
  };
}
