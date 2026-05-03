import { useEffect } from "react";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isSubmitting = false,
  error = null,
  onClose,
  onConfirm,
}: ConfirmDialogProps): JSX.Element | null {
  const closeDialogShortcut = useShortcutStore((state) => state.bindings.close_dialog);

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
        className="profile-modal profile-modal-narrow"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="profile-modal-head">
          <div>
            <h3 id="confirm-dialog-title" className="profile-modal-title">{title}</h3>
            <p className="profile-modal-subtitle">{description}</p>
          </div>
        </div>

        {error ? <div className="profile-modal-error">{error}</div> : null}

        <div className="profile-modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            {cancelLabel}
          </button>
          <button className="btn-primary" type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
