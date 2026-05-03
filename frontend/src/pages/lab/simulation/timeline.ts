import { Edge, Node } from "reactflow";

import { FeedbackLoop } from "../../../store/labStore";
import { RunStep } from "../../../types/api";
import { ControlOp } from "../types";
import {
  applyOperation,
  asNumber,
  edgeKind,
  isConstantNode,
  isFlowNode,
  isStockNode,
  isVariableNode,
} from "../utils";
import { evaluateExpression, expressionScope } from "./expression";
import {
  indexFeedbackLoops,
  loopCorrectiveFromGap,
  loopGapWithDelay,
  reinforcingDelayedScope,
  reinforcingMultiplierFromScope,
  LoopIndex,
} from "./feedbackLoops";
import {
  applyInflows,
  applyOutflows,
  buildOutflowMap,
  clampFlowRatesByStock,
} from "./topology";

export type SimulationAlgorithm = "euler_v2" | "rk4_v2";

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

type StepContext = {
  nodes: Node[];
  edges: Edge[];
  nodesById: Map<string, Node>;
  feedbackLoops: FeedbackLoop[];
  loopIndex: LoopIndex;
  expressionNodes: Node[];
  stepDt: number;
  stateHistory: Record<string, number>[];
  loopZeroHoldById: Map<string, boolean>;
  delayedValue: (
    nodeId: string,
    stepsBack: number,
    currentValues: Record<string, number>,
  ) => number;
};

type StepSharedContext = Omit<StepContext, "loopZeroHoldById">;

type FlowEvaluation = {
  stepState: Record<string, number>;
  flowBottleneckRaw: Record<string, number>;
  flowEffectiveRate: Record<string, number>;
  loopDiscrepancyById: Map<string, number>;
  loopCorrectiveById: Map<string, number>;
};

function resolveExpressionNodes(
  ctx: Pick<StepContext, "expressionNodes">,
  baseState: Record<string, number>,
  flowValues: Record<string, number>,
  delayedValue: StepContext["delayedValue"],
): Record<string, number> {
  const resolved: Record<string, number> = { ...baseState };
  const maxPasses = Math.max(2, ctx.expressionNodes.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const node of ctx.expressionNodes) {
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
}

function computeFlowBottlenecks(
  ctx: StepContext,
  stepState: Record<string, number>,
  loopDiscrepancyById: Map<string, number>,
  loopCorrectiveById: Map<string, number>,
  edges: Edge[],
): Record<string, number> {
  const { nodes, nodesById, loopIndex, delayedValue } = ctx;
  const flowBottleneckRaw: Record<string, number> = {};

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
          ctx.stateHistory,
          loopIndex.goalFallbackByLoopId,
        );
        loopDiscrepancyById.set(loop.id, sourceGap);
        const isActive = sourceGap > 1e-9;
        const correctiveInput = isActive ? loopCorrectiveFromGap(loop, sourceGap) : 0;
        let zeroHold = ctx.loopZeroHoldById.get(loop.id) ?? false;
        if (!isActive) zeroHold = false;
        else if (loop.operation === "sub" && correctiveInput >= current - 1e-9) zeroHold = true;
        ctx.loopZeroHoldById.set(loop.id, zeroHold);
        loopCorrectiveById.set(loop.id, correctiveInput);
        current =
          zeroHold && loop.operation === "sub"
            ? 0
            : applyOperation(current, correctiveInput, loop.operation as ControlOp);
      }
      for (const loop of reinforcingFlowLoops) {
        const scope = reinforcingDelayedScope(loop, stepState, ctx.stateHistory);
        const multiplier = reinforcingMultiplierFromScope(loop, scope);
        current = loop.polarity === "negative" ? current - multiplier : current + multiplier;
        if (loop.clampNonNegative) current = Math.max(0, current);
      }
    }
    flowBottleneckRaw[node.id] = Math.max(0, Number.isFinite(current) ? current : 0);
  }

  return flowBottleneckRaw;
}

