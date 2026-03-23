export type ControlOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";
export type SourceHandleId = "source-left" | "source-right" | "source-top" | "source-bottom";
export type TargetHandleId = "target-left" | "target-right" | "target-top" | "target-bottom";

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
};

export const CONTROL_OPS: Array<{ value: ControlOp; label: string }> = [
  { value: "add", label: "+" },
  { value: "sub", label: "-" },
  { value: "mul", label: "*" },
  { value: "div", label: "/" },
  { value: "pow", label: "^" },
  { value: "mod", label: "%" },
];
