import { Handle, NodeProps, Position } from "reactflow";

export function FlowNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Flow");
  const bottleneck = Number(data?.bottleneck ?? data?.quantity ?? 0);
  const bottleneckDisplay = String(data?.displayBottleneck ?? (Number.isFinite(bottleneck) ? bottleneck : 0));
  const unit = String(data?.unit ?? "").trim();

  return (
    <div className="lab-flow-node">
      <Handle id="target-left" type="target" position={Position.Left} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="source-left" type="source" position={Position.Left} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="target-right" type="target" position={Position.Right} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="source-right" type="source" position={Position.Right} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="target-top" type="target" position={Position.Top} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="source-top" type="source" position={Position.Top} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={{ background: "#3b82f6", borderColor: "#3b82f6" }} />
      <div className="lab-node-content">
        <span className="lab-flow-node-title">{label}</span>
        <span className="lab-node-meta">
          BN: {bottleneckDisplay}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}
