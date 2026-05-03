import { type CSSProperties } from "react";
import { Handle, NodeProps, Position } from "reactflow";
import { labNodeTipProps } from "./labNodeTip";

export function FlowNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Flow");
  const bottleneck = Number(data?.bottleneck ?? data?.quantity ?? 0);
  const bottleneckDisplay = String(data?.displayBottleneck ?? (Number.isFinite(bottleneck) ? bottleneck : 0));
  const unit = String(data?.unit ?? "").trim();
  const customAccent = String(data?.color ?? "").trim();
  const handleAccent = customAccent || "var(--lab-flow-accent)";
  const flowVarStyle: CSSProperties | undefined = customAccent
    ? ({ "--lab-flow-accent": customAccent } as CSSProperties)
    : undefined;
  const tipProps = labNodeTipProps(String(data?.studentTooltip ?? ""));

  return (
    <div
      className={`lab-flow-node ${tipProps.className}`.trim()}
      style={flowVarStyle}
      data-student-tip={tipProps["data-student-tip"]}
    >
      <Handle id="target-left" type="target" position={Position.Left} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="source-left" type="source" position={Position.Left} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="target-right" type="target" position={Position.Right} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="source-right" type="source" position={Position.Right} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="target-top" type="target" position={Position.Top} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="source-top" type="source" position={Position.Top} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} style={{ background: handleAccent, borderColor: handleAccent }} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={{ background: handleAccent, borderColor: handleAccent }} />
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
