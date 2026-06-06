import { ModalShell } from "./ui/modal";

type MessageModalProps = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

/** Центрированное сообщение с одной кнопкой подтверждения. */
export function MessageModal({
  open,
  title,
  message,
  onClose,
  confirmLabel = "OK",
}: MessageModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      footer={
        <button type="button" className="btn-primary min-w-[6rem]" onClick={onClose}>
          {confirmLabel}
        </button>
      }
    >
      {null}
    </ModalShell>
  );
}
