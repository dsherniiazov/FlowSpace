import { BoundaryType, FeedbackLoop, LoopOperation, ReinforcingPolarity } from "./domainTypes";

const MIN_ADJUSTMENT_TIME = 0.000001;

export function discrepancyExpression(
  boundaryType: BoundaryType,
  goalNodeId: string,
  stockId: string,
): string {
  return boundaryType === "upper"
    ? `(${stockId} > ${goalNodeId} ? (${stockId} - ${goalNodeId}) : 0)`
    : `(${stockId} < ${goalNodeId} ? (${goalNodeId} - ${stockId}) : 0)`;
}

export function correctiveExpression(
  adjustmentTime: number,
  discrepancyNodeId: string,
  delayEnabled: boolean,
  delaySteps: number,
): string {
  const source =
    delayEnabled && delaySteps > 0
      ? `delay("${discrepancyNodeId}", ${Math.max(1, Math.floor(delaySteps))})`
      : discrepancyNodeId;
  return `(max(0, (${source}))) / (${Math.max(MIN_ADJUSTMENT_TIME, adjustmentTime)})`;
}

function balancingFlowExpression(
  baseExpression: string,
  correctiveNodeId: string,
  operation: LoopOperation,
): string {
  const combined =
    operation === "sub"
      ? `(${baseExpression}) - (${correctiveNodeId})`
      : `(${baseExpression}) + (${correctiveNodeId})`;
  return `max(0, ${combined})`;
}

function reinforcingFlowExpression(
  baseExpression: string,
  multiplierNodeId: string,
  polarity: ReinforcingPolarity,
  clampNonNegative: boolean,
): string {
  const combined =
    polarity === "negative"
      ? `(${baseExpression}) - (${multiplierNodeId})`
      : `(${baseExpression}) + (${multiplierNodeId})`;
  return clampNonNegative ? `max(0, ${combined})` : combined;
}

export function rebuildFlowExpression(
  baseExpression: string,
  loopsForFlow: FeedbackLoop[],
): string {
  return loopsForFlow.reduce<string>((expression, loop) => {
    if (loop.type === "balancing") {
      return balancingFlowExpression(expression, loop.correctiveNodeId, loop.operation);
    }
    return reinforcingFlowExpression(
      expression,
      loop.multiplierNodeId,
      loop.polarity,
      loop.clampNonNegative,
    );
  }, baseExpression);
}

export function reinforcingMultiplierExpression(
  k: number,
  stockId: string,
  growthLimitNodeId: string | undefined,
): string {
  if (growthLimitNodeId === undefined) {
    return `(${k}) * (${stockId})`;
  }
  return `(${k}) * (${stockId}) * max(0, (${growthLimitNodeId}) - (${stockId}))`;
}
