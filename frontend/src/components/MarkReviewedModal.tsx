import { useEffect, useState } from "react";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";

type MarkReviewedModalProps = {
  isOpen: boolean;
  systemTitle: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void | Promise<void>;
};

export function MarkReviewedModal({
  isOpen,
  systemTitle,
  isSubmitting,
  onClose,
  onSubmit,
}: MarkReviewedModalProps): JSX.Element | null {
  const closeDialogShortcut = useShortcutStore((state) => state.bindings.close_dialog);
  const [comment, setComment] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setComment("");
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcutEvent(event, closeDialogShortcut) && !isSubmitting) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialogShortcut, isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="profile-modal-overlay"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="profile-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-reviewed-title"
      >
        <div className="profile-modal-head">
          <div>
            <h3 id="mark-reviewed-title" className="profile-modal-title">
              Mark as reviewed
            </h3>
            <p className="profile-modal-subtitle">
              Leave a final comment for "{systemTitle}". The student will see it in
              their inbox when they open this notification.
            </p>
          </div>
        </div>

        <label className="profile-form-field">
          <span className="profile-form-label">Feedback (optional)</span>
          <textarea
            className="input mark-reviewed-textarea"
            rows={5}
            placeholder="Great work! You could improve the feedback loop by..."
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        {error ? <div className="profile-modal-error">{error}</div> : null}

        <div className="profile-modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setError(null);
              void Promise.resolve(onSubmit(comment)).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "Unable to mark system as reviewed.");
              });
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Mark as reviewed"}
          </button>
        </div>
      </div>
    </div>
  );
}
