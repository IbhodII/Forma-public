import type { ReactNode } from "react";
import { ModalShell } from "./ui/modal";
import { cn } from "../lib/utils";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Да",
  cancelLabel = "Нет",
  loading = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn("btn-primary", danger && "bg-red-600 hover:bg-red-700")}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? "Подождите…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">{message}</div>
    </ModalShell>
  );
}
