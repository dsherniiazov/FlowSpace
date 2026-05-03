type AddNodeControlsProps = {
  lockEditing: boolean;
  onAddStock: () => void;
  onAddFlow: () => void;
  onAddConstant: () => void;
  onAddVariable: () => void;
};

export function AddNodeControls({
  lockEditing,
  onAddStock,
  onAddFlow,
  onAddConstant,
  onAddVariable,
}: AddNodeControlsProps): JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button className="lab-btn lab-btn-secondary flex-1" onClick={onAddStock} disabled={lockEditing} data-tutorial="add-stock">
          + Stock
        </button>
        <button className="lab-btn lab-btn-secondary flex-1" onClick={onAddFlow} disabled={lockEditing} data-tutorial="add-flow">
          + Flow
        </button>
        <button className="lab-btn lab-btn-secondary flex-1" onClick={onAddConstant} disabled={lockEditing}>
          + Constant
        </button>
        <button className="lab-btn lab-btn-secondary flex-1" onClick={onAddVariable} disabled={lockEditing}>
          + Variable
        </button>
      </div>
      <div className="text-xs lab-muted">
        {lockEditing
          ? "Editing is locked while animation is running."
          : "Select a node or edge. Stock -> Flow = outflow (-, red). Flow -> Stock = inflow (+, green)."}
      </div>
    </>
  );
}
