import type { Edge, Node } from "reactflow";

import { SimulationChart } from "../../../components/SimulationChart";
import type { FeedbackLoop } from "../../../store/labStore";
import type { RunStep } from "../../../types/api";

type ChartModalProps = {
  isOpen: boolean;
  steps: RunStep[];
  focusIndex: number;
  isLightTheme: boolean;
  nodes: Node[];
  edges: Edge[];
  feedbackLoops: FeedbackLoop[];
  focusedNodeIds: string[];
  onClose: () => void;
  onFocusIndexChange: (value: number) => void;
};

export function ChartModal({
  isOpen,
  steps,
  focusIndex,
  isLightTheme,
  nodes,
  edges,
  feedbackLoops,
  focusedNodeIds,
  onClose,
  onFocusIndexChange,
}: ChartModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="lab-modal-overlay" data-tutorial="chart-modal" onClick={onClose}>
      <div className="lab-chart-modal" onClick={(event) => event.stopPropagation()}>
        <div className="lab-chart-modal-head">
          <h3 className="lab-panel-title">Simulation chart</h3>
          <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <SimulationChart
          steps={steps}
          focusIndex={focusIndex}
          chartHeight="68vh"
          isLightTheme={isLightTheme}
          nodes={nodes}
          edges={edges}
          feedbackLoops={feedbackLoops}
          focusedNodeIds={focusedNodeIds}
          enableZoom
          showTimeline
          onFocusIndexChange={onFocusIndexChange}
        />
      </div>
    </div>
  );
}
