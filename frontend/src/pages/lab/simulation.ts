import { Edge, Node } from "reactflow";

import { FeedbackLoop } from "../../store/labStore";
import { RunStep } from "../../types/api";
import { ControlOp } from "./types";
import {
  applyOperation,
  asNumber,
  isConstantNode,
  isFlowNode,
  isVariableNode,
} from "./utils";
import { evaluateExpression, expressionScope } from "./simulation/expression";
import {
  indexFeedbackLoops,
  loopCorrectiveFromGap,
  loopGapWithDelay,
  reinforcingDelayedScope,
  reinforcingMultiplierFromScope,
} from "./simulation/feedbackLoops";
import {
  applyInflows,
  applyOutflows,
  buildOutflowMap,
  clampFlowRatesByStock,
} from "./simulation/topology";

function valueOfNode(
  node: Node,
  state: Record<string, number>,
  flowBottleneck: Record<string, number>,
): number {
  if (isFlowNode(node)) {
    return (
      flowBottleneck[node.id] ??
      state[node.id] ??
      asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0)
    );
  }
  return state[node.id] ?? asNumber(node.data?.quantity ?? node.data?.initial ?? 0);
}

export function simulateTimeline(
  startState: Record<string, number>,
  nodes: Node[],
  edges: Edge[],
  nodesById: Map<string, Node>,
  feedbackLoops: FeedbackLoop[],
  steps: number,
  dt: number,
): RunStep[] {
  const dataSteps: RunStep[] = [];
  let state: Record<string, number> = { ...startState };
  const stepDt = Math.max(0.000001, asNumber(dt, 1));
  const expressionNodes = nodes.filter((node) => isConstantNode(node) || isVariableNode(node));
  const loopIndex = indexFeedbackLoops(feedbackLoops, nodesById);
  const stateHistory: Record<string, number>[] = [];
  const loopZeroHoldById = new Map<string, boolean>();

  const delayedValue = (
    nodeId: string,
    stepsBack: number,
    currentValues: Record<string, number>,
  ): number => {
    if (stepsBack <= 0) return asNumber(currentValues[nodeId], 0);
    if (stateHistory.length <= stepsBack) return 0;
    return asNumber(stateHistory[stateHistory.length - 1 - stepsBack]?.[nodeId], 0);
  };

  const resolveExpressionNodes = (
    baseState: Record<string, number>,
    flowValues: Record<string, number>,
  ): Record<string, number> => {
    const resolved: Record<string, number> = { ...baseState };
    const maxPasses = Math.max(2, expressionNodes.length);
    for (let pass = 0; pass < maxPasses; pass += 1) {
      let changed = false;
      for (const node of expressionNodes) {
        const expression = String(node.data?.expression ?? "").trim();
        if (!expression) continue;
        const fallback = asNumber(resolved[node.id], asNumber(node.data?.quantity ?? 0));
        const evaluated = evaluateExpression(
          expression,
          expressionScope({ ...resolved, ...flowValues }, delayedValue),
        );
        const nextValue = evaluated === null ? fallback : evaluated;
        if (Math.abs(asNumber(resolved[node.id], 0) - nextValue) > 1e-9) changed = true;
        resolved[node.id] = nextValue;
      }
      if (!changed) break;
    }
    return resolved;
  };

  state = resolveExpressionNodes(state, {});
  for (const loop of feedbackLoops) {
    if (loop.type !== "balancing") continue;
    const discrepancy = loopGapWithDelay(loop, state, stateHistory, loopIndex.goalFallbackByLoopId);
    state[loop.discrepancyNodeId] = discrepancy;
    state[loop.correctiveNodeId] =
      discrepancy > 1e-9 ? loopCorrectiveFromGap(loop, discrepancy) : 0;
    loopZeroHoldById.set(loop.id, false);
  }
  stateHistory.push({ ...state });

  const initialValues: Record<string, number> = {};
  for (const node of nodes) {
    initialValues[node.id] = asNumber(
      state[node.id],
      isFlowNode(node) ? asNumber(node.data?.bottleneck ?? 0) : asNumber(node.data?.quantity ?? 0),
    );
  }
  dataSteps.push({ step_index: 0, time: 0, values: initialValues });

  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    const stepState = resolveExpressionNodes(state, {});
    const flowBottleneckRaw: Record<string, number> = {};
    const nextState: Record<string, number> = { ...stepState };
    const loopDiscrepancyById = new Map<string, number>();
    const loopCorrectiveById = new Map<string, number>();

    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      const balancingFlowLoops = loopIndex.balancingByFlowId.get(node.id) ?? [];
      const reinforcingFlowLoops = loopIndex.reinforcingByFlowId.get(node.id) ?? [];
      const isLoopControlled = balancingFlowLoops.length > 0 || reinforcingFlowLoops.length > 0;
      const flowExpression = String(node.data?.expression ?? "").trim();
      let current = asNumber(
        stepState[node.id],
        asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0),
      );

      if (isLoopControlled) {
        const baseFallback = asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0);
        const baseFlowExpression = String(
          node.data?.baseFlowExpression ??
            balancingFlowLoops[0]?.baseFlowExpression ??
            reinforcingFlowLoops[0]?.baseFlowExpression ??
            "",
        ).trim();
        current = baseFallback;
        if (baseFlowExpression.length > 0) {
          const evaluated = evaluateExpression(
            baseFlowExpression,
            expressionScope({ ...stepState, ...flowBottleneckRaw }, delayedValue),
          );
          current = evaluated !== null ? evaluated : asNumber(baseFlowExpression, baseFallback);
        }
      } else if (flowExpression.length > 0) {
        const evaluated = evaluateExpression(
          flowExpression,
          expressionScope({ ...stepState, ...flowBottleneckRaw }, delayedValue),
        );
        if (evaluated !== null) current = evaluated;
      }

      for (const edge of edges) {
        if (edge.target !== node.id) continue;
        if (edge.data?.feedbackLoop === true) continue;
        const sourceNode = nodesById.get(edge.source);
        if (!sourceNode) continue;
        if (!(isConstantNode(sourceNode) || isVariableNode(sourceNode))) continue;
        const input = valueOfNode(sourceNode, stepState, flowBottleneckRaw);
        const op = String(edge.data?.op ?? "add") as ControlOp;
        current = applyOperation(current, input, op);
      }

      if (isLoopControlled) {
        for (const loop of balancingFlowLoops) {
          const sourceGap = loopGapWithDelay(
            loop,
            stepState,
            stateHistory,
            loopIndex.goalFallbackByLoopId,
          );
          loopDiscrepancyById.set(loop.id, sourceGap);
          const isActive = sourceGap > 1e-9;
          const correctiveInput = isActive ? loopCorrectiveFromGap(loop, sourceGap) : 0;
          let zeroHold = loopZeroHoldById.get(loop.id) ?? false;
          if (!isActive) zeroHold = false;
          else if (loop.operation === "sub" && correctiveInput >= current - 1e-9) zeroHold = true;
          loopZeroHoldById.set(loop.id, zeroHold);
          loopCorrectiveById.set(loop.id, correctiveInput);
          current =
            zeroHold && loop.operation === "sub"
              ? 0
              : applyOperation(current, correctiveInput, loop.operation as ControlOp);
        }
        for (const loop of reinforcingFlowLoops) {
          const scope = reinforcingDelayedScope(loop, stepState, stateHistory);
          const multiplier = reinforcingMultiplierFromScope(loop, scope);
          current = loop.polarity === "negative" ? current - multiplier : current + multiplier;
          if (loop.clampNonNegative) current = Math.max(0, current);
        }
      }
      flowBottleneckRaw[node.id] = Math.max(0, Number.isFinite(current) ? current : 0);
    }

    const outflowByFlow = buildOutflowMap(edges, nodesById);
    const flowEffectiveRate = clampFlowRatesByStock(
      nodes,
      stepState,
      flowBottleneckRaw,
      outflowByFlow,
      stepDt,
    );
    applyOutflows(nextState, stepState, outflowByFlow, flowEffectiveRate, stepDt);
    applyInflows(nextState, stepState, edges, nodesById, flowEffectiveRate, stepDt);

    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      nextState[node.id] = asNumber(
        flowBottleneckRaw[node.id],
        asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0),
      );
    }

    let settledState = resolveExpressionNodes(nextState, flowEffectiveRate);

    for (const node of nodes) {
      if (!isVariableNode(node)) continue;
      if (String(node.data?.expression ?? "").trim().length > 0) continue;
      const incoming = edges.filter((edge) => edge.target === node.id);
      if (incoming.length === 0) continue;
      let total = 0;
      for (const edge of incoming) {
        const sourceNode = nodesById.get(edge.source);
        if (!sourceNode) continue;
        total += valueOfNode(sourceNode, settledState, flowEffectiveRate);
      }
      settledState[node.id] = total;
    }
    settledState = resolveExpressionNodes(settledState, flowEffectiveRate);

    for (const loop of feedbackLoops) {
      if (loop.type !== "balancing") continue;
      const discrepancy =
        loopDiscrepancyById.get(loop.id) ??
        loopGapWithDelay(loop, stepState, stateHistory, loopIndex.goalFallbackByLoopId);
      settledState[loop.discrepancyNodeId] = discrepancy;
      settledState[loop.correctiveNodeId] = loopCorrectiveById.get(loop.id) ?? 0;
    }

    const values: Record<string, number> = {};
    for (const node of nodes) {
      values[node.id] = asNumber(
        settledState[node.id],
        asNumber(node.data?.quantity ?? node.data?.bottleneck ?? 0),
      );
    }
    dataSteps.push({ step_index: stepIndex, time: stepIndex, values });
    state = settledState;
    stateHistory.push({ ...state });
  }

  return dataSteps;
}
