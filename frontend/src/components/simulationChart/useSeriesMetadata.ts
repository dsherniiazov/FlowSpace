import { useMemo } from "react";
import { Edge, Node } from "reactflow";

import { FeedbackLoop } from "../../store/labStore";
import { RunStep } from "../../types/api";

export type SeriesMetadata = {
  nodeIdToLabel: Map<string, string>;
  displayKeys: string[];
};

function buildDiscrepancyLabelMap(feedbackLoops: FeedbackLoop[]): Map<string, string> {
  const map = new Map<string, string>();
  let balancingIndex = 0;
  for (const loop of feedbackLoops) {
    if (loop.type !== "balancing") continue;
    balancingIndex += 1;
    const customName = (loop.name ?? "").trim();
    const pretty = customName ? customName : `Feedback loop ${balancingIndex}`;
    map.set(loop.discrepancyNodeId, `Feedback loop: ${pretty}`);
  }
  return map;
}

function buildHiddenIds(
  feedbackLoops: FeedbackLoop[],
  nodes: Node[],
  discrepancyIds: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const loop of feedbackLoops) {
    if (loop.type === "balancing") {
      ids.add(loop.goalNodeId);
      ids.add(loop.correctiveNodeId);
    } else {
      ids.add(loop.multiplierNodeId);
      if (loop.growthLimitNodeId) ids.add(loop.growthLimitNodeId);
    }
  }
  for (const node of nodes) {
    if (discrepancyIds.has(node.id)) continue;
    if (
      node.type === "constantNode" ||
      node.type === "commentNode" ||
      node.data?.reinforcingMarker === true ||
      node.data?.reinforcingCollapsed === true ||
      node.data?.reinforcingTextOnly === true ||
      (node.data?.loopRole != null && node.data?.loopRole !== "")
    ) {
      ids.add(node.id);
    }
  }
  return ids;
}

export function useSeriesMetadata({
  steps,
  nodes,
  edges,
  feedbackLoops,
  selectedNodeId,
}: {
  steps: RunStep[];
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  selectedNodeId: string | null;
}): SeriesMetadata {
  const discrepancyLabelMap = useMemo(
    () => buildDiscrepancyLabelMap(feedbackLoops),
    [feedbackLoops],
  );

  const discrepancyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const loop of feedbackLoops) {
      if (loop.type === "balancing") ids.add(loop.discrepancyNodeId);
    }
    return ids;
  }, [feedbackLoops]);

  const nodeIdToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) map.set(node.id, String(node.data?.label ?? node.id));
    for (const [id, label] of discrepancyLabelMap) map.set(id, label);
    return map;
  }, [nodes, discrepancyLabelMap]);

  const hiddenIds = useMemo(
    () => buildHiddenIds(feedbackLoops, nodes, discrepancyIds),
    [nodes, feedbackLoops, discrepancyIds],
  );

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of edges) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    return ids;
  }, [edges]);

  const displayKeys = useMemo(() => {
    if (steps.length === 0) return [] as string[];
    const allKeys = Object.keys(steps[0].values).filter((k) => !k.startsWith("_"));
    if (selectedNodeId && allKeys.includes(selectedNodeId)) return [selectedNodeId];
    const nodeById = new Map<string, Node>();
    for (const node of nodes) nodeById.set(node.id, node);
    return allKeys.filter((key) => {
      if (hiddenIds.has(key)) return false;
      const node = nodeById.get(key);
      if (node && (node.type === "stockNode" || node.type === "flowNode")) {
        if (!connectedIds.has(key)) return false;
      }
      return true;
    });
  }, [steps, selectedNodeId, nodes, hiddenIds, connectedIds]);

  return { nodeIdToLabel, displayKeys };
}