function applyQuantityNodeInputs(
  nodes: Node[],
  edges: Edge[],
  nodesById: Map<string, Node>,
  settledState: Record<string, number>,
  flowEffectiveRate: Record<string, number>,
): void {
  const sourceState = { ...settledState };
  for (const node of nodes) {
    if (!(isConstantNode(node) || isVariableNode(node))) continue;
    if (String(node.data?.expression ?? "").trim().length > 0) continue;
    const incoming = edges.filter((edge) => edge.target === node.id);
    if (incoming.length === 0) continue;
    let current = asNumber(settledState[node.id], asNumber(node.data?.quantity ?? node.data?.initial ?? 0));
    for (const edge of incoming) {
      if (edge.data?.feedbackLoop === true) continue;
      const sourceNode = nodesById.get(edge.source);
      if (!sourceNode) continue;
      if (!(isConstantNode(sourceNode) || isVariableNode(sourceNode))) continue;
      const input = valueOfNode(sourceNode, sourceState, flowEffectiveRate);
      const op = String(edge.data?.op ?? "add") as ControlOp;
      current = applyOperation(current, input, op);
    }
    settledState[node.id] = Number.isFinite(current) ? current : asNumber(sourceState[node.id], 0);
  }
}

function evaluateStepFlows(
  ctx: StepSharedContext,
  exprCtx: Pick<StepContext, "expressionNodes">,
  inputState: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  loopZeroHoldById: Map<string, boolean>,
): FlowEvaluation {
  let stepState = resolveExpressionNodes(exprCtx, inputState, {}, ctx.delayedValue);
  applyQuantityNodeInputs(ctx.nodes, ctx.edges, ctx.nodesById, stepState, {});
  stepState = resolveExpressionNodes(exprCtx, stepState, {}, ctx.delayedValue);
  const loopDiscrepancyById = new Map<string, number>();
  const loopCorrectiveById = new Map<string, number>();
  const flowCtx: StepContext = {
    ...ctx,
    loopZeroHoldById,
  };
  const flowBottleneckRaw = computeFlowBottlenecks(
    flowCtx,
    stepState,
    loopDiscrepancyById,
    loopCorrectiveById,
    ctx.edges,
  );
  const flowEffectiveRate = clampFlowRatesByStock(
    ctx.nodes,
    stepState,
    flowBottleneckRaw,
    outflowByFlow,
    ctx.stepDt,
  );

  return {
    stepState,
    flowBottleneckRaw,
    flowEffectiveRate,
    loopDiscrepancyById,
    loopCorrectiveById,
  };
}

function computeStockDerivatives(
  nodes: Node[],
  edges: Edge[],
  nodesById: Map<string, Node>,
  stepState: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  flowEffectiveRate: Record<string, number>,
): Record<string, number> {
  const derivatives: Record<string, number> = {};
  for (const node of nodes) {
    if (isStockNode(node)) derivatives[node.id] = 0;
  }

  for (const [flowId, sourceStocks] of outflowByFlow.entries()) {
    const rate = Math.max(0, asNumber(flowEffectiveRate[flowId], 0));
    if (rate <= 0) continue;
    const availableList = sourceStocks.map((stockId) => ({
      stockId,
      available: Math.max(0, asNumber(stepState[stockId], 0)),
    }));
    const totalAvailable = availableList.reduce((acc, item) => acc + item.available, 0);
    if (totalAvailable <= 0) continue;
    for (const item of availableList) {
      derivatives[item.stockId] =
        asNumber(derivatives[item.stockId], 0) - rate * (item.available / totalAvailable);
    }
  }

  for (const edge of edges) {
    if (edgeKind(edge, nodesById) !== "inflow") continue;
    const targetNode = nodesById.get(edge.target);
    if (!targetNode || !isStockNode(targetNode)) continue;
    const rate = Math.max(0, asNumber(flowEffectiveRate[edge.source], 0));
    derivatives[targetNode.id] = asNumber(derivatives[targetNode.id], 0) + rate;
  }

  return derivatives;
}

function addScaledStockDerivatives(
  nodes: Node[],
  baseState: Record<string, number>,
  derivatives: Record<string, number>,
  scale: number,
): Record<string, number> {
  const nextState: Record<string, number> = { ...baseState };
  for (const node of nodes) {
    if (!isStockNode(node)) continue;
    const base = asNumber(baseState[node.id], asNumber(node.data?.quantity ?? node.data?.initial ?? 0));
    const next = base + asNumber(derivatives[node.id], 0) * scale;
    nextState[node.id] = Number.isFinite(next) ? next : base;
  }
  return nextState;
}

