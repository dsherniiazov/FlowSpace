import type { LessonTask } from "../../../types/api";
import type { LabTaskContext } from "../types";

type TaskModalProps = {
  isOpen: boolean;
  context: LabTaskContext | null;
  nextTask: LessonTask | null;
  isCompleted: boolean;
  isTasksError: boolean;
  exitError: string | null;
  isSavingCompletion: boolean;
  canResolveLessonNavigation: boolean;
  isExiting: boolean;
  onClose: () => void;
  onMarkCompleted: () => void;
  onContinue: () => void;
  onExit: () => void;
};

export function TaskModal({
  isOpen,
  context,
  nextTask,
  isCompleted,
  isTasksError,
  exitError,
  isSavingCompletion,
  canResolveLessonNavigation,
  isExiting,
  onClose,
  onMarkCompleted,
  onContinue,
  onExit,
}: TaskModalProps): JSX.Element | null {
  if (!isOpen || !context) return null;

  return (
    <div className="lab-modal-overlay" onClick={onClose}>
      <div className="lab-task-modal" onClick={(event) => event.stopPropagation()}>
        <div className="lab-chart-modal-head">
          <h3 className="lab-panel-title">Task</h3>
          <button className="lab-btn lab-btn-secondary lab-btn-compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="lab-task-modal-body">
          <h4 className="lab-task-modal-title">{context.taskTitle}</h4>
          <p className="lab-task-modal-description">{context.taskDescription}</p>
          <div className={`text-sm ${isCompleted ? "lab-task-status-completed" : "lab-muted"}`}>
            {isCompleted ? "Task marked as completed." : "Task is not completed yet."}
          </div>
          {isTasksError ? <div className="text-sm lab-error">Unable to load lesson tasks.</div> : null}
          {exitError ? <div className="text-sm lab-error">{exitError}</div> : null}
          <div className="lab-task-modal-actions">
            <button className="lab-btn lab-btn-primary" type="button" onClick={onMarkCompleted} disabled={isCompleted || isSavingCompletion}>
              {isCompleted ? "Task completed" : isSavingCompletion ? "Saving..." : "Mark task as completed"}
            </button>
            <button className="lab-btn lab-btn-secondary" type="button" onClick={onContinue} disabled={!canResolveLessonNavigation}>
              {!canResolveLessonNavigation ? "Loading lesson tasks..." : nextTask ? "Go to next task" : "Finish lesson"}
            </button>
          </div>
          <button className="lab-btn lab-btn-secondary w-full" type="button" onClick={onExit} disabled={isExiting}>
            {isExiting ? "Exiting..." : "Exit lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}
