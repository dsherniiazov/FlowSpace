import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "reactflow";

import type { RunStep } from "../../types/api";
import type {
  CreateBalancingFeedbackLoopPayload,
  CreateReinforcingFeedbackLoopPayload,
  FeedbackLoop,
  FeedbackLoopResult,
  LabSnapshot,
  UpdateBalancingFeedbackLoopPayload,
} from "./domainTypes";
import type { ControlOp } from "./graph";

export type LabState = {
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  lessonUi: Record<string, unknown> | null;
  activeSystemId: number | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  steps: number;
  dt: number;
  algorithm: "euler_v2" | "rk4_v2";
  simulationSteps: RunStep[];
  sliderIndex: number;
  lockEditing: boolean;
  past: LabSnapshot[];
  future: LabSnapshot[];
  isReplayingHistory: boolean;

  undo: () => void;
  redo: () => void;
  resetHistory: () => void;

  setSteps: (value: number) => void;
  setDt: (value: number) => void;
  setAlgorithm: (value: "euler_v2" | "rk4_v2") => void;
  setSliderIndex: (value: number) => void;
  setLockEditing: (value: boolean) => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setActiveSystemId: (id: number | null) => void;

  updateSelectedNode: (patch: Record<string, unknown>) => void;
  patchNodeData: (nodeId: string, partialData: Record<string, unknown>) => void;
  updateSelectedEdge: (patch: Record<string, unknown>) => void;
  setSelectedNodeControlOp: (op: ControlOp) => void;

  addStock: () => void;
  addFlow: () => void;
  addConstant: () => void;
  addVariable: () => void;
  addNodeAtPosition: (
    type: "stock" | "flow" | "commentNode",
    position: { x: number; y: number },
    extraData?: Record<string, unknown>,
  ) => string;

  createBalancingFeedbackLoop: (payload: CreateBalancingFeedbackLoopPayload) => FeedbackLoopResult;
  createReinforcingFeedbackLoop: (payload: CreateReinforcingFeedbackLoopPayload) => FeedbackLoopResult;
  updateBalancingFeedbackLoop: (payload: UpdateBalancingFeedbackLoopPayload) => FeedbackLoopResult;
  deleteBalancingFeedbackLoop: (id: string) => FeedbackLoopResult;

  setSimulationSteps: (steps: RunStep[]) => void;
  clearSimulation: () => void;
  resetToInitialGraph: () => void;
  replaceGraph: (nodes: Node[], edges: Edge[]) => void;
  toGraphJson: () => Record<string, unknown>;
  loadGraphJson: (graph: Record<string, unknown>) => void;
};
