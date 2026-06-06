import type { ReactNode } from "react";

import { ErrorAlert } from "./ErrorAlert";
import { ModalFrame } from "./ui/modal";
import { useT } from "../i18n";
import type { VerificationReport } from "../utils/verificationReport";
import { verificationFailureLines } from "../utils/verificationReport";

export type BackgroundJobView = {
  jobId: string;
  status: string;
  stage?: string;
  currentSection?: string;
  progressPercent: number;
  processed: number;
  total: number;
  message: string;
  error?: string | null;
  lastHeartbeatAt?: string | null;
  verification?: VerificationReport | null;
  report?: Record<string, unknown> | null;
};

export type BackgroundJobStatusPanelProps = {
  title: string;
  jobKindLabel: string;
  view: BackgroundJobView | null;
  /** Modal blocks interaction; inline sits in the settings page */
  variant?: "modal" | "inline";
  open?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  showCancel?: boolean;
  showRetry?: boolean;
  extra?: ReactNode;
};

function formatHeartbeat(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString();
  } catch {
    return null;
  }
}

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "running":
    case "pending":
      return t("job.statusRunning");
    case "completed":
      return t("job.statusCompleted");
    case "failed":
      return t("job.statusFailed");
    case "cancelled":
      return t("job.statusCancelled");
    default:
      return status;
  }
}

function statusTone(status: string): string {
  if (status === "failed") return "text-red-600 dark:text-red-400";
  if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "cancelled") return "text-amber-600 dark:text-amber-400";
  return "text-[rgb(var(--app-accent))]";
}

export function BackgroundJobStatusBody({
  title,
  jobKindLabel,
  view,
  onCancel,
  onRetry,
  showCancel = false,
  showRetry = false,
  extra,
}: Omit<BackgroundJobStatusPanelProps, "variant" | "open">) {
  const t = useT();
  if (!view) return null;

  const pct = Math.min(100, Math.max(0, view.progressPercent ?? 0));
  const section = view.currentSection || view.stage || "";
  const processed = view.processed ?? 0;
  const total = view.total ?? 0;
  const heartbeat = formatHeartbeat(view.lastHeartbeatAt);
  const isRunning = view.status === "running" || view.status === "pending";
  const isFailed = view.status === "failed";
  const isCancelled = view.status === "cancelled";
  const errorText = view.error?.trim() || (isFailed ? view.message : null);
  const verifyLines = verificationFailureLines(view.verification);

  const showActions =
    (isRunning && showCancel && onCancel) ||
    (showRetry && onRetry && (isFailed || isCancelled));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">{title}</p>
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${statusTone(view.status)}`}
        >
          {statusLabel(view.status, t)}
        </span>
      </div>

      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        {t("job.active")}: {jobKindLabel}
        <span className="font-mono ml-1 opacity-80">
          {view.jobId.slice(0, 8)}…
        </span>
      </p>

      <div
        className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        role="progressbar"
      >
        <div
          className="h-full bg-brand-600 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-center text-[rgb(var(--app-text-muted))] tabular-nums">
        {view.message || "…"}
        {pct > 0 ? ` · ${pct}%` : ""}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--app-text-muted))]">
        {view.stage ? (
          <>
            <dt>{t("job.stage")}</dt>
            <dd className="font-mono text-right truncate">{view.stage}</dd>
          </>
        ) : null}
        {section ? (
          <>
            <dt>{t("job.section")}</dt>
            <dd className="text-right truncate">{section}</dd>
          </>
        ) : null}
        {total > 0 ? (
          <>
            <dt>{t("job.progress")}</dt>
            <dd className="tabular-nums text-right">
              {processed.toLocaleString()} / {total.toLocaleString()}
            </dd>
          </>
        ) : null}
      </dl>

      {heartbeat ? (
        <p className="text-[10px] text-center text-[rgb(var(--app-text-muted))]">
          {t("warmup.heartbeat", { time: heartbeat })}
        </p>
      ) : null}

      {errorText ? <ErrorAlert message={errorText} /> : null}

      {verifyLines.length > 0 ? (
        <ul className="text-xs text-[rgb(var(--app-text-muted))] space-y-1 list-disc pl-4">
          {verifyLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {extra}

      {showActions ? (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {isRunning && showCancel && onCancel ? (
            <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
              {t("warmup.cancel")}
            </button>
          ) : null}
          {showRetry && onRetry && (isFailed || isCancelled) ? (
            <button type="button" className="btn-primary text-sm" onClick={onRetry}>
              {t("warmup.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BackgroundJobStatusPanel({
  variant = "inline",
  open = true,
  extra,
  ...props
}: BackgroundJobStatusPanelProps) {
  if (!props.view) return null;

  const body = <BackgroundJobStatusBody {...props} extra={extra} />;

  if (variant === "modal") {
    return (
      <ModalFrame
        open={open}
        onClose={() => {}}
        dismissOnOverlay={false}
        zIndex={70}
        role="status"
        panelClassName="max-w-lg flex flex-col gap-4 p-6 max-h-[85vh] overflow-y-auto"
      >
        {body}
      </ModalFrame>
    );
  }

  return (
    <div
      className="rounded-xl border border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.45)] p-4"
      role="status"
      aria-live="polite"
    >
      {body}
    </div>
  );
}
