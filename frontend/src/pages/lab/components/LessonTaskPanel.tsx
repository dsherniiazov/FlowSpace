import type { LessonTask } from "../../../types/api";
import type { LabTaskContext } from "../types";

type LessonTaskPanelProps = {
  context: LabTaskContext | null;
  tasksCount: number;
  currentTaskIndex: number;
  previousTask: LessonTask | null;
  nextTask: LessonTask | null;
  isCompleted: boolean;
  isLoadingNavigation: boolean;
  isTasksError: boolean;
  exitError: string | null;
  isSavingCompletion: boolean;
  isExiting: boolean;
  onOpenTask: (taskId: number) => void;
  onOpenFullTask: () => void;
  onMarkCompleted: () => void;
  onContinue: () => void;
  onExit: () => void;
};

export function LessonTaskPanel({
  context,
  tasksCount,
  currentTaskIndex,
  previousTask,
  nextTask,
  isCompleted,
  isLoadingNavigation,
  isTasksError,
  exitError,
  isSavingCompletion,
  isExiting,
  onOpenTask,
  onOpenFullTask,
  onMarkCompleted,
  onContinue,
  onExit,
}: LessonTaskPanelProps): JSX.Element | null {
  if (!context) return null;

  return (
    <div className="space-y-3" data-tutorial="task-block">
      <div className="lab-task-pager">
        <button
          className="lab-task-pager-arrow"
          type="button"
          aria-label="Previous task"
          title="Previous task"
          onClick={() => previousTask && onOpenTask(previousTask.id)}
          disabled={!previousTask}
        >
          &#x2039;
        </button>
        <div className="lab-task-pager-meta">
          <div className="text-sm lab-field">Task</div>
          {tasksCount > 0 && currentTaskIndex >= 0 ? (
            <div className="lab-task-pager-count">
              {currentTaskIndex + 1} / {tasksCount}
            </div>
          ) : null}
        </div>
        <button
          className="lab-task-pager-arrow"
          type="button"
          aria-label="Next task"
          title="Next task"
          onClick={() => nextTask && onOpenTask(nextTask.id)}
          disabled={!nextTask}
        >
          &#x203A;
        </button>
        <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={onOpenFullTask}>
          Full screen
        </button>
      </div>
      <div className="lab-task-card">
        <div className="lab-task-card-title">{context.taskTitle}</div>
        <p className="lab-task-card-description">{context.taskDescription}</p>
      </div>
      <div className={`text-xs ${isCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
        {isCompleted ? "Task marked as completed." : "Task is not completed yet."}
      </div>
      {isTasksError ? <div className="text-xs lab-error">Unable to load lesson tasks.</div> : null}
      {exitError ? <div className="text-xs lab-error">{exitError}</div> : null}
      <button
        className="lab-btn lab-btn-primary w-full"
        type="button"
        onClick={onMarkCompleted}
        disabled={isCompleted || isSavingCompletion}
        data-tutorial="mark-completed"
      >
        {isCompleted ? "Task completed" : isSavingCompletion ? "Saving..." : "Mark task as completed"}
      </button>
      <button
        className="lab-btn lab-btn-secondary w-full"
        type="button"
        onClick={onContinue}
        disabled={isLoadingNavigation}
        data-tutorial="finish-lesson"
      >
        {isLoadingNavigation ? "Loading lesson tasks..." : nextTask ? "Go to next task" : "Finish lesson"}
      </button>
      <button className="lab-btn lab-btn-secondary w-full" type="button" onClick={onExit} disabled={isExiting}>
        {isExiting ? "Exiting..." : "Exit lesson"}
      </button>
    </div>
  );
}
