import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RunStep } from "../types/api";

type Props = {
  steps: RunStep[];
  focusIndex: number;
  chartHeight?: number | string;
  isLightTheme?: boolean;
};

export function SimulationChart({ steps, focusIndex, chartHeight = 224, isLightTheme = false }: Props): JSX.Element {
  if (steps.length === 0) {
    return <div style={{ color: isLightTheme ? "#000000" : "#a3a3a3" }}>No simulation results yet.</div>;
  }

  const keys = Object.keys(steps[0].values).filter((key) => !key.startsWith("_"));
  const chartData = steps.map((step) => ({ time: step.time, ...step.values }));
  const focus = steps[Math.min(focusIndex, steps.length - 1)];
  const axisColor = isLightTheme ? "#000000" : "#d4d4d4";
  const tooltipBackground = isLightTheme ? "#ffffff" : "#0a0a0a";
  const tooltipBorder = isLightTheme ? "#d1d5db" : "#2b2b2b";
  const tooltipText = isLightTheme ? "#000000" : "#f5f5f5";

  return (
    <div className="space-y-2">
      <div className="text-xs" style={{ color: isLightTheme ? "#000000" : "#a3a3a3" }}>
        Step {focus.step_index} at t={focus.time.toFixed(3)}
      </div>
      <div className="lab-chart-viewport w-full rounded border border-slate-200 bg-white p-2" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="time" stroke={axisColor} fontSize={11} />
            <YAxis stroke={axisColor} fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: tooltipBackground, border: `1px solid ${tooltipBorder}`, color: tooltipText }}
              itemStyle={{ color: tooltipText }}
              labelStyle={{ color: tooltipText }}
            />
            {keys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={index % 2 === 0 ? "#18e0c2" : "#f97316"}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
