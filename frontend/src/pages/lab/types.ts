import type { ControlOp } from "../../store/lab/graph";

export type { ControlOp };
export type SourceHandleId = "source-left" | "source-right" | "source-top" | "source-bottom";
export type TargetHandleId = "target-left" | "target-right" | "target-top" | "target-bottom";

export type ConnectedFlowOption = {
  id: string;
  label: string;
  direction: "inflow" | "outflow";
};

export type LabTaskContext = {
  taskId: number;
  lessonId: number;
  taskTitle: string;
  taskDescription: string;
};

export type LabNavigationState = {
  systemId?: number;
  systemTitle?: string;
  systemGraph?: Record<string, unknown>;
  taskContext?: LabTaskContext;
  reviewing?: boolean;
};

export const CONTROL_OPS: Array<{ value: ControlOp; label: string }> = [
  { value: "add", label: "+" },
  { value: "sub", label: "-" },
  { value: "mul", label: "*" },
  { value: "div", label: "/" },
  { value: "pow", label: "^" },
  { value: "mod", label: "%" },
];