function combineRk4StockState(
  nodes: Node[],
  baseState: Record<string, number>,
  k1: Record<string, number>,
  k2: Record<string, number>,
  k3: Record<string, number>,
  k4: Record<string, number>,
  stepDt: number,
): Record<string, number> {
  const nextState: Record<string, number> = { ...baseState };
  for (const node of nodes) {
    if (!isStockNode(node)) continue;
    const base = asNumber(baseState[node.id], asNumber(node.data?.quantity ?? node.data?.initial ?? 0));
    const increment =
      (stepDt / 6) *
      (asNumber(k1[node.id], 0) +
        2 * asNumber(k2[node.id], 0) +
        2 * asNumber(k3[node.id], 0) +
        asNumber(k4[node.id], 0));
    const next = base + increment;
    if (!Number.isFinite(next)) {
      nextState[node.id] = base;
    } else {
      nextState[node.id] = next < 0 && increment < 0 ? 0 : next;
    }
  }
  return nextState;
}

function replaceMapContents<T>(target: Map<string, T>, source: Map<string, T>): void {
  target.clear();
  for (const [key, value] of source.entries()) {
    target.set(key, value);
  }
}

function settleStepState(
  ctx: StepSharedContext,
  exprCtx: Pick<StepContext, "expressionNodes">,
  nextState: Record<string, number>,
  flowBottleneckRaw: Record<string, number>,
  flowEffectiveRate: Record<string, number>,
  loopDiscrepancyById: Map<string, number>,
  loopCorrectiveById: Map<string, number>,
  fallbackLoopState: Record<string, number>,
): Record<string, number> {
  for (const node of ctx.nodes) {
    if (!isFlowNode(node)) continue;
    nextState[node.id] = asNumber(
      flowBottleneckRaw[node.id],
      asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0),
    );
  }

  let settledState = resolveExpressionNodes(exprCtx, nextState, flowEffectiveRate, ctx.delayedValue);
  applyQuantityNodeInputs(ctx.nodes, ctx.edges, ctx.nodesById, settledState, flowEffectiveRate);
  settledState = resolveExpressionNodes(exprCtx, settledState, flowEffectiveRate, ctx.delayedValue);

  for (const loop of ctx.feedbackLoops) {
    if (loop.type !== "balancing") continue;
    const discrepancy =
      loopDiscrepancyById.get(loop.id) ??
      loopGapWithDelay(loop, fallbackLoopState, ctx.stateHistory, ctx.loopIndex.goalFallbackByLoopId);
    settledState[loop.discrepancyNodeId] = discrepancy;
    settledState[loop.correctiveNodeId] = loopCorrectiveById.get(loop.id) ?? 0;
  }

  return settledState;
}

function simulateEulerStep(
  ctx: StepSharedContext,
  exprCtx: Pick<StepContext, "expressionNodes">,
  state: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  loopZeroHoldById: Map<string, boolean>,
): Record<string, number> {
  const evaluation = evaluateStepFlows(ctx, exprCtx, state, outflowByFlow, loopZeroHoldById);
  const nextState: Record<string, number> = { ...evaluation.stepState };
  applyOutflows(nextState, evaluation.stepState, outflowByFlow, evaluation.flowEffectiveRate, ctx.stepDt);
  applyInflows(nextState, evaluation.stepState, ctx.edges, ctx.nodesById, evaluation.flowEffectiveRate, ctx.stepDt);

  return settleStepState(
    ctx,
    exprCtx,
    nextState,
    evaluation.flowBottleneckRaw,
    evaluation.flowEffectiveRate,
    evaluation.loopDiscrepancyById,
    evaluation.loopCorrectiveById,
    evaluation.stepState,
  );
}

