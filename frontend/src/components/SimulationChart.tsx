import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type ChartTooltipProps = TooltipProps<ValueType, NameType>;
import { Node } from "reactflow";
import { RunStep } from "../types/api";
import { FeedbackLoop } from "../store/labStore";
import { getChartColorPalette, useUiPreferencesStore } from "../store/uiPreferencesStore";

type Props = {
  steps: RunStep[];
  focusIndex: number;
  chartHeight?: number | string;
  isLightTheme?: boolean;
  nodes?: Node[];
  feedbackLoops?: FeedbackLoop[];
  selectedNodeId?: string | null;
};

export function SimulationChart({
  steps,
  focusIndex,
  chartHeight = 224,
  isLightTheme = false,
  nodes = [],
  feedbackLoops = [],
  selectedNodeId = null,
}: Props): JSX.Element {
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  useEffect(() => {
    setFocusedKey(null);
  }, [steps]);

  const contrastText = isLightTheme ? "#0f172a" : "#f8fafc";
  const contrastPanel = isLightTheme ? "#ffffff" : "#020617";
  const contrastBorder = isLightTheme ? "#334155" : "#94a3b8";

  if (steps.length === 0) {
    return <div style={{ color: highContrastMode ? contrastText : isLightTheme ? "#000000" : "#a3a3a3" }}>No simulation results yet.</div>;
  }

  const nodeIdToLabel = new Map<string, string>();
  for (const node of nodes) {
    nodeIdToLabel.set(node.id, String(node.data?.label ?? node.id));
  }

  // IDs to hide from general chart
  const hiddenIds = new Set<string>();
  for (const loop of feedbackLoops) {
    if (loop.type === "balancing") {
      hiddenIds.add(loop.goalNodeId);
      hiddenIds.add(loop.discrepancyNodeId);
      hiddenIds.add(loop.correctiveNodeId);
    } else {
      hiddenIds.add(loop.multiplierNodeId);
      if (loop.growthLimitNodeId) hiddenIds.add(loop.growthLimitNodeId);
    }
  }
  for (const node of nodes) {
    if (
      node.data?.reinforcingMarker === true ||
      node.data?.reinforcingCollapsed === true ||
      node.data?.reinforcingTextOnly === true ||
      (node.data?.loopRole != null && node.data?.loopRole !== "")
    ) {
      hiddenIds.add(node.id);
    }
  }

  const allKeys = Object.keys(steps[0].values).filter((k) => !k.startsWith("_"));

  let displayKeys: string[];
  if (selectedNodeId && allKeys.includes(selectedNodeId)) {
    displayKeys = [selectedNodeId];
  } else {
    displayKeys = allKeys.filter((k) => !hiddenIds.has(k));
  }

  const chartData = steps.map((step) => ({ time: step.time, ...step.values }));
  const focus = steps[Math.min(focusIndex, steps.length - 1)];

  const axisColor = highContrastMode ? contrastText : isLightTheme ? "#111111" : "#d4d4d4";
  const tooltipBg = highContrastMode ? contrastPanel : isLightTheme ? "#ffffff" : "#111111";
  const tooltipBorder = highContrastMode ? contrastBorder : isLightTheme ? "#d1d5db" : "#2b2b2b";
  const tooltipTextColor = highContrastMode ? contrastText : isLightTheme ? "#111111" : "#f5f5f5";
  const mutedText = isLightTheme ? "#6b7280" : "#a3a3a3";
  const chartPalette = getChartColorPalette(colorblindMode, highContrastMode);

  const keyColorMap = new Map<string, string>();
  displayKeys.forEach((key, i) => keyColorMap.set(key, chartPalette[i % chartPalette.length]));

  const focusedLabel = focusedKey ? (nodeIdToLabel.get(focusedKey) ?? focusedKey) : null;
  const focusedValue = focusedKey != null ? focus.values[focusedKey] : null;

  const customTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;
    const items = focusedKey ? payload.filter((p) => p.dataKey === focusedKey) : payload;
    if (items.length === 0) return null;
    return (
      <div style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, padding: "8px 10px", borderRadius: 4, fontSize: 11 }}>
        <div style={{ color: mutedText, marginBottom: 6, fontWeight: 600 }}>
          t = {typeof label === "number" ? label.toFixed(3) : label}
        </div>
        {items.map((entry) => (
          <div key={entry.dataKey} style={{ color: entry.color, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ color: tooltipTextColor }}>{nodeIdToLabel.get(String(entry.dataKey ?? "")) ?? entry.name ?? String(entry.dataKey ?? "")}</span>
            <span style={{ color: tooltipTextColor, marginLeft: "auto", paddingLeft: 12, fontVariantNumeric: "tabular-nums" }}>
              {typeof entry.value === "number" ? entry.value.toFixed(3) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Step info row */}
      <div className="text-xs" style={{ color: mutedText, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Step: {focus.step_index} &nbsp; t = {focus.time.toFixed(3)}</span>
        {focusedKey !== null && focusedLabel !== null && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: keyColorMap.get(focusedKey), fontWeight: 600 }}>
              {focusedLabel}:{" "}
              {focusedValue != null && Number.isFinite(Number(focusedValue))
                ? Number(focusedValue).toFixed(3)
                : "—"}
            </span>
            <button
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6, padding: 0, fontSize: "inherit" }}
              onClick={() => setFocusedKey(null)}
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="lab-chart-viewport w-full rounded border border-slate-200 bg-white p-2" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="time" stroke={axisColor} fontSize={11} tick={{ fill: axisColor }} />
            <YAxis stroke={axisColor} fontSize={11} tick={{ fill: axisColor }} />
            <Tooltip content={customTooltip} />
            {displayKeys.map((key) => {
              const isFaded = focusedKey !== null && focusedKey !== key;
              const color = keyColorMap.get(key)!;
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={nodeIdToLabel.get(key) ?? key}
                  stroke={isFaded ? (isLightTheme ? "#cccccc" : "#333333") : color}
                  dot={false}
                  strokeWidth={isFaded ? 1 : 2}
                  strokeOpacity={isFaded ? 0.3 : 1}
                  onClick={() => setFocusedKey(focusedKey === key ? null : key)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {displayKeys.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          {displayKeys.map((key) => {
            const label = nodeIdToLabel.get(key) ?? key;
            const color = keyColorMap.get(key)!;
            const isActive = focusedKey === null || focusedKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFocusedKey(focusedKey === key ? null : key)}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "2px 0", opacity: isActive ? 1 : 0.35 }}
              >
                <span style={{ width: 16, height: 3, background: color, display: "inline-block", borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: isLightTheme ? "#111111" : "#d4d4d4", whiteSpace: "nowrap" }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
