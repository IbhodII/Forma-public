import type { ReactNode } from "react";

import type { AccountWarmupStatus } from "../../../api/accountWarmup";
import {
  BackgroundJobStatusPanel,
  type BackgroundJobView,
} from "../../../components/BackgroundJobStatusPanel";
import { useT } from "../../../i18n";

function toView(progress: AccountWarmupStatus | null): BackgroundJobView | null {
  if (!progress) return null;
  const processed = progress.processed ?? progress.processed_units ?? progress.current ?? 0;
  const total =
    (progress.total_units ?? 0) > 0 ? progress.total_units! : progress.total ?? 0;
  return {
    jobId: progress.task_id,
    status: progress.status,
    stage: progress.stage,
    currentSection: progress.currentSection || progress.stage,
    progressPercent: progress.percent ?? 0,
    processed,
    total,
    message: progress.message,
    error: progress.error,
    lastHeartbeatAt: progress.lastHeartbeatAt,
  };
}

export function AccountWarmupProgressOverlay({
  progress,
  title,
  onCancel,
  onRetry,
  canRetry = false,
  stagesList,
}: {
  progress: AccountWarmupStatus | null;
  title: string;
  onCancel?: () => void;
  onRetry?: () => void;
  canRetry?: boolean;
  stagesList?: ReactNode;
}) {
  const t = useT();
  return (
    <BackgroundJobStatusPanel
      variant="modal"
      open
      title={title}
      jobKindLabel={t("warmup.jobLabel")}
      view={toView(progress)}
      showCancel={Boolean(onCancel)}
      showRetry={canRetry}
      onCancel={onCancel}
      onRetry={onRetry}
      extra={stagesList}
    />
  );
}
