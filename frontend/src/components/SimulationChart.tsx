import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RunStep } from "../types/api";

type Props = {
  steps: RunStep[];
  focusIndex: number;
};

export function SimulationChart({ steps, focusIndex }: Props): JSX.Element {
  if (steps.length === 0) {
    return <div className="text-sm text-slate-500">No simulation results yet.</div>;
  }

  const keys = Object.keys(steps[0].values).filter((key) => !key.startsWith("_"));
  const chartData = steps.map((step) => ({ time: step.time, ...step.values }));
  const focus = steps[Math.min(focusIndex, steps.length - 1)];

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">Step {focus.step_index} at t={focus.time.toFixed(3)}</div>
      <div className="h-56 w-full rounded border border-slate-200 bg-white p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="time" stroke="#475569" fontSize={11} />
            <YAxis stroke="#475569" fontSize={11} />
            <Tooltip />
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
