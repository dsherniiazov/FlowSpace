import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Edge, Node } from "reactflow";

import { RunStep } from "../types/api";
import { FeedbackLoop } from "../store/labStore";
import { getChartColorPalette, useUiPreferencesStore } from "../store/uiPreferencesStore";
import { buildUniquePalette } from "./simulationChart/palette";
import { useChartZoom } from "./simulationChart/useChartZoom";
import { useSeriesMetadata } from "./simulationChart/useSeriesMetadata";

type ChartTooltipProps = TooltipProps<ValueType, NameType>;

type Props = {
  steps: RunStep[];
  focusIndex: number;
  chartHeight?: number | string;
  isLightTheme?: boolean;
  nodes?: Node[];
  edges?: Edge[];
  feedbackLoops?: FeedbackLoop[];
  selectedNodeId?: string | null;
  enableZoom?: boolean;
  showTimeline?: boolean;
  onFocusIndexChange?: (index: number) => void;
};

export function SimulationChart({
  steps,
  focusIndex,
  chartHeight = 224,
  isLightTheme = false,
  nodes = [],
  edges = [],
  feedbackLoops = [],
  selectedNodeId = null,
  enableZoom = false,
  showTimeline = false,
  onFocusIndexChange,
}: Props): JSX.Element {
  const colorblindMode = useUiPreferencesStore((state) => state.colorblindMode);
  const highContrastMode = useUiPreferencesStore((state) => state.highContrastMode);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  useEffect(() => setFocusedKey(null), [steps]);

  const zoom = useChartZoom(enableZoom, steps);
  const { nodeIdToLabel, displayKeys } = useSeriesMetadata({
    steps,
    nodes,
    edges,
    feedbackLoops,
    selectedNodeId,
  });

  const contrastText = isLightTheme ? "#0f172a" : "#f8fafc";
  const contrastPanel = isLightTheme ? "#ffffff" : "#020617";
  const contrastBorder = isLightTheme ? "#334155" : "#94a3b8";
  const mutedText = isLightTheme ? "#6b7280" : "#a3a3a3";
  const axisColor = highContrastMode ? contrastText : isLightTheme ? "#111111" : "#d4d4d4";
  const tooltipBg = highContrastMode ? contrastPanel : isLightTheme ? "#ffffff" : "#111111";
  const tooltipBorder = highContrastMode ? contrastBorder : isLightTheme ? "#d1d5db" : "#2b2b2b";
  const tooltipTextColor = highContrastMode ? contrastText : isLightTheme ? "#111111" : "#f5f5f5";
  const refLineColor = highContrastMode ? contrastText : isLightTheme ? "#0f172a" : "#f5f5f5";

  const basePalette = getChartColorPalette(colorblindMode, highContrastMode);
  const chartPalette = useMemo(
    () => buildUniquePalette(basePalette, displayKeys.length, isLightTheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basePalette.join("|"), displayKeys.length, isLightTheme],
  );
  const keyColorMap = useMemo(() => {
    const map = new Map<string, string>();
    displayKeys.forEach((key, i) => map.set(key, chartPalette[i % chartPalette.length]));
    return map;
  }, [displayKeys, chartPalette]);

  const hasSteps = steps.length > 0;
  const chartData = useMemo(
    () => (hasSteps ? steps.map((step) => ({ time: step.time, ...step.values })) : []),
    [hasSteps, steps],
  );
  const clampedFocusIndex = hasSteps ? Math.min(focusIndex, steps.length - 1) : 0;
  const focus = hasSteps ? steps[clampedFocusIndex] : null;
  const focusTime = focus?.time ?? 0;
  const focusedLabel = focusedKey ? (nodeIdToLabel.get(focusedKey) ?? focusedKey) : null;
  const focusedValue = focusedKey != null && focus ? focus.values[focusedKey] : null;

  const xDomain: [number | string, number | string] = zoom.zoomDomain
    ? [zoom.zoomDomain[0], zoom.zoomDomain[1]]
    : ["dataMin", "dataMax"];
  const focusLineInView =
    !zoom.zoomDomain || (focusTime >= zoom.zoomDomain[0] && focusTime <= zoom.zoomDomain[1]);

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
            <span style={{ color: tooltipTextColor }}>
              {nodeIdToLabel.get(String(entry.dataKey ?? "")) ?? entry.name ?? String(entry.dataKey ?? "")}
            </span>
            <span style={{ color: tooltipTextColor, marginLeft: "auto", paddingLeft: 12, fontVariantNumeric: "tabular-nums" }}>
              {typeof entry.value === "number" ? entry.value.toFixed(3) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!hasSteps || !focus) {
    return (
      <div style={{ color: highContrastMode ? contrastText : isLightTheme ? "#000000" : "#a3a3a3" }}>
        No simulation results yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
        {enableZoom && (
          <>
            <span style={{ marginLeft: "auto", opacity: zoom.zoomDomain ? 0.9 : 0.6 }}>
              {zoom.zoomDomain
                ? `Zoomed: t ∈ [${zoom.zoomDomain[0].toFixed(3)}, ${zoom.zoomDomain[1].toFixed(3)}]`
                : "Tip: drag on the chart to zoom in on an interval"}
            </span>
            {zoom.zoomDomain ? (
              <button
                type="button"
                className="lab-btn lab-btn-secondary lab-btn-compact"
                onClick={zoom.resetZoom}
                style={{ marginLeft: 8 }}
              >
                Reset zoom
              </button>
            ) : null}
          </>
        )}
      </div>

      <div
        className={`lab-chart-viewport w-full rounded border border-slate-200 bg-white p-2 ${enableZoom ? "is-zoomable" : ""}`}
        style={{ height: chartHeight }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            onMouseDown={zoom.handleChartMouseDown}
            onMouseMove={zoom.handleChartMouseMove}
            onMouseUp={zoom.handleChartMouseUp}
            onMouseLeave={zoom.handleChartMouseLeave}
          >
            <XAxis
              dataKey="time"
              type="number"
              domain={xDomain}
              allowDataOverflow
              stroke={axisColor}
              fontSize={11}
              tick={{ fill: axisColor }}
              tickFormatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))}
            />
            <YAxis stroke={axisColor} fontSize={11} tick={{ fill: axisColor }} />
            <Tooltip content={customTooltip} />

            {focusLineInView && (
              <ReferenceLine
                x={focusTime}
                stroke={refLineColor}
                strokeDasharray="4 3"
                strokeOpacity={0.55}
                ifOverflow="hidden"
                label={{
                  value: `t=${focusTime.toFixed(2)}`,
                  position: "top",
                  fill: refLineColor,
                  fontSize: 10,
                  opacity: 0.8,
                }}
              />
            )}

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
                  isAnimationActive={false}
                />
              );
            })}

            {focusLineInView &&
              displayKeys.map((key) => {
                const numeric = Number(focus.values[key]);
                if (!Number.isFinite(numeric)) return null;
                if (focusedKey !== null && focusedKey !== key) return null;
                return (
                  <ReferenceDot
                    key={`focus-dot-${key}`}
                    x={focusTime}
                    y={numeric}
                    r={3.5}
                    fill={keyColorMap.get(key)!}
                    stroke={isLightTheme ? "#ffffff" : "#0b0b0b"}
                    strokeWidth={1.2}
                    ifOverflow="hidden"
                    isFront
                  />
                );
              })}

            {enableZoom && zoom.dragFrom != null && zoom.dragTo != null && zoom.dragFrom !== zoom.dragTo && (
              <ReferenceArea
                x1={Math.min(zoom.dragFrom, zoom.dragTo)}
                x2={Math.max(zoom.dragFrom, zoom.dragTo)}
                strokeOpacity={0.3}
                fill={refLineColor}
                fillOpacity={0.08}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showTimeline && steps.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: mutedText, fontSize: 11, minWidth: 80 }}>
            Step {focus.step_index} / {steps[steps.length - 1].step_index}
          </span>
          <input
            className="lab-range"
            type="range"
            min={0}
            max={Math.max(0, steps.length - 1)}
            value={clampedFocusIndex}
            onChange={(e) => onFocusIndexChange?.(Number(e.target.value))}
            style={{ flex: 1 }}
            aria-label="Simulation timeline (expanded chart)"
          />
          <span style={{ color: mutedText, fontSize: 11, minWidth: 90, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            t = {focus.time.toFixed(3)}
          </span>
        </div>
      )}

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
