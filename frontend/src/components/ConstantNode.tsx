import { type CSSProperties } from "react";
import { Handle, NodeProps, Position } from "reactflow";
import { labNodeTipProps } from "./labNodeTip";

export function ConstantNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Constant");
  const value = Number(data?.quantity ?? 0);
  const valueDisplay = String(data?.displayQuantity ?? (Number.isFinite(value) ? value : 0));
  const unit = String(data?.unit ?? "").trim();
  const color = String(data?.color ?? "").trim();
  const lineStyle = (color ? { borderColor: color, background: `color-mix(in srgb, ${color} 46%, #0a0a0a)` } : undefined) as
    | CSSProperties
    | undefined;
  const tipProps = labNodeTipProps(String(data?.studentTooltip ?? ""));

  return (
    <div
      className={`lab-line-node lab-constant-node ${tipProps.className}`.trim()}
      style={lineStyle}
      data-student-tip={tipProps["data-student-tip"]}
    >
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-left" type="source" position={Position.Left} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
      <span className="lab-line-node-label">{label}</span>
      <span className="lab-line-node-value">
        {valueDisplay}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
