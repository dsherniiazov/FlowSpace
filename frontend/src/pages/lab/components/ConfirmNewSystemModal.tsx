type ConfirmNewSystemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmNewSystemModal({
  isOpen,
  onClose,
  onConfirm,
}: ConfirmNewSystemModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="lab-modal-overlay" onClick={onClose}>
      <div className="lab-task-modal" onClick={(event) => event.stopPropagation()}>
        <div className="lab-chart-modal-head">
          <h3 className="lab-panel-title">Create new system</h3>
        </div>
        <div className="lab-task-modal-body">
          <p className="lab-task-modal-description">
            Are you sure you want to create a new system? Any unsaved changes will be lost.
          </p>
          <div className="lab-task-modal-actions">
            <button className="lab-btn lab-btn-primary" type="button" onClick={onConfirm}>
              Yes, create new
            </button>
            <button className="lab-btn lab-btn-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
