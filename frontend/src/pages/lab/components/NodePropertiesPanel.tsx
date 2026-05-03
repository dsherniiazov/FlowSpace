import type { Node } from "reactflow";

import type { ControlOp } from "../../../store/labStore";
import { getLabColorTokens, resolveStockColor, type ColorblindMode } from "../../../store/uiPreferencesStore";
import { CONTROL_OPS } from "../types";
import { isFlowNode } from "../utils";

type NodePropertiesPanelProps = {
  selectedNode: Node;
  selectedNodeNumericInput: string;
  selectedNodeIsControlSource: boolean;
  selectedNodeOp: ControlOp;
  isSelectedStock: boolean;
  stockColorPresets: string[];
  colorblindMode: ColorblindMode;
  labColorTokens: ReturnType<typeof getLabColorTokens>;
  lockEditing: boolean;
  onNumericInputChange: (value: string) => void;
  onCommitNumericInput: () => void;
  onUpdateNode: (patch: Record<string, unknown>) => void;
  onSetControlOp: (op: ControlOp) => void;
  onCopyNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onCreateFeedbackLoop: (nodeId: string) => void;
};

export function NodePropertiesPanel({
  selectedNode,
  selectedNodeNumericInput,
  selectedNodeIsControlSource,
  selectedNodeOp,
  isSelectedStock,
  stockColorPresets,
  colorblindMode,
  labColorTokens,
  lockEditing,
  onNumericInputChange,
  onCommitNumericInput,
  onUpdateNode,
  onSetControlOp,
  onCopyNode,
  onDeleteNode,
  onCreateFeedbackLoop,
}: NodePropertiesPanelProps): JSX.Element {
  const numericLabel = isFlowNode(selectedNode) ? "Bottleneck" : "Quantity";
  const numericTutorial = isFlowNode(selectedNode) ? "node-bottleneck" : "node-quantity";
  const numericPlaceholder = isFlowNode(selectedNode) ? "Bottleneck" : "Quantity";
  const numericHelp = isFlowNode(selectedNode)
    ? "Defines how much a Flow transfers per time unit."
    : "Stores the current value for Stock, Constant, or Variable.";

  return (
    <div className="space-y-2">
      <label className="block text-xs lab-field" data-tutorial="node-name">
        Name
        <input
          className="lab-input mt-1"
          disabled={lockEditing}
          value={String(selectedNode.data?.label ?? "")}
          onChange={(event) => onUpdateNode({ label: event.target.value })}
          placeholder="Label"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="lab-btn lab-btn-secondary"
          type="button"
          data-tutorial="copy-node"
          onClick={() => onCopyNode(selectedNode.id)}
          disabled={lockEditing}
          title="Copy node (Ctrl/Cmd+C)"
        >
          Copy
        </button>
        <button
          className="lab-btn lab-btn-secondary"
          type="button"
          data-tutorial="delete-node"
          onClick={() => onDeleteNode(selectedNode.id)}
          disabled={lockEditing}
          title="Delete node"
        >
          Delete
        </button>
      </div>
      <label className="block text-xs lab-field" data-tutorial={numericTutorial}>
        <span className="lab-label-row">
          <span>{numericLabel}</span>
          <span className="lab-help-dot" title={numericHelp} aria-label={`${numericLabel} help`}>
            ?
          </span>
        </span>
        <input
          className="lab-input mt-1"
          disabled={lockEditing}
          type="text"
          inputMode="decimal"
          value={selectedNodeNumericInput}
          onChange={(event) => onNumericInputChange(event.target.value)}
          onBlur={onCommitNumericInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitNumericInput();
              event.currentTarget.blur();
            }
          }}
          placeholder={numericPlaceholder}
        />
      </label>
      <label className="block text-xs lab-field">
        <span className="lab-label-row">
          <span>Unit (optional)</span>
          <span className="lab-help-dot" title="Optional metadata, for example kg, items, or L." aria-label="Unit help">
            ?
          </span>
        </span>
        <input
          className="lab-input mt-1"
          disabled={lockEditing}
          type="text"
          value={String(selectedNode.data?.unit ?? "")}
          onChange={(event) => onUpdateNode({ unit: event.target.value })}
          placeholder="e.g. kg, items, L"
        />
      </label>

      {selectedNodeIsControlSource ? (
        <ControlOperationPicker
          value={selectedNodeOp}
          disabled={lockEditing}
          colors={labColorTokens.control}
          onChange={onSetControlOp}
        />
      ) : null}

      {isSelectedStock ? (
        <div className="space-y-2">
          <button
            className="lab-btn lab-btn-secondary w-full"
            type="button"
            onClick={() => onCreateFeedbackLoop(selectedNode.id)}
            disabled={lockEditing}
          >
            Create Feedback Loop
          </button>
          <div className="text-xs lab-field">Stock color</div>
          <div className="lab-stock-palette" data-tutorial="stock-color">
            {stockColorPresets.map((color) => (
              <button
                key={color}
                type="button"
                className="lab-stock-color-btn"
                style={{ backgroundColor: color }}
                onClick={() => onUpdateNode({ color })}
                aria-label={`Select stock color ${color}`}
                title={color}
              />
            ))}
            <input
              className="lab-stock-color-picker"
              type="color"
              value={resolveStockColor(String(selectedNode.data?.color ?? stockColorPresets[0]), colorblindMode)}
              onChange={(event) => onUpdateNode({ color: event.target.value })}
              aria-label="Pick stock color"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ControlOperationPicker({
  value,
  disabled,
  colors,
  onChange,
}: {
  value: ControlOp;
  disabled: boolean;
  colors: Record<ControlOp, string>;
  onChange: (op: ControlOp) => void;
}): JSX.Element {
  return (
    <div className="space-y-1" data-tutorial="node-op">
      <span className="lab-label-row text-xs lab-field">
        <span>Operation</span>
        <span
          className="lab-help-dot"
          title="Defines how this constant or variable influences connected flows or variables. The symbol and color appear on every outgoing arrow."
          aria-label="Operation help"
        >
          ?
        </span>
      </span>
      <div className="lab-op-picker" role="group" aria-label="Control operation">
        {CONTROL_OPS.map((op) => {
          const opColor = colors[op.value];
          const isActive = value === op.value;
          return (
            <button
              key={op.value}
              type="button"
              className={`lab-op-btn ${isActive ? "is-active" : ""}`}
              disabled={disabled}
              onClick={() => onChange(op.value)}
              aria-pressed={isActive}
              title={`${op.label}  (${op.value})`}
              style={
                isActive
                  ? { color: "#ffffff", background: opColor, borderColor: opColor }
                  : { color: opColor, borderColor: opColor }
              }
            >
              <span className="lab-op-btn-symbol">{op.label}</span>
              <span className="lab-op-btn-name">{op.value}</span>
            </button>
          );
        })}
      </div>
      <p className="lab-op-hint text-xs lab-muted">Each outgoing control arrow uses this operation&apos;s color and symbol.</p>
    </div>
  );
}
