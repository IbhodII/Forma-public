import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export type ModalZIndex = 50 | 55 | 60 | 65 | 70 | 80;

const Z_CLASS: Record<ModalZIndex, string> = {
  50: "z-50",
  55: "z-[55]",
  60: "z-[60]",
  65: "z-[65]",
  70: "z-[70]",
  80: "z-[80]",
};

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

export function ModalCloseButton({
  onClose,
  disabled,
  className,
}: {
  onClose: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[rgb(var(--app-border)/0.85)] text-[rgb(var(--app-text-muted))] transition-colors hover:bg-[rgb(var(--app-surface-subtle))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app-bg))] disabled:opacity-50",
        className,
      )}
      aria-label="Закрыть"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/** Overlay + panel shell; children own layout inside the panel. */
export function ModalFrame({
  open = true,
  onClose,
  onOverlayClick,
  dismissOnOverlay = true,
  children,
  zIndex = 50,
  overlayClassName,
  panelClassName,
  role = "presentation",
  dialogLabel,
}: {
  open?: boolean;
  onClose: () => void;
  onOverlayClick?: () => void;
  dismissOnOverlay?: boolean;
  children: ReactNode;
  zIndex?: ModalZIndex;
  overlayClassName?: string;
  panelClassName?: string;
  role?: "presentation" | "alertdialog" | "status";
  dialogLabel?: string;
}) {
  if (!open) return null;

  const handleOverlay = () => {
    if (!dismissOnOverlay) return;
    (onOverlayClick ?? onClose)();
  };

  return createPortal(
    <div
      className={cn("modal-overlay", Z_CLASS[zIndex], overlayClassName)}
      role={role}
      onClick={handleOverlay}
      aria-live={role === "status" ? "polite" : undefined}
      aria-busy={role === "status" ? true : undefined}
    >
      <div
        className={cn("modal-panel w-full", panelClassName)}
        role="dialog"
        aria-modal={role !== "status"}
        aria-labelledby={dialogLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  zIndex = 80,
  overlayClassName,
  dismissOnOverlay = true,
  dataEntry = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  zIndex?: ModalZIndex;
  overlayClassName?: string;
  dismissOnOverlay?: boolean;
  /** Forms with manual input — do not close on backdrop click. */
  dataEntry?: boolean;
}) {
  if (!open) return null;

  const overlayDismiss = dataEntry ? false : dismissOnOverlay;

  return (
    <ModalFrame
      open
      onClose={onClose}
      dismissOnOverlay={overlayDismiss}
      zIndex={zIndex}
      overlayClassName={overlayClassName}
      panelClassName={cn(
        "relative flex flex-col max-h-[min(90dvh,720px)] p-0 overflow-hidden",
        SIZE_CLASS[size],
        className,
      )}
      dialogLabel={title ? "modal-shell-title" : undefined}
    >
      <div className="flex items-start justify-between gap-3 sm:gap-4 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-[rgb(var(--app-border)/0.5)] shrink-0">
        <div className="min-w-0 flex-1">
          {title ? (
            <h2
              id="modal-shell-title"
              className="text-lg font-semibold tracking-tight text-[rgb(var(--app-text))]"
            >
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">{description}</p>
          ) : null}
        </div>
        <ModalCloseButton onClose={onClose} className="-mt-1 shrink-0" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-5 min-h-0">{children}</div>

      {footer ? (
        <div className="shrink-0 flex flex-wrap justify-end gap-2 px-4 sm:px-6 pb-4 sm:pb-6 pt-2 border-t border-[rgb(var(--app-border)/0.5)]">
          {footer}
        </div>
      ) : null}
    </ModalFrame>
  );
}
