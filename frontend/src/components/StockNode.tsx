import { type CSSProperties } from "react";
import { Handle, NodeProps, Position } from "reactflow";
import { labNodeTipProps } from "./labNodeTip";
import { resolveStockColor, useUiPreferencesStore } from "../store/uiPreferencesStore";

function formatQuantity(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return String(num);
}

export function StockNode({ data }: NodeProps): JSX.Element {
  const label = String(data?.label ?? "Stock");
  const quantity = String(data?.displayQuantity ?? formatQuantity(data?.quantity));
  const unit = String(data?.unit ?? "").trim();
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const color = resolveStockColor(String(data?.color ?? "#1e40af"), colorblindMode);
  const stockStyle = { borderColor: color, "--stock-color": color } as CSSProperties;
  const tip = String(data?.studentTooltip ?? "").trim();
  const tipProps = labNodeTipProps(tip);
  const visualTheme = String(data?.visualTheme ?? "").trim().toLowerCase();
  const fillCap = Number(data?.fillCap ?? 0);
  const qRaw = Number(data?.displayQuantity ?? data?.quantity ?? 0);
  const fillPct =
    fillCap > 0 && Number.isFinite(qRaw) ? Math.max(0, Math.min(1, qRaw / fillCap)) : 0;

  return (
    <div
      className={`${visualTheme ? `lab-stock-node lab-stock-node--themed lab-stock-node--${visualTheme}` : "lab-stock-node"} ${tipProps.className}`.trim()}
      style={stockStyle}
      data-student-tip={tipProps["data-student-tip"]}
    >
      {visualTheme ? (
        <div className="lab-stock-fill-track" aria-hidden>
          <div
            className={`lab-stock-fill lab-stock-fill--${visualTheme}`}
            style={{ height: `${fillPct * 100}%` }}
          />
        </div>
      ) : null}
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
