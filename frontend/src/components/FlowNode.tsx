import { Handle, NodeProps, Position } from "reactflow";

export function FlowNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="lab-flow-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="lab-flow-node-dot" />
      <span className="lab-flow-node-title">{String(data?.label ?? "Flow")}</span>
    </div>
  );
}
