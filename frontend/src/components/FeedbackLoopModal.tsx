import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BoundaryType,
  CreateBalancingFeedbackLoopResult,
  LoopOperation,
} from "../store/labStore";

export type ConnectedFlowOption = {
  id: string;
  label: string;
  direction: "inflow" | "outflow";
};

export type BalancingSubmitPayload = {
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  controlledFlowId: string;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  correctiveLabel?: string;
};

type FeedbackLoopModalProps = {
  isOpen: boolean;
  stockLabel: string;
  connectedFlows: ConnectedFlowOption[];
  mode?: "create" | "edit";
  initialValues?: Partial<BalancingSubmitPayload>;
  onClose: () => void;
  onSubmitBalancingLoop: (payload: BalancingSubmitPayload) => CreateBalancingFeedbackLoopResult;
};

function parseNumericInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function sanitizeOperation(value: unknown): LoopOperation {
  return value === "sub" ? "sub" : "add";
}

export function FeedbackLoopModal({
  isOpen,
  stockLabel,
  connectedFlows,
  mode = "create",
  initialValues,
  onClose,
  onSubmitBalancingLoop,
}: FeedbackLoopModalProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<"balancing" | "reinforcing">("balancing");
  const [boundaryType, setBoundaryType] = useState<BoundaryType>("upper");
  const [goalValueInput, setGoalValueInput] = useState("0");
  const [adjustmentTimeInput, setAdjustmentTimeInput] = useState("1");
  const [controlledFlowId, setControlledFlowId] = useState("");
  const [operation, setOperation] = useState<LoopOperation>("add");
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayStepsInput, setDelayStepsInput] = useState("1");
  const [correctiveLabel, setCorrectiveLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasConnectedFlow = connectedFlows.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab("balancing");
    setBoundaryType(initialValues?.boundaryType ?? "upper");
    setGoalValueInput(String(initialValues?.goalValue ?? 0));
    setAdjustmentTimeInput(String(initialValues?.adjustmentTime ?? 1));
    setControlledFlowId(initialValues?.controlledFlowId ?? connectedFlows[0]?.id ?? "");
    setOperation(sanitizeOperation(initialValues?.operation));
    setDelayEnabled(initialValues?.delayEnabled === true);
    setDelayStepsInput(String(initialValues?.delaySteps ?? 1));
    setCorrectiveLabel(initialValues?.correctiveLabel ?? "");
    setError(null);
  }, [isOpen, connectedFlows, initialValues]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const connectedFlowLookup = useMemo(() => new Set(connectedFlows.map((flow) => flow.id)), [connectedFlows]);

  useEffect(() => {
    if (!isOpen) return;
    if (!controlledFlowId || !connectedFlowLookup.has(controlledFlowId)) {
      setControlledFlowId(connectedFlows[0]?.id ?? "");
    }
  }, [isOpen, controlledFlowId, connectedFlows, connectedFlowLookup]);

  if (!isOpen) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!hasConnectedFlow) {
      setError("This stock has no connected inflow/outflow yet.");
      return;
    }

    const goalValue = parseNumericInput(goalValueInput);
    if (goalValue === null) {
      setError("Goal value must be a valid number.");
      return;
    }

    const adjustmentTime = parseNumericInput(adjustmentTimeInput);
    if (adjustmentTime === null || adjustmentTime <= 0) {
      setError("Adjustment time must be a number greater than 0.");
      return;
    }

    if (!controlledFlowId) {
      setError("Select a controlled flow.");
      return;
    }

    const delayStepsParsed = parseNumericInput(delayStepsInput);
    if (delayEnabled && (delayStepsParsed === null || delayStepsParsed < 1)) {
      setError("Delay steps must be an integer greater than or equal to 1.");
      return;
    }
    const delaySteps = Math.max(1, Math.floor(delayStepsParsed ?? 1));

    const result = onSubmitBalancingLoop({
      boundaryType,
      goalValue,
      adjustmentTime,
      controlledFlowId,
      operation,
      delayEnabled,
      delaySteps: delayEnabled ? delaySteps : 0,
      correctiveLabel: correctiveLabel.trim() || undefined,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
  };

  return (
    <div className="lab-loop-modal-overlay" onClick={onClose}>
      <div className="lab-loop-modal" onClick={(event) => event.stopPropagation()}>
        <div className="lab-loop-modal-head">
          <div>
            <h3 className="lab-panel-title">{mode === "edit" ? "Edit Feedback Loop" : "Create Feedback Loop"}</h3>
            <div className="lab-muted text-xs mt-1">Stock: {stockLabel}</div>
          </div>
          <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="lab-loop-tabs" role="tablist" aria-label="Feedback loop type">
          <button
            type="button"
            className={`lab-loop-tab ${activeTab === "balancing" ? "active" : ""}`}
            onClick={() => setActiveTab("balancing")}
            role="tab"
            aria-selected={activeTab === "balancing"}
          >
            Balancing Loop
          </button>
          <button
            type="button"
            className={`lab-loop-tab ${activeTab === "reinforcing" ? "active" : ""}`}
            onClick={() => setActiveTab("reinforcing")}
            role="tab"
            aria-selected={activeTab === "reinforcing"}
            disabled
          >
            Reinforcing Loop
          </button>
        </div>

        {activeTab === "balancing" ? (
          <form className="lab-loop-form" onSubmit={onSubmit}>
            <label className="lab-field text-sm">
              Boundary type
              <select className="lab-input mt-1" value={boundaryType} onChange={(e) => setBoundaryType(e.target.value as BoundaryType)}>
                <option value="upper">Upper bound (do not exceed)</option>
                <option value="lower">Lower bound (do not fall below)</option>
              </select>
            </label>

            <label className="lab-field text-sm">
              Goal value
              <input
                className="lab-input mt-1"
                type="text"
                inputMode="decimal"
                value={goalValueInput}
                onChange={(e) => setGoalValueInput(e.target.value)}
                placeholder="e.g. 120"
              />
            </label>

            <label className="lab-field text-sm">
              Adjustment time
              <input
                className="lab-input mt-1"
                type="text"
                inputMode="decimal"
                value={adjustmentTimeInput}
                onChange={(e) => setAdjustmentTimeInput(e.target.value)}
                placeholder="e.g. 3"
              />
            </label>

            <label className="lab-field text-sm">
              Controlled flow
              <select
                className="lab-input mt-1"
                value={controlledFlowId}
                onChange={(e) => setControlledFlowId(e.target.value)}
                disabled={!hasConnectedFlow}
              >
                {connectedFlows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.label} ({flow.direction})
                  </option>
                ))}
              </select>
            </label>

            <label className="lab-field text-sm">
              Operation on flow
              <select className="lab-input mt-1" value={operation} onChange={(e) => setOperation(e.target.value as LoopOperation)}>
                <option value="add">Add (+)</option>
                <option value="sub">Subtract (-)</option>
              </select>
            </label>

            <label className="lab-field text-sm">
              Corrective Action name (optional)
              <input
                className="lab-input mt-1"
                type="text"
                value={correctiveLabel}
                onChange={(e) => setCorrectiveLabel(e.target.value)}
                placeholder="Corrective Action"
              />
            </label>

            <div className="lab-loop-toggle">
              <label className="lab-loop-toggle">
                <input
                  type="checkbox"
                  checked={delayEnabled}
                  onChange={(e) => setDelayEnabled(e.target.checked)}
                />
                <span>Enable delay</span>
              </label>
              {delayEnabled ? (
                <label className="lab-field text-sm w-full">
                  Delay (steps)
                  <input
                    className="lab-input mt-1"
                    type="text"
                    inputMode="numeric"
                    value={delayStepsInput}
                    onChange={(e) => setDelayStepsInput(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </label>
              ) : null}
              <span>Flow is always clamped at &gt;= 0</span>
            </div>

            {error ? <div className="lab-error text-xs">{error}</div> : null}

            <div className="lab-loop-actions">
              <button className="lab-btn lab-btn-primary" type="submit" disabled={!hasConnectedFlow}>
                {mode === "edit" ? "Save Changes" : "Create Balancing Loop"}
              </button>
            </div>
          </form>
        ) : (
          <div className="lab-loop-empty">
            Reinforcing loop UI is reserved for the next iteration.
          </div>
        )}
      </div>
    </div>
  );
}
