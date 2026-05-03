import { HelpTip } from "../HelpTip";

type SimulationPanelProps = {
  stepsInput: string;
  dtInput: string;
  algorithm: "euler_v2" | "rk4_v2";
  isPlaying: boolean;
  sliderIndex: number;
  simulationStepCount: number;
  onStepsInputChange: (value: string) => void;
  onDtInputChange: (value: string) => void;
  onCommitSteps: () => void;
  onCommitDt: () => void;
  onAlgorithmChange: (value: "euler_v2" | "rk4_v2") => void;
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  onSliderIndexChange: (value: number) => void;
};

export function SimulationPanel({
  stepsInput,
  dtInput,
  algorithm,
  isPlaying,
  sliderIndex,
  simulationStepCount,
  onStepsInputChange,
  onDtInputChange,
  onCommitSteps,
  onCommitDt,
  onAlgorithmChange,
  onRunSimulation,
  onResetSimulation,
  onSliderIndexChange,
}: SimulationPanelProps): JSX.Element {
  const lastStepIndex = Math.max(0, simulationStepCount - 1);
  const currentStepIndex = Math.min(sliderIndex, lastStepIndex);

  return (
    <>
      <h3 className="lab-panel-title">Simulation</h3>
      <label className="block text-sm lab-field" data-tutorial="steps">
        <span className="lab-label-row">
          <span>Steps</span>
          <HelpTip text={"Number of simulation steps.\nMore steps = longer simulation timeline.\nTypical range: 100\u20132000."} />
        </span>
        <input
          className="lab-input mt-1"
          type="text"
          inputMode="numeric"
          value={stepsInput}
          onChange={(event) => onStepsInputChange(event.target.value)}
          onBlur={onCommitSteps}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitSteps();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <label className="block text-sm lab-field" data-tutorial="dt">
        <span className="lab-label-row">
          <span>dt</span>
          <HelpTip text={"Time step size between each simulation step.\nSmaller dt = higher accuracy but slower.\nTypical range: 0.01 \u2013 1.0."} />
        </span>
        <input
          className="lab-input mt-1"
          type="text"
          inputMode="decimal"
          value={dtInput}
          onChange={(event) => onDtInputChange(event.target.value)}
          onBlur={onCommitDt}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitDt();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <label className="block text-sm lab-field">
        <span className="lab-label-row">
          <span>Solver</span>
          <HelpTip text={"Euler: simpler method for less complex systems when precision is not critical.\n\nRK4: more advanced method with more computations per step and higher accuracy."} />
        </span>
        <select
          className="lab-input mt-1"
          value={algorithm}
          onChange={(event) => onAlgorithmChange(event.target.value as "euler_v2" | "rk4_v2")}
        >
          <option value="euler_v2">Euler</option>
          <option value="rk4_v2">RK4</option>
        </select>
      </label>
      <button className="lab-btn lab-btn-primary w-full" onClick={onRunSimulation} disabled={isPlaying} data-tutorial="run-simulation">
        {isPlaying ? "Running..." : "Run simulation"}
      </button>
      <button className="lab-btn lab-btn-secondary w-full" onClick={onResetSimulation}>
        Reset simulation
      </button>
      <div className="lab-divider pt-4" data-tutorial="timeline">
        <label className="mb-1 block text-sm lab-field">Timeline</label>
        <input
          className="lab-range w-full"
          type="range"
          min={0}
          max={lastStepIndex}
          value={currentStepIndex}
          onChange={(event) => onSliderIndexChange(Number(event.target.value))}
          disabled={simulationStepCount === 0}
        />
        <div className="mt-2 text-xs lab-muted">
          {simulationStepCount ? `Step ${currentStepIndex} / ${lastStepIndex}` : "Run simulation to enable slider"}
        </div>
      </div>
    </>
  );
}