function simulateRk4Step(
  ctx: StepSharedContext,
  exprCtx: Pick<StepContext, "expressionNodes">,
  state: Record<string, number>,
  outflowByFlow: Map<string, string[]>,
  loopZeroHoldById: Map<string, boolean>,
): Record<string, number> {
  const k1Evaluation = evaluateStepFlows(
    ctx,
    exprCtx,
    state,
    outflowByFlow,
    new Map(loopZeroHoldById),
  );
  const k1 = computeStockDerivatives(
    ctx.nodes,
    ctx.edges,
    ctx.nodesById,
    k1Evaluation.stepState,
    outflowByFlow,
    k1Evaluation.flowEffectiveRate,
  );

  const k2Evaluation = evaluateStepFlows(
    ctx,
    exprCtx,
    addScaledStockDerivatives(ctx.nodes, k1Evaluation.stepState, k1, ctx.stepDt / 2),
    outflowByFlow,
    new Map(loopZeroHoldById),
  );
  const k2 = computeStockDerivatives(
    ctx.nodes,
    ctx.edges,
    ctx.nodesById,
    k2Evaluation.stepState,
    outflowByFlow,
    k2Evaluation.flowEffectiveRate,
  );

  const k3Evaluation = evaluateStepFlows(
    ctx,
    exprCtx,
    addScaledStockDerivatives(ctx.nodes, k1Evaluation.stepState, k2, ctx.stepDt / 2),
    outflowByFlow,
    new Map(loopZeroHoldById),
  );
  const k3 = computeStockDerivatives(
    ctx.nodes,
    ctx.edges,
    ctx.nodesById,
    k3Evaluation.stepState,
    outflowByFlow,
    k3Evaluation.flowEffectiveRate,
  );

  const k4Evaluation = evaluateStepFlows(
    ctx,
    exprCtx,
    addScaledStockDerivatives(ctx.nodes, k1Evaluation.stepState, k3, ctx.stepDt),
    outflowByFlow,
    new Map(loopZeroHoldById),
  );
  const k4 = computeStockDerivatives(
    ctx.nodes,
    ctx.edges,
    ctx.nodesById,
    k4Evaluation.stepState,
    outflowByFlow,
    k4Evaluation.flowEffectiveRate,
  );

  const integratedState = combineRk4StockState(
    ctx.nodes,
    k1Evaluation.stepState,
    k1,
    k2,
    k3,
    k4,
    ctx.stepDt,
  );
  const finalZeroHoldById = new Map(loopZeroHoldById);
  const finalEvaluation = evaluateStepFlows(
    ctx,
    exprCtx,
    integratedState,
    outflowByFlow,
    finalZeroHoldById,
  );
  replaceMapContents(loopZeroHoldById, finalZeroHoldById);

  return settleStepState(
    ctx,
    exprCtx,
    finalEvaluation.stepState,
    finalEvaluation.flowBottleneckRaw,
    finalEvaluation.flowEffectiveRate,
    finalEvaluation.loopDiscrepancyById,
    finalEvaluation.loopCorrectiveById,
    finalEvaluation.stepState,
  );
}

export function simulateTimeline(
  startState: Record<string, number>,
  nodes: Node[],
  edges: Edge[],
  nodesById: Map<string, Node>,
  feedbackLoops: FeedbackLoop[],
  steps: number,
  dt: number,
  algorithm: SimulationAlgorithm = "euler_v2",
): RunStep[] {
  const dataSteps: RunStep[] = [];
  let state: Record<string, number> = { ...startState };
  const stepDt = Math.max(0.000001, asNumber(dt, 1));
  const expressionNodes = nodes.filter((node) => isConstantNode(node) || isVariableNode(node));
  const loopIndex = indexFeedbackLoops(feedbackLoops, nodesById);
  const stateHistory: Record<string, number>[] = [];
  const loopZeroHoldById = new Map<string, boolean>();
  const outflowByFlow = buildOutflowMap(edges, nodesById);

  const delayedValue: StepContext["delayedValue"] = (nodeId, stepsBack, currentValues) => {
    if (stepsBack <= 0) return asNumber(currentValues[nodeId], 0);
    if (stateHistory.length <= stepsBack) return 0;
    return asNumber(stateHistory[stateHistory.length - 1 - stepsBack]?.[nodeId], 0);
  };

  const exprCtx = { expressionNodes };
  state = resolveExpressionNodes(exprCtx, state, {}, delayedValue);
  applyQuantityNodeInputs(nodes, edges, nodesById, state, {});
  state = resolveExpressionNodes(exprCtx, state, {}, delayedValue);

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

  const stepCtxBase: Omit<StepContext, "delayedValue" | "stateHistory" | "loopZeroHoldById"> = {
    nodes,
    edges,
    nodesById,
    feedbackLoops,
    loopIndex,
    expressionNodes,
    stepDt,
  };

  const sharedCtx: StepSharedContext = {
    ...stepCtxBase,
    stateHistory,
    delayedValue,
  };

  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    const settledState =
      algorithm === "rk4_v2"
        ? simulateRk4Step(sharedCtx, exprCtx, state, outflowByFlow, loopZeroHoldById)
        : simulateEulerStep(sharedCtx, exprCtx, state, outflowByFlow, loopZeroHoldById);

    const values: Record<string, number> = {};
    for (const node of nodes) {
      values[node.id] = asNumber(
        settledState[node.id],
        asNumber(node.data?.quantity ?? node.data?.bottleneck ?? 0),
      );
    }
    dataSteps.push({ step_index: stepIndex, time: stepIndex * stepDt, values });
    state = settledState;
    stateHistory.push({ ...state });
  }

  return dataSteps;
}
