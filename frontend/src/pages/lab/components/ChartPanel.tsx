import type { Edge, Node } from "reactflow";

import { SimulationChart } from "../../../components/SimulationChart";
import type { FeedbackLoop } from "../../../store/labStore";
import type { RunStep } from "../../../types/api";
import { HelpTip } from "../HelpTip";

type ChartPanelProps = {
  steps: RunStep[];
  focusIndex: number;
  isLightTheme: boolean;
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  focusedNodeIds: string[];
  onExpand: () => void;
  onFocusIndexChange: (value: number) => void;
};

export function ChartPanel({
  steps,
  focusIndex,
  isLightTheme,
  nodes,
  edges,
  feedbackLoops,
  focusedNodeIds,
  onExpand,
  onFocusIndexChange,
}: ChartPanelProps): JSX.Element {
  return (
    <div className="lab-divider pt-3" data-tutorial="chart">
      <div className="lab-chart-head">
        <span className="text-sm lab-field lab-label-row">
          <span>Simulation chart</span>
          <HelpTip text={"Shows all variables over time.\n\nClick a line or legend item to focus it \u2014 others will fade out.\nClick again to deselect.\nSelect one or more nodes (Shift+drag, or Ctrl/\u2318+click) to show only those series on the chart."} />
        </span>
        <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={onExpand} data-tutorial="chart-expand">
          Expand
        </button>
      </div>
      <SimulationChart
        steps={steps}
        focusIndex={focusIndex}
        chartHeight={220}
        isLightTheme={isLightTheme}
        nodes={nodes}
        edges={edges}
        feedbackLoops={feedbackLoops}
        focusedNodeIds={focusedNodeIds}
        onFocusIndexChange={onFocusIndexChange}
      />
    </div>
  );
}
