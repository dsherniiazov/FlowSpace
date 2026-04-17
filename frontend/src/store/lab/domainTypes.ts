export type BoundaryType = "upper" | "lower";
export type LoopOperation = "add" | "sub";
export type ReinforcingPolarity = "positive" | "negative";

export type BalancingFeedbackLoop = {
  id: string;
  type: "balancing";
  /** Optional user-provided display name shown in the editor and on the
   *  simulation chart when the discrepancy series is rendered. */
  name?: string;
  stockId: string;
  goalNodeId: string;
  discrepancyNodeId: string;
  correctiveNodeId: string;
  controlledFlowId: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  baseFlowExpression: string;
  edgeIds: string[];
};

export type ReinforcingFeedbackLoop = {
  id: string;
  type: "reinforcing";
  name?: string;
  stockId: string;
  multiplierNodeId: string;
  growthLimitNodeId?: string;
  controlledFlowId: string;
  k: number;
  polarity: ReinforcingPolarity;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  baseFlowExpression: string;
  edgeIds: string[];
};

export type FeedbackLoop = BalancingFeedbackLoop | ReinforcingFeedbackLoop;

export type CreateBalancingFeedbackLoopPayload = {
  stockId: string;
  controlledFlowId: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  clampNonNegative: boolean;
  name?: string;
  correctiveLabel?: string;
  positions: {
    goal: { x: number; y: number };
    discrepancy: { x: number; y: number };
    corrective: { x: number; y: number };
  };
};

export type CreateReinforcingFeedbackLoopPayload = {
  stockId: string;
  controlledFlowId: string;
  k: number;
  polarity: ReinforcingPolarity;
  delayEnabled: boolean;
  delaySteps: number;
  growthLimit?: number;
  clampNonNegative: boolean;
  name?: string;
  multiplierLabel?: string;
  positions: {
    multiplier: { x: number; y: number };
    growthLimit?: { x: number; y: number };
    marker: { x: number; y: number };
  };
};

export type UpdateBalancingFeedbackLoopPayload = {
  id: string;
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  controlledFlowId: string;
  name?: string;
  correctiveLabel?: string;
  correctivePosition?: { x: number; y: number };
};

export type FeedbackLoopResult =
  | { ok: true; loopId: string }
  | { ok: false; error: string };

export type LabSnapshot = {
  nodes: import("reactflow").Node[];
  edges: import("reactflow").Edge[];
  feedbackLoops: FeedbackLoop[];
};
