import { Handle, NodeProps, Position } from "reactflow";

export function VariableNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Variable");
  const value = Number(data?.quantity ?? 0);
  const valueDisplay = String(data?.displayQuantity ?? (Number.isFinite(value) ? value : 0));
  const unit = String(data?.unit ?? "").trim();
  const isDiscrepancy = String(data?.loopRole ?? "") === "discrepancy";
  const isBalancingDiscrepancy = isDiscrepancy && String(data?.balancingLoopType ?? "") === "B";
  const badgeOffsetXRaw = Number(data?.balancingBadgeOffsetX ?? 0);
  const badgeOffsetYRaw = Number(data?.balancingBadgeOffsetY ?? 0);
  const badgeOffsetX = Number.isFinite(badgeOffsetXRaw) ? badgeOffsetXRaw : 0;
  const badgeOffsetY = Number.isFinite(badgeOffsetYRaw) ? badgeOffsetYRaw : 0;
  const discrepancyClass =
    isDiscrepancy && value > 0
      ? "lab-variable-discrepancy-positive"
      : isDiscrepancy && value < 0
        ? "lab-variable-discrepancy-negative"
        : isDiscrepancy
          ? "lab-variable-discrepancy-neutral"
          : "";

  return (
    <div className={`lab-line-node lab-variable-node ${discrepancyClass}`.trim()}>
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-left" type="source" position={Position.Left} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
      {isBalancingDiscrepancy ? (
        <span
          className="lab-discrepancy-badge"
          style={{
            left: `calc(50% + ${badgeOffsetX}px)`,
            top: `calc(50% + ${badgeOffsetY}px)`,
          }}
        >
          <strong>(B)</strong>
        </span>
      ) : null}
      <span className="lab-line-node-label">{label}</span>
      <span className="lab-line-node-value">
        {valueDisplay}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
