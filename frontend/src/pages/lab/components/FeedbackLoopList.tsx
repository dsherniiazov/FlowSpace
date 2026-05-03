import type { FeedbackLoop } from "../../../store/labStore";
import { HelpTip } from "../HelpTip";

export type FeedbackLoopListItem = FeedbackLoop & {
  stockLabel: string;
  flowLabel: string;
  loopLabel: string;
};

type FeedbackLoopListProps = {
  loops: FeedbackLoopListItem[];
  lockEditing: boolean;
  onEdit: (loopId: string) => void;
  onDelete: (loopId: string) => void;
};

export function FeedbackLoopList({
  loops,
  lockEditing,
  onEdit,
  onDelete,
}: FeedbackLoopListProps): JSX.Element {
  return (
    <div className="lab-divider pt-3 space-y-2">
      <div className="text-sm lab-field lab-label-row">
        <span>Feedback loops</span>
        <HelpTip text={"Feedback loops create automatic control mechanisms.\n\nBalancing (B): pushes the system toward a goal value.\nReinforcing (R): amplifies change over time \u2014 growth or collapse."} />
      </div>
      {loops.length === 0 ? (
        <div className="text-xs lab-muted">No feedback loops yet.</div>
      ) : (
        <div className="lab-loop-list">
          {loops.map((loop) => (
            <FeedbackLoopRow
              key={loop.id}
              loop={loop}
              lockEditing={lockEditing}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackLoopRow({
  loop,
  lockEditing,
  onEdit,
  onDelete,
}: {
  loop: FeedbackLoopListItem;
  lockEditing: boolean;
  onEdit: (loopId: string) => void;
  onDelete: (loopId: string) => void;
}): JSX.Element {
  const details =
    loop.type === "balancing"
      ? `${loop.stockLabel} -> ${loop.flowLabel} (${loop.operation}) | t=${loop.adjustmentTime}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}`
      : `${loop.stockLabel} -> ${loop.flowLabel} (${loop.polarity}) | k=${loop.k}${loop.delayEnabled ? ` | delay=${loop.delaySteps}` : ""}${loop.growthLimitNodeId ? " | growth limit" : ""}${loop.clampNonNegative ? " | clamp>=0" : ""}`;

  return (
    <div className="lab-loop-item">
      <div className="lab-loop-item-meta">
        <div className="lab-loop-item-title">{loop.loopLabel}</div>
        <div className="lab-loop-item-sub">{details}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="lab-btn lab-btn-secondary lab-btn-compact"
          type="button"
          disabled={lockEditing}
          onClick={() => onEdit(loop.id)}
        >
          Edit
        </button>
        <button
          className="lab-btn lab-btn-secondary lab-btn-compact"
          type="button"
          disabled={lockEditing}
          onClick={() => onDelete(loop.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
