import { FormEvent, useEffect, useState } from "react";
import { matchesShortcutEvent, useShortcutStore } from "../store/shortcutStore";

type ProfilePasswordModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
};

export function ProfilePasswordModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: ProfilePasswordModalProps): JSX.Element | null {
  const closeDialogShortcut = useShortcutStore((state) => state.bindings.close_dialog);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      return;
    }

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!currentPassword.trim()) {
      setError("Enter your current password.");
      return;
    }

    if (newPassword.trim().length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password confirmation does not match.");
      return;
    }

    try {
      await onSubmit(currentPassword, newPassword);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update password.");
    }
  }

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
        aria-labelledby="profile-password-modal-title"
      >
        <div className="profile-modal-head">
          <div>
            <h3 id="profile-password-modal-title" className="profile-modal-title">Change password</h3>
            <p className="profile-modal-subtitle">Update your account password in a separate secure dialog.</p>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Close
          </button>
        </div>

        <form className="profile-password-form" onSubmit={handleSubmit}>
          <label className="profile-form-field">
            <span className="profile-form-label">Current password</span>
            <input
              className="input"
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoFocus
            />
          </label>

          <label className="profile-form-field">
            <span className="profile-form-label">New password</span>
            <input
              className="input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label className="profile-form-field">
            <span className="profile-form-label">Confirm new password</span>
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          {error ? <div className="profile-modal-error">{error}</div> : null}

          <div className="profile-modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
