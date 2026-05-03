import { ConfirmDialog } from "./ConfirmDialog";

type ProfileConfirmModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function ProfileConfirmModal(props: ProfileConfirmModalProps): JSX.Element | null {
  return (
    <ConfirmDialog
      isOpen={props.isOpen}
      isSubmitting={props.isSubmitting}
      title={props.title}
      description={props.description}
      confirmLabel={props.confirmLabel}
      cancelLabel={props.cancelLabel}
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    />
  );
}
