import type { LessonTask } from "../../../types/api";
import type { LabTaskContext } from "../types";
import { LessonTaskPanel } from "./LessonTaskPanel";
import { SimulationPanel } from "./SimulationPanel";

type LabLeftPanelProps = {
  lessonTaskContext: LabTaskContext | null;
  lessonTasksCount: number;
  currentLessonTaskIndex: number;
  previousLessonTask: LessonTask | null;
  nextLessonTask: LessonTask | null;
  isCurrentTaskCompleted: boolean;
  canResolveLessonNavigation: boolean;
  lessonTasksError: boolean;
  lessonExitError: string | null;
  completeTaskPending: boolean;
  isExitingLesson: boolean;
  stepsInput: string;
  dtInput: string;
  algorithm: "euler_v2" | "rk4_v2";
  isPlaying: boolean;
  sliderIndex: number;
  simulationStepCount: number;
  onOpenTask: (taskId: number) => void;
  onOpenFullTask: () => void;
  onMarkTaskCompleted: () => void;
  onTaskProgressNavigation: () => void;
  onExitLesson: () => void;
  onStepsInputChange: (value: string) => void;
  onDtInputChange: (value: string) => void;
  onCommitSteps: () => void;
  onCommitDt: () => void;
  onAlgorithmChange: (value: "euler_v2" | "rk4_v2") => void;
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  onSliderIndexChange: (value: number) => void;
};

export function LabLeftPanel({
  lessonTaskContext,
  lessonTasksCount,
  currentLessonTaskIndex,
  previousLessonTask,
  nextLessonTask,
  isCurrentTaskCompleted,
  canResolveLessonNavigation,
  lessonTasksError,
  lessonExitError,
  completeTaskPending,
  isExitingLesson,
  stepsInput,
  dtInput,
  algorithm,
  isPlaying,
  sliderIndex,
  simulationStepCount,
  onOpenTask,
  onOpenFullTask,
  onMarkTaskCompleted,
  onTaskProgressNavigation,
  onExitLesson,
  onStepsInputChange,
  onDtInputChange,
  onCommitSteps,
  onCommitDt,
  onAlgorithmChange,
  onRunSimulation,
  onResetSimulation,
  onSliderIndexChange,
}: LabLeftPanelProps): JSX.Element {
  return (
    <aside className="lab-glass-panel lab-side-panel lab-floating-panel lab-floating-panel-left space-y-4" data-tutorial="task-panel">
      <LessonTaskPanel
        context={lessonTaskContext}
        tasksCount={lessonTasksCount}
        currentTaskIndex={currentLessonTaskIndex}
        previousTask={previousLessonTask}
        nextTask={nextLessonTask}
        isCompleted={isCurrentTaskCompleted}
        isLoadingNavigation={!canResolveLessonNavigation}
        isTasksError={lessonTasksError}
        exitError={lessonExitError}
        isSavingCompletion={completeTaskPending}
        isExiting={isExitingLesson}
        onOpenTask={onOpenTask}
        onOpenFullTask={onOpenFullTask}
        onMarkCompleted={onMarkTaskCompleted}
        onContinue={onTaskProgressNavigation}
        onExit={onExitLesson}
      />
      <SimulationPanel
        stepsInput={stepsInput}
        dtInput={dtInput}
        algorithm={algorithm}
        isPlaying={isPlaying}
        sliderIndex={sliderIndex}
        simulationStepCount={simulationStepCount}
        onStepsInputChange={onStepsInputChange}
        onDtInputChange={onDtInputChange}
        onCommitSteps={onCommitSteps}
        onCommitDt={onCommitDt}
        onAlgorithmChange={onAlgorithmChange}
        onRunSimulation={onRunSimulation}
        onResetSimulation={onResetSimulation}
        onSliderIndexChange={onSliderIndexChange}
      />
    </aside>
  );
}
