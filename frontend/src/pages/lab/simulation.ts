import { Edge, Node } from "reactflow";
import { RunStep } from "../../types/api";
import {
  BalancingFeedbackLoop,
  FeedbackLoop,
  ReinforcingFeedbackLoop,
} from "../../store/labStore";
import {
  applyOperation,
  asNumber,
  edgeKind,
  isConstantNode,
  isFlowNode,
  isVariableNode,
} from "./utils";
import { ControlOp } from "./types";

const EXPRESSION_FN_CACHE = new Map<string, (scope: Record<string, unknown>) => unknown>();

function evaluateExpression(expression: string, scope: Record<string, unknown>): number | null {
  const source = expression.trim();
  if (!source) return null;
  let compiled = EXPRESSION_FN_CACHE.get(source);
  if (!compiled) {
    // eslint-disable-next-line no-new-func
    compiled = new Function("scope", `with (scope) { return (${source}); }`) as (scope: Record<string, unknown>) => unknown;
    EXPRESSION_FN_CACHE.set(source, compiled);
  }
  try {
    const value = Number(compiled(scope));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function expressionScope(
  values: Record<string, number>,
  delayedValueResolver?: (nodeId: string, steps: number, currentValues: Record<string, number>) => number,
): Record<string, unknown> {
  const delayFn = (nodeId: unknown, steps: unknown): number => {
    if (!delayedValueResolver) return 0;
    const id = String(nodeId ?? "").trim();
    if (!id) return 0;
    const stepsNumber = Math.max(0, Math.floor(asNumber(steps, 0)));
    return delayedValueResolver(id, stepsNumber, values);
  };
  return {
    ...values,
    max: Math.max,
    min: Math.min,
    abs: Math.abs,
    pow: Math.pow,
    sqrt: Math.sqrt,
    exp: Math.exp,
    log: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    PI: Math.PI,
    E: Math.E,
    delay: delayFn,
  };
}

function valueOfNode(
  node: Node,
  state: Record<string, number>,
  flowBottleneck: Record<string, number>,
): number {
  if (isFlowNode(node)) return flowBottleneck[node.id] ?? state[node.id] ?? asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0);
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
  const goalFallbackByLoopId = new Map<string, number>();
  const balancingLoopsByFlowId = new Map<string, BalancingFeedbackLoop[]>();
  const reinforcingLoopsByFlowId = new Map<string, ReinforcingFeedbackLoop[]>();

  for (const loop of feedbackLoops) {
    if (loop.type === "balancing") {
      const list = balancingLoopsByFlowId.get(loop.controlledFlowId) ?? [];
      list.push(loop);
      balancingLoopsByFlowId.set(loop.controlledFlowId, list);
      const goalNode = nodesById.get(loop.goalNodeId);
      goalFallbackByLoopId.set(loop.id, asNumber(goalNode?.data?.quantity, loop.goalValue));
    } else {
      const list = reinforcingLoopsByFlowId.get(loop.controlledFlowId) ?? [];
      list.push(loop);
      reinforcingLoopsByFlowId.set(loop.controlledFlowId, list);
    }
  }

  const stateHistory: Record<string, number>[] = [];
  const loopZeroHoldById = new Map<string, boolean>();

  function delayedValue(nodeId: string, stepsBack: number, currentValues: Record<string, number>): number {
    if (stepsBack <= 0) return asNumber(currentValues[nodeId], 0);
    if (stateHistory.length <= stepsBack) return 0;
    const historical = stateHistory[stateHistory.length - 1 - stepsBack];
    return asNumber(historical?.[nodeId], 0);
  }

  function resolveExpressionNodes(baseState: Record<string, number>, flowValues: Record<string, number>): Record<string, number> {
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
  }

  function loopGapWithDelay(loop: BalancingFeedbackLoop, values: Record<string, number>): number {
    const delaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
    const resolveGap = (scope: Record<string, number>) => {
      const stock = asNumber(scope[loop.stockId], 0);
      const goalFallback = goalFallbackByLoopId.get(loop.id) ?? asNumber(loop.goalValue, 0);
      const goal = asNumber(scope[loop.goalNodeId], goalFallback);
      const rawGap = loop.boundaryType === "upper" ? stock - goal : goal - stock;
      return rawGap > 1e-9 ? rawGap : 0;
    };
    if (delaySteps <= 0) return resolveGap(values);
    if (stateHistory.length <= delaySteps) return 0;
    const historical = stateHistory[stateHistory.length - 1 - delaySteps];
    return resolveGap(historical);
  }

  function loopCorrectiveFromGap(loop: BalancingFeedbackLoop, gap: number): number {
    const adjustmentTime = Math.max(0.000001, asNumber(loop.adjustmentTime, 1));
    return gap / adjustmentTime;
  }

  function reinforcingMultiplierFromScope(
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

  // Initial step
  state = resolveExpressionNodes(state, {});
  for (const loop of feedbackLoops) {
    if (loop.type !== "balancing") continue;
    const discrepancy = loopGapWithDelay(loop, state);
    state[loop.discrepancyNodeId] = discrepancy;
    state[loop.correctiveNodeId] = discrepancy > 1e-9 ? loopCorrectiveFromGap(loop, discrepancy) : 0;
    loopZeroHoldById.set(loop.id, false);
  }
  stateHistory.push({ ...state });
  const initialValues: Record<string, number> = {};
  for (const node of nodes) {
    initialValues[node.id] = asNumber(state[node.id], isFlowNode(node) ? asNumber(node.data?.bottleneck ?? 0) : asNumber(node.data?.quantity ?? 0));
  }
  dataSteps.push({ step_index: 0, time: 0, values: initialValues });

  // Simulation loop
  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    const stepState = resolveExpressionNodes(state, {});
    const flowBottleneckRaw: Record<string, number> = {};
    const flowEffectiveRate: Record<string, number> = {};
    const nextState: Record<string, number> = { ...stepState };
    const loopDiscrepancyById = new Map<string, number>();
    const loopCorrectiveById = new Map<string, number>();

    // Calculate flow bottlenecks
    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      const balancingFlowLoops = balancingLoopsByFlowId.get(node.id) ?? [];
      const reinforcingFlowLoops = reinforcingLoopsByFlowId.get(node.id) ?? [];
      const isLoopControlledFlow = balancingFlowLoops.length > 0 || reinforcingFlowLoops.length > 0;
      const flowExpression = String(node.data?.expression ?? "").trim();
      let current = asNumber(stepState[node.id], asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));

      if (isLoopControlledFlow) {
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
          if (evaluated !== null) {
            current = evaluated;
          } else {
            current = asNumber(baseFlowExpression, baseFallback);
          }
        }
      } else if (flowExpression.length > 0) {
        const evaluated = evaluateExpression(
          flowExpression,
          expressionScope({ ...stepState, ...flowBottleneckRaw }, delayedValue),
        );
        if (evaluated !== null) current = evaluated;
      }

      // Apply control edges
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

      // Apply feedback loops
      if (isLoopControlledFlow) {
        for (const loop of balancingFlowLoops) {
          const sourceGap = loopGapWithDelay(loop, stepState);
          loopDiscrepancyById.set(loop.id, sourceGap);
          const isActive = sourceGap > 1e-9;
          const correctiveInput = isActive ? loopCorrectiveFromGap(loop, sourceGap) : 0;
          let zeroHold = loopZeroHoldById.get(loop.id) ?? false;

          if (!isActive) {
            zeroHold = false;
          } else if (loop.operation === "sub" && correctiveInput >= current - 1e-9) {
            zeroHold = true;
          }

          loopZeroHoldById.set(loop.id, zeroHold);
          loopCorrectiveById.set(loop.id, correctiveInput);

          if (zeroHold && loop.operation === "sub") {
            current = 0;
          } else {
            current = applyOperation(current, correctiveInput, loop.operation as ControlOp);
          }
        }
        for (const loop of reinforcingFlowLoops) {
          const loopDelaySteps = loop.delayEnabled ? Math.max(0, Math.floor(asNumber(loop.delaySteps, 0))) : 0;
          const delayedScope =
            loopDelaySteps > 0
              ? stateHistory.length <= loopDelaySteps
                ? null
                : stateHistory[stateHistory.length - 1 - loopDelaySteps]
              : stepState;
          const multiplierValue = reinforcingMultiplierFromScope(loop, delayedScope);
          current = loop.polarity === "negative" ? current - multiplierValue : current + multiplierValue;
          if (loop.clampNonNegative) current = Math.max(0, current);
        }
      }
      flowBottleneckRaw[node.id] = Math.max(0, Number.isFinite(current) ? current : 0);
    }

    // Compute outflow source stocks
    const outflowByFlow = new Map<string, string[]>();
    for (const edge of edges) {
      const kind = edgeKind(edge, nodesById);
      if (kind !== "outflow") continue;
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      if (!sourceNode || !targetNode) continue;
      const list = outflowByFlow.get(targetNode.id) ?? [];
      list.push(sourceNode.id);
      outflowByFlow.set(targetNode.id, list);
    }

    // Clamp flows by available stock
    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      const flowId = node.id;
      const raw = asNumber(flowBottleneckRaw[flowId], 0);
      const sourceStocks = outflowByFlow.get(flowId) ?? [];
      if (sourceStocks.length === 0) {
        flowEffectiveRate[flowId] = raw;
        continue;
      }
      const totalAvailable = sourceStocks.reduce((acc, stockId) => acc + Math.max(0, asNumber(stepState[stockId], 0)), 0);
      if (totalAvailable <= 0) {
        flowEffectiveRate[flowId] = 0;
        continue;
      }
      const maxRateFromStocks = totalAvailable / stepDt;
      flowEffectiveRate[flowId] = Math.min(raw, maxRateFromStocks);
    }

    // Apply outflows
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

    // Apply inflows
    for (const edge of edges) {
      const kind = edgeKind(edge, nodesById);
      if (kind === "neutral") continue;
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      if (!sourceNode || !targetNode) continue;
      if (kind === "inflow") {
        const flowNode = sourceNode.id;
        const targetStock = targetNode.id;
        const delta = Math.max(0, asNumber(flowEffectiveRate[flowNode], 0) * stepDt);
        nextState[targetStock] = asNumber(nextState[targetStock], asNumber(stepState[targetStock], 0)) + delta;
      }
    }

    // Keep flow state as computed bottleneck
    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      nextState[node.id] = asNumber(flowBottleneckRaw[node.id], asNumber(node.data?.bottleneck ?? node.data?.quantity ?? 0));
    }

    // Resolve expression-based variables
    let settledState = resolveExpressionNodes(nextState, flowEffectiveRate);

    for (const node of nodes) {
      if (!isVariableNode(node)) continue;
      const expression = String(node.data?.expression ?? "").trim();
      if (expression.length > 0) continue;
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
      const discrepancy = loopDiscrepancyById.get(loop.id) ?? loopGapWithDelay(loop, stepState);
      settledState[loop.discrepancyNodeId] = discrepancy;
      settledState[loop.correctiveNodeId] = loopCorrectiveById.get(loop.id) ?? 0;
    }

    const values: Record<string, number> = {};
    for (const node of nodes) {
      values[node.id] = asNumber(settledState[node.id], asNumber(node.data?.quantity ?? node.data?.bottleneck ?? 0));
    }
    dataSteps.push({ step_index: stepIndex, time: stepIndex, values });
    state = settledState;
    stateHistory.push({ ...state });
  }

  return dataSteps;
}
