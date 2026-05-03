import type { Node } from "reactflow";

import type { FeedbackLoop } from "../../../store/labStore";

type FeedbackLoopDetailsProps = {
  loop: FeedbackLoop;
  roleLabel: string | null;
  nodesById: Map<string, Node>;
  lockEditing: boolean;
  onEdit: (loopId: string) => void;
  onDelete: (loopId: string) => void;
};

export function FeedbackLoopDetails({
  loop,
  roleLabel,
  nodesById,
  lockEditing,
  onEdit,
  onDelete,
}: FeedbackLoopDetailsProps): JSX.Element {
  return (
    <div className="space-y-2 lab-loop-aux-card" data-tutorial="feedback-loop-card">
      <div className="lab-loop-aux-head">
        <span className={`lab-loop-aux-type-pill lab-loop-aux-type-pill--${loop.type}`}>
          {loop.type === "balancing" ? "Balancing" : "Reinforcing"} feedback loop
        </span>
        {roleLabel ? <span className="lab-loop-aux-role-pill">{roleLabel}</span> : null}
      </div>
      <div className="text-sm lab-field">
        <div className="lab-loop-aux-name">
          {(loop.name ?? "").trim() || <span className="lab-muted">Unnamed loop</span>}
        </div>
      </div>
      <div className="text-xs lab-muted space-y-0.5">
        <div>Stock: {String(nodesById.get(loop.stockId)?.data?.label ?? loop.stockId)}</div>
        <div>
          Controlled flow: {String(nodesById.get(loop.controlledFlowId)?.data?.label ?? loop.controlledFlowId)}
        </div>
        {loop.type === "balancing" ? (
          <div>
            Goal: {loop.goalValue} ({loop.boundaryType} bound, {loop.operation}) | t={loop.adjustmentTime}
          </div>
        ) : (
          <div>
            k={loop.k} | {loop.polarity}
            {loop.growthLimitNodeId ? " | growth limit" : ""}
          </div>
        )}
        {loop.delayEnabled ? <div>Delay: {loop.delaySteps} step(s)</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="lab-btn lab-btn-primary" type="button" disabled={lockEditing} onClick={() => onEdit(loop.id)}>
          Edit feedback loop
        </button>
        <button className="lab-btn lab-btn-secondary" type="button" disabled={lockEditing} onClick={() => onDelete(loop.id)}>
          Delete loop
        </button>
      </div>
      <div className="text-xs lab-muted">
        This node is part of a feedback loop. Edit the loop to change its name or parameters. Individual node fields are managed by the loop definition.
      </div>
    </div>
  );
}
