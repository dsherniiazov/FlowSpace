import { Node } from "reactflow";

import {
  BalancingFeedbackLoop,
  FeedbackLoop,
  ReinforcingFeedbackLoop,
} from "../../../store/labStore";
import { asNumber } from "../utils";

export type LoopIndex = {
  balancingByFlowId: Map<string, BalancingFeedbackLoop[]>;
  reinforcingByFlowId: Map<string, ReinforcingFeedbackLoop[]>;
  goalFallbackByLoopId: Map<string, number>;
};

export function indexFeedbackLoops(
  feedbackLoops: FeedbackLoop[],
  nodesById: Map<string, Node>,
): LoopIndex {
  const balancingByFlowId = new Map<string, BalancingFeedbackLoop[]>();
  const reinforcingByFlowId = new Map<string, ReinforcingFeedbackLoop[]>();
  const goalFallbackByLoopId = new Map<string, number>();

  for (const loop of feedbackLoops) {
    if (loop.type === "balancing") {
      const list = balancingByFlowId.get(loop.controlledFlowId) ?? [];
      list.push(loop);
      balancingByFlowId.set(loop.controlledFlowId, list);
      const goalNode = nodesById.get(loop.goalNodeId);
      goalFallbackByLoopId.set(loop.id, asNumber(goalNode?.data?.quantity, loop.goalValue));
    } else {
      const list = reinforcingByFlowId.get(loop.controlledFlowId) ?? [];
      list.push(loop);
      reinforcingByFlowId.set(loop.controlledFlowId, list);
    }
  }
  return { balancingByFlowId, reinforcingByFlowId, goalFallbackByLoopId };
}

export function loopGap(
  loop: BalancingFeedbackLoop,
  values: Record<string, number>,
  goalFallbackByLoopId: Map<string, number>,
): number {
  const stock = asNumber(values[loop.stockId], 0);
  const goalFallback = goalFallbackByLoopId.get(loop.id) ?? asNumber(loop.goalValue, 0);
  const goal = asNumber(values[loop.goalNodeId], goalFallback);
  const rawGap = loop.boundaryType === "upper" ? stock - goal : goal - stock;
  return rawGap > 1e-9 ? rawGap : 0;
}

export function loopGapWithDelay(
  loop: BalancingFeedbackLoop,
  currentValues: Record<string, number>,
  stateHistory: Record<string, number>[],
  goalFallbackByLoopId: Map<string, number>,
): number {
  const delaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
  if (delaySteps <= 0) return loopGap(loop, currentValues, goalFallbackByLoopId);
  if (stateHistory.length <= delaySteps) return 0;
  const historical = stateHistory[stateHistory.length - 1 - delaySteps];
  return loopGap(loop, historical, goalFallbackByLoopId);
}

export function loopCorrectiveFromGap(loop: BalancingFeedbackLoop, gap: number): number {
  const adjustmentTime = Math.max(0.000001, asNumber(loop.adjustmentTime, 1));
  return gap / adjustmentTime;
}

export function reinforcingMultiplierFromScope(
  loop: ReinforcingFeedbackLoop,
  scope: Record<string, number> | null,
): number {
  if (!scope) return 0;
  const stockValue = asNumber(scope[loop.stockId], 0);
  const k = asNumber(loop.k, 1);
  if (!loop.growthLimitNodeId) return k * stockValue;
  const growthLimit = asNumber(scope[loop.growthLimitNodeId], 0);
  return k * stockValue * Math.max(0, growthLimit - stockValue);
}

export function reinforcingDelayedScope(
  loop: ReinforcingFeedbackLoop,
  currentScope: Record<string, number>,
  stateHistory: Record<string, number>[],
): Record<string, number> | null {
  const delaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
  if (delaySteps <= 0) return currentScope;
  if (stateHistory.length <= delaySteps) return null;
  return stateHistory[stateHistory.length - 1 - delaySteps];
}
