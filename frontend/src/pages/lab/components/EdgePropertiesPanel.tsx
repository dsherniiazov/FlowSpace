import type { Edge } from "reactflow";

import type { ControlOp } from "../../../store/labStore";
import { CONTROL_OPS } from "../types";

type EdgePropertiesPanelProps = {
  selectedEdge: Edge | null;
  selectedEdgeIsControl: boolean;
  selectedEdgeOp: ControlOp;
  lockEditing: boolean;
  onUpdateEdge: (patch: Record<string, unknown>) => void;
};

export function EdgePropertiesPanel({
  selectedEdge,
  selectedEdgeIsControl,
  selectedEdgeOp,
  lockEditing,
  onUpdateEdge,
}: EdgePropertiesPanelProps): JSX.Element | null {
  if (!selectedEdge || !selectedEdgeIsControl) return null;

  return (
    <div className="lab-divider pt-3 space-y-2">
      <div className="text-sm lab-field">Edge: {selectedEdge.id}</div>
      <label className="block text-xs lab-field">
        Operation on target
        <select
          className="lab-input mt-1"
          disabled={lockEditing}
          value={selectedEdgeOp}
          onChange={(event) => onUpdateEdge({ op: event.target.value })}
        >
          {CONTROL_OPS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label} ({op.value})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
