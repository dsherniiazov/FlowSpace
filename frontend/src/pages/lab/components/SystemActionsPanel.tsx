type SystemActionsPanelProps = {
  title: string;
  activeSystemId: number | null;
  isAdmin: boolean;
  isReviewingAsTeacher: boolean;
  lockEditing: boolean;
  saveAttempted: boolean;
  saveBlockedReason: string | null;
  saveDisabledNoChanges: boolean;
  saveButtonDisabled: boolean;
  isSaveError: boolean;
  isSubmitForReviewPending: boolean;
  isSubmitForReviewSuccess: boolean;
  isMarkReviewedPending: boolean;
  onTitleChange: (value: string) => void;
  onSave: () => void;
  onCreateNewSystem: () => void;
  onSubmitForReview: () => void;
  onOpenReviewModal: () => void;
};

export function SystemActionsPanel({
  title,
  activeSystemId,
  isAdmin,
  isReviewingAsTeacher,
  lockEditing,
  saveAttempted,
  saveBlockedReason,
  saveDisabledNoChanges,
  saveButtonDisabled,
  isSaveError,
  isSubmitForReviewPending,
  isSubmitForReviewSuccess,
  isMarkReviewedPending,
  onTitleChange,
  onSave,
  onCreateNewSystem,
  onSubmitForReview,
  onOpenReviewModal,
}: SystemActionsPanelProps): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="lab-system-row">
        <input
          className="lab-input"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="System title"
          aria-label="System title"
          data-tutorial="system-title"
        />
        <button
          className={`lab-btn lab-btn-secondary ${saveDisabledNoChanges ? "lab-btn-save-idle" : ""}`}
          onClick={onSave}
          disabled={saveButtonDisabled}
          title={saveDisabledNoChanges ? "No changes to save" : "Save system"}
          data-tutorial="save-system"
        >
          Save system
        </button>
      </div>
      <button
        className="lab-btn lab-btn-secondary w-full"
        type="button"
        onClick={onCreateNewSystem}
        disabled={lockEditing}
        data-tutorial="create-new-system"
      >
        Create new system
      </button>
      {!isReviewingAsTeacher ? (
        <button
          className={`lab-btn lab-btn-secondary w-full ${isSubmitForReviewSuccess ? "lab-btn-save-idle" : ""}`}
          type="button"
          onClick={onSubmitForReview}
          disabled={isSubmitForReviewPending || isSubmitForReviewSuccess}
        >
          {isSubmitForReviewPending ? "Submitting..." : isSubmitForReviewSuccess ? "Submitted for review \u2713" : "Submit for review"}
        </button>
      ) : null}
      {activeSystemId && isAdmin && isReviewingAsTeacher ? (
        <button
          className="lab-btn lab-btn-primary w-full"
          type="button"
          onClick={onOpenReviewModal}
          disabled={isMarkReviewedPending}
          title="Mark this student's system as reviewed and send them feedback"
        >
          {isMarkReviewedPending ? "Saving..." : "Mark as reviewed"}
        </button>
      ) : null}
      {saveAttempted && saveBlockedReason ? <div className="text-xs lab-error">{saveBlockedReason}</div> : null}
      {isSaveError ? <div className="text-xs lab-error">Unable to save system.</div> : null}
    </div>
  );
}
