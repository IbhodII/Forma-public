import type { DatabaseWarmupJobStatus } from "../types/desktopJobs";
import {
  cancelAccountWarmup,
  fetchAccountWarmupStatus,
  startAccountWarmup,
  WARMUP_STATUS_TIMEOUT_MS,
  type AccountWarmupStatus,
  type WarmupMode,
} from "./accountWarmup";
import { fetchWithDbLockRetry, isDbLockedError } from "./longTaskPolling";

export const WARMUP_POLL_MS = 800;
export { WARMUP_STATUS_TIMEOUT_MS };

export type { WarmupMode, AccountWarmupStatus, DatabaseWarmupJobStatus };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDesktopWarmup(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.electronAPI?.startDatabaseWarmup &&
      window.electronAPI?.getDatabaseWarmupStatus,
  );
}

function mapStatus(raw: DatabaseWarmupJobStatus): AccountWarmupStatus {
  return {
    task_id: raw.task_id || raw.job_id || "",
    status: raw.status,
    phase: raw.phase,
    current: raw.current,
    total: raw.total,
    stage: raw.stage,
    percent: raw.percent,
    message: raw.message,
    error: raw.error,
    elapsed_sec: raw.elapsed_sec,
    stages: raw.stages ?? [],
    warnings: raw.warnings ?? [],
    processed_units: raw.processed_units ?? raw.processed,
    total_units: raw.total_units ?? raw.total,
    summary: raw.summary ?? undefined,
    currentSection: raw.currentSection,
    lastHeartbeatAt: raw.lastHeartbeatAt,
    processed: raw.processed ?? raw.processed_units,
  } as AccountWarmupStatus & {
    currentSection?: string;
    lastHeartbeatAt?: string | null;
    processed?: number;
  };
}

export async function startDatabaseWarmup(
  mode: WarmupMode = "full",
  options?: {
    includeVacuum?: boolean;
    resume?: boolean;
    userId?: number;
  },
): Promise<{ jobId: string }> {
  const userId = options?.userId ?? 1;
  if (isDesktopWarmup()) {
    const res = await window.electronAPI!.startDatabaseWarmup!({
      mode,
      includeVacuum: options?.includeVacuum ?? false,
      resume: options?.resume ?? true,
      userId,
    });
    return { jobId: res.jobId };
  }
  const { task_id } = await startAccountWarmup(
    mode,
    options?.includeVacuum ?? false,
    options?.resume ?? true,
  );
  return { jobId: task_id };
}

export async function getDatabaseWarmupStatus(
  jobId: string,
  userId = 1,
): Promise<AccountWarmupStatus> {
  if (isDesktopWarmup()) {
    const raw = await window.electronAPI!.getDatabaseWarmupStatus!({ jobId, userId });
    return mapStatus(raw);
  }
  return fetchAccountWarmupStatus(jobId);
}

export async function cancelDatabaseWarmup(userId = 1): Promise<void> {
  if (isDesktopWarmup()) {
    await window.electronAPI!.cancelDatabaseWarmup!({ userId });
    return;
  }
  await cancelAccountWarmup();
}

async function fetchStatusWithRetry(jobId: string, userId: number): Promise<AccountWarmupStatus> {
  const fetchOnce = () => getDatabaseWarmupStatus(jobId, userId);
  try {
    return await fetchWithDbLockRetry(fetchOnce, 600);
  } catch (err) {
    if (isDbLockedError(err)) throw err;
    throw err;
  }
}

function taskIdFromConflict(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } }).response;
  if (res?.status !== 409) return null;
  const detail = res.data?.detail;
  if (typeof detail === "object" && detail !== null && "task_id" in detail) {
    const id = (detail as { task_id?: unknown }).task_id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export async function pollDatabaseWarmupJob(options?: {
  mode?: WarmupMode;
  includeVacuum?: boolean;
  resume?: boolean;
  userId?: number;
  jobId?: string;
  onProgress?: (status: AccountWarmupStatus) => void;
}): Promise<AccountWarmupStatus> {
  const userId = options?.userId ?? 1;
  let jobId = options?.jobId;
  if (!jobId) {
    try {
      ({ jobId } = await startDatabaseWarmup(options?.mode ?? "full", {
        includeVacuum: options?.includeVacuum,
        resume: options?.resume,
        userId,
      }));
    } catch (err) {
      const existing = taskIdFromConflict(err);
      if (!existing) throw err;
      jobId = existing;
    }
  }

  for (;;) {
    const status = await fetchStatusWithRetry(jobId!, userId);
    options?.onProgress?.(status);
    if (status.status === "completed") return status;
    if (status.status === "cancelled") return status;
    if (status.status === "failed") {
      throw new Error(
        status.error ||
          status.message ||
          "Прогрев остановлен, можно запустить повторно для продолжения.",
      );
    }
    await sleep(WARMUP_POLL_MS);
  }
}
