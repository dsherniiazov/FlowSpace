import { asNumber } from "../utils";

const EXPRESSION_FN_CACHE = new Map<string, (scope: Record<string, unknown>) => unknown>();

export type DelayResolver = (
  nodeId: string,
  stepsBack: number,
  currentValues: Record<string, number>,
) => number;

export function evaluateExpression(
  expression: string,
  scope: Record<string, unknown>,
): number | null {
  const source = expression.trim();
  if (!source) return null;
  let compiled = EXPRESSION_FN_CACHE.get(source);
  if (!compiled) {
    // eslint-disable-next-line no-new-func
    compiled = new Function("scope", `with (scope) { return (${source}); }`) as (
      scope: Record<string, unknown>,
    ) => unknown;
    EXPRESSION_FN_CACHE.set(source, compiled);
  }
  try {
    const value = Number(compiled(scope));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function expressionScope(
  values: Record<string, number>,
  delayedValueResolver?: DelayResolver,
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
