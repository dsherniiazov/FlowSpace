import { CSSProperties } from "react";
import { Handle, NodeProps, Position } from "reactflow";

function formatQuantity(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return String(num);
}

export function StockNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Stock");
  const quantity = String(data?.displayQuantity ?? formatQuantity(data?.quantity));
  const unit = String(data?.unit ?? "").trim();
  const color = String(data?.color ?? "#3b82f6");
  const stockStyle = { borderColor: color, "--stock-color": color } as CSSProperties;

  return (
    <div className="lab-stock-node" style={stockStyle}>
      <Handle id="target-left" type="target" position={Position.Left} style={{ background: color, borderColor: color }} />
      <Handle id="source-left" type="source" position={Position.Left} style={{ background: color, borderColor: color }} />
      <Handle id="target-right" type="target" position={Position.Right} style={{ background: color, borderColor: color }} />
      <Handle id="source-right" type="source" position={Position.Right} style={{ background: color, borderColor: color }} />
      <Handle id="target-top" type="target" position={Position.Top} style={{ background: color, borderColor: color }} />
      <Handle id="source-top" type="source" position={Position.Top} style={{ background: color, borderColor: color }} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} style={{ background: color, borderColor: color }} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={{ background: color, borderColor: color }} />
      <div className="lab-flow-node-dot" style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
      <div className="lab-node-content">
        <span className="lab-flow-node-title">{label}</span>
        <span className="lab-node-meta">
          {quantity}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}
