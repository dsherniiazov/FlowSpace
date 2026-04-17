import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BoundaryType,
  CreateBalancingFeedbackLoopResult,
  LoopOperation,
  ReinforcingPolarity,
} from "../store/labStore";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";
import type { ConnectedFlowOption } from "../pages/lab/types";

export type { ConnectedFlowOption } from "../pages/lab/types";

export type BalancingSubmitPayload = {
  boundaryType: BoundaryType;
  goalValue: number;
  adjustmentTime: number;
  controlledFlowId: string;
  operation: LoopOperation;
  delayEnabled: boolean;
  delaySteps: number;
  /** Optional user-provided display name for the whole loop. Shown in the
   *  editor panel of any auxiliary node and on the simulation chart. */
  name?: string;
  correctiveLabel?: string;
};

export type ReinforcingSubmitPayload = {
  k: number;
  controlledFlowId: string;
  polarity: ReinforcingPolarity;
  delayEnabled: boolean;
  delaySteps: number;
  growthLimit?: number;
  clampNonNegative: boolean;
  name?: string;
  multiplierLabel?: string;
};

type FeedbackLoopModalProps = {
  isOpen: boolean;
  stockLabel: string;
  connectedFlows: ConnectedFlowOption[];
  mode?: "create" | "edit";
  initialTab?: "balancing" | "reinforcing";
  initialBalancingValues?: Partial<BalancingSubmitPayload>;
  initialReinforcingValues?: Partial<ReinforcingSubmitPayload>;
  onClose: () => void;
  onSubmitBalancingLoop: (payload: BalancingSubmitPayload) => CreateBalancingFeedbackLoopResult;
  onSubmitReinforcingLoop: (payload: ReinforcingSubmitPayload) => CreateBalancingFeedbackLoopResult;
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
  initialTab,
  initialBalancingValues,
  initialReinforcingValues,
  onClose,
  onSubmitBalancingLoop,
  onSubmitReinforcingLoop,
}: FeedbackLoopModalProps): JSX.Element | null {
  const closeDialogShortcut = useShortcutStore((state) => state.bindings.close_dialog);
  const [activeTab, setActiveTab] = useState<"balancing" | "reinforcing">("balancing");
  const [boundaryType, setBoundaryType] = useState<BoundaryType>("upper");
  const [goalValueInput, setGoalValueInput] = useState("0");
  const [adjustmentTimeInput, setAdjustmentTimeInput] = useState("1");
  const [controlledFlowId, setControlledFlowId] = useState("");
  const [operation, setOperation] = useState<LoopOperation>("add");
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayStepsInput, setDelayStepsInput] = useState("1");
  const [correctiveLabel, setCorrectiveLabel] = useState("");
  const [kInput, setKInput] = useState("1");
  const [reinforcingFlowId, setReinforcingFlowId] = useState("");
  const [polarity, setPolarity] = useState<ReinforcingPolarity>("positive");
  const [reinforcingDelayEnabled, setReinforcingDelayEnabled] = useState(false);
  const [reinforcingDelayStepsInput, setReinforcingDelayStepsInput] = useState("1");
  const [growthLimitInput, setGrowthLimitInput] = useState("");
  const [clampNonNegative, setClampNonNegative] = useState(true);
  const [multiplierLabel, setMultiplierLabel] = useState("Multiplier");
  const [loopName, setLoopName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasConnectedFlow = connectedFlows.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab ?? "balancing");
    setBoundaryType(initialBalancingValues?.boundaryType ?? "upper");
    setGoalValueInput(String(initialBalancingValues?.goalValue ?? 0));
    setAdjustmentTimeInput(String(initialBalancingValues?.adjustmentTime ?? 1));
    setControlledFlowId(initialBalancingValues?.controlledFlowId ?? connectedFlows[0]?.id ?? "");
    setOperation(sanitizeOperation(initialBalancingValues?.operation));
    setDelayEnabled(initialBalancingValues?.delayEnabled === true);
    setDelayStepsInput(String(initialBalancingValues?.delaySteps ?? 1));
    setCorrectiveLabel(initialBalancingValues?.correctiveLabel ?? "");
    setKInput(String(initialReinforcingValues?.k ?? 1));
    setReinforcingFlowId(initialReinforcingValues?.controlledFlowId ?? connectedFlows[0]?.id ?? "");
    setPolarity(initialReinforcingValues?.polarity ?? "positive");
    setReinforcingDelayEnabled(initialReinforcingValues?.delayEnabled === true);
    setReinforcingDelayStepsInput(String(initialReinforcingValues?.delaySteps ?? 1));
    setGrowthLimitInput(
      initialReinforcingValues?.growthLimit === undefined ? "" : String(initialReinforcingValues.growthLimit),
    );
    setClampNonNegative(initialReinforcingValues?.clampNonNegative !== false);
    setMultiplierLabel(initialReinforcingValues?.multiplierLabel ?? "Multiplier");
    // Loop name is shared across tabs; prefer whichever side of initial values
    // carries it (edit mode will only populate one of the two).
    setLoopName(
      initialBalancingValues?.name ?? initialReinforcingValues?.name ?? "",
    );
    setError(null);
  }, [isOpen, connectedFlows, initialTab, initialBalancingValues, initialReinforcingValues]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcutEvent(event, closeDialogShortcut)) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialogShortcut, isOpen, onClose]);

  const connectedFlowLookup = useMemo(() => new Set(connectedFlows.map((flow) => flow.id)), [connectedFlows]);

  useEffect(() => {
    if (!isOpen) return;
    if (!controlledFlowId || !connectedFlowLookup.has(controlledFlowId)) {
      setControlledFlowId(connectedFlows[0]?.id ?? "");
    }
    if (!reinforcingFlowId || !connectedFlowLookup.has(reinforcingFlowId)) {
      setReinforcingFlowId(connectedFlows[0]?.id ?? "");
    }
  }, [isOpen, controlledFlowId, reinforcingFlowId, connectedFlows, connectedFlowLookup]);

  if (!isOpen) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!hasConnectedFlow) {
      setError("This stock has no connected inflow/outflow yet.");
      return;
    }

    let result: CreateBalancingFeedbackLoopResult;
    if (activeTab === "balancing") {
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

      result = onSubmitBalancingLoop({
        boundaryType,
        goalValue,
        adjustmentTime,
        controlledFlowId,
        operation,
        delayEnabled,
        delaySteps: delayEnabled ? delaySteps : 0,
        name: loopName.trim() || undefined,
        correctiveLabel: correctiveLabel.trim() || undefined,
      });
    } else {
      const k = parseNumericInput(kInput);
      if (k === null) {
        setError("Multiplier coefficient k must be a valid number.");
        return;
      }
      if (!reinforcingFlowId) {
        setError("Select a controlled flow.");
        return;
      }
      const growthLimitParsed = parseNumericInput(growthLimitInput);
      if (growthLimitInput.trim().length > 0 && growthLimitParsed === null) {
        setError("Growth limit must be a valid number.");
        return;
      }
      const delayStepsParsed = parseNumericInput(reinforcingDelayStepsInput);
      if (reinforcingDelayEnabled && (delayStepsParsed === null || delayStepsParsed < 1)) {
        setError("Delay steps must be an integer greater than or equal to 1.");
        return;
      }
      result = onSubmitReinforcingLoop({
        k,
        controlledFlowId: reinforcingFlowId,
        polarity,
        delayEnabled: reinforcingDelayEnabled,
        delaySteps: reinforcingDelayEnabled ? Math.max(1, Math.floor(delayStepsParsed ?? 1)) : 0,
        growthLimit: growthLimitInput.trim().length > 0 ? growthLimitParsed ?? undefined : undefined,
        clampNonNegative,
        name: loopName.trim() || undefined,
        multiplierLabel: multiplierLabel.trim() || undefined,
      });
    }

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

        <label className="lab-field text-sm lab-loop-name-field">
          Loop name (optional)
          <input
            className="lab-input mt-1"
            type="text"
            value={loopName}
            onChange={(e) => setLoopName(e.target.value)}
            placeholder="e.g. Inventory stabilizer"
            maxLength={80}
          />
          <span className="lab-muted text-xs mt-1 block">
            Shown in the side panel when any loop node is selected and on the
            simulation chart as this loop&apos;s discrepancy label.
          </span>
        </label>

        <div className="lab-loop-tabs" role="tablist" aria-label="Feedback loop type">
          <button
            type="button"
            className={`lab-loop-tab ${activeTab === "balancing" ? "active" : ""}`}
            onClick={() => setActiveTab("balancing")}
            role="tab"
            aria-selected={activeTab === "balancing"}
            disabled={mode === "edit"}
          >
            Balancing Loop
          </button>
          <button
            type="button"
            className={`lab-loop-tab ${activeTab === "reinforcing" ? "active" : ""}`}
            onClick={() => setActiveTab("reinforcing")}
            role="tab"
            aria-selected={activeTab === "reinforcing"}
            disabled={mode === "edit"}
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
          <form className="lab-loop-form" onSubmit={onSubmit}>
            <label className="lab-field text-sm">
              Multiplier coefficient k
              <input
                className="lab-input mt-1"
                type="text"
                inputMode="decimal"
                value={kInput}
                onChange={(e) => setKInput(e.target.value)}
                placeholder="e.g. 1"
              />
            </label>

            <label className="lab-field text-sm">
              Controlled flow
              <select
                className="lab-input mt-1"
                value={reinforcingFlowId}
                onChange={(e) => setReinforcingFlowId(e.target.value)}
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
              Polarity
              <select className="lab-input mt-1" value={polarity} onChange={(e) => setPolarity(e.target.value as ReinforcingPolarity)}>
                <option value="positive">Positive (reinforcing growth)</option>
                <option value="negative">Negative (self-dampening)</option>
              </select>
            </label>

            <label className="lab-field text-sm">
              Growth limit (optional)
              <input
                className="lab-input mt-1"
                type="text"
                inputMode="decimal"
                value={growthLimitInput}
                onChange={(e) => setGrowthLimitInput(e.target.value)}
                placeholder="Leave empty for unlimited growth"
              />
            </label>

            <label className="lab-field text-sm">
              Multiplier label
              <input
                className="lab-input mt-1"
                type="text"
                value={multiplierLabel}
                onChange={(e) => setMultiplierLabel(e.target.value)}
                placeholder="Multiplier"
              />
            </label>

            <div className="lab-loop-toggle">
              <label className="lab-loop-toggle">
                <input
                  type="checkbox"
                  checked={reinforcingDelayEnabled}
                  onChange={(e) => setReinforcingDelayEnabled(e.target.checked)}
                />
                <span>Enable delay</span>
              </label>
              {reinforcingDelayEnabled ? (
                <label className="lab-field text-sm w-full">
                  Delay (steps)
                  <input
                    className="lab-input mt-1"
                    type="text"
                    inputMode="numeric"
                    value={reinforcingDelayStepsInput}
                    onChange={(e) => setReinforcingDelayStepsInput(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </label>
              ) : null}
            </div>

            <div className="lab-loop-toggle">
              <label className="lab-loop-toggle">
                <input
                  type="checkbox"
                  checked={clampNonNegative}
                  onChange={(e) => setClampNonNegative(e.target.checked)}
                />
                <span>Clamp flow to &gt;= 0</span>
              </label>
            </div>

            {error ? <div className="lab-error text-xs">{error}</div> : null}

            <div className="lab-loop-actions">
              <button className="lab-btn lab-btn-primary" type="submit" disabled={!hasConnectedFlow}>
                {mode === "edit" ? "Save Changes" : "Create Reinforcing Loop"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
