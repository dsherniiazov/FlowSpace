import type { RunStep } from "../../types/api";

export type LabGraphJson = {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function nodeCarriesFlowValue(node: Record<string, unknown>): boolean {
  const nodeId = String(node.id ?? "");
  return String(node.kind ?? "").includes("flow") || nodeId.startsWith("flow_");
}

export function graphJsonWithSnapshotValues(
  graph: LabGraphJson,
  values?: Record<string, number>,
): LabGraphJson {
  if (!values || !Array.isArray(graph.nodes)) return graph;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const nodeId = String(node.id ?? "");
      const live = values[nodeId];
      if (live === undefined) return node;
      if (nodeCarriesFlowValue(node)) return { ...node, initial: live, quantity: live, bottleneck: live };
      return { ...node, initial: live, quantity: live };
    }),
  };
}

export function graphJsonForPersistence(
  graph: LabGraphJson,
  simulationSteps: RunStep[],
  sliderIndex: number,
): LabGraphJson {
  const snapshot = simulationSteps.length
    ? simulationSteps[Math.min(sliderIndex, simulationSteps.length - 1)]
    : null;

  return graphJsonWithSnapshotValues(graph, snapshot?.values);
}
