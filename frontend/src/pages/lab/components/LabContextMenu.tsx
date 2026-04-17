type ContextMenuPosition = { screenX: number; screenY: number };

type Props = {
  position: ContextMenuPosition | null;
  onAdd: (type: "stock" | "flow" | "commentNode") => void;
  onDismiss: () => void;
};

export function LabContextMenu({ position, onAdd, onDismiss }: Props): JSX.Element | null {
  if (!position) return null;
  return (
    <div
      className="lab-context-menu"
      style={{ left: position.screenX, top: position.screenY }}
      onMouseLeave={onDismiss}
    >
      <button className="lab-context-item" onClick={() => onAdd("stock")}>+ Stock</button>
      <button className="lab-context-item" onClick={() => onAdd("flow")}>+ Flow</button>
      <button className="lab-context-item" onClick={() => onAdd("commentNode")} data-tutorial="ctx-comment">
        + Comment
      </button>
    </div>
  );
}
