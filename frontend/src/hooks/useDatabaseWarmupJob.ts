import { useCallback } from "react";

import type { BackgroundJobView } from "../components/BackgroundJobStatusPanel";
import {
  fetchAccountWarmupCurrent,
  type AccountWarmupStatus,
  type WarmupMode,
} from "../api/accountWarmup";
import {
  cancelDatabaseWarmup,
  getDatabaseWarmupStatus,
  startDatabaseWarmup,
} from "../api/databaseWarmup";
import { usePersistedBackgroundJob } from "./usePersistedBackgroundJob";

const STORAGE_KEY = "forma.db-warmup.job.v1";

function mapWarmupStatus(raw: AccountWarmupStatus): BackgroundJobView {
  const processed = raw.processed ?? raw.processed_units ?? raw.current ?? 0;
  const total =
    (raw.total_units ?? 0) > 0 ? raw.total_units! : raw.total ?? 0;
  return {
    jobId: raw.task_id,
    status: raw.status,
    stage: raw.stage,
    currentSection:
      raw.currentSection ||
      (raw.stage ? raw.stage : ""),
    progressPercent: raw.percent ?? 0,
    processed,
    total,
    message: raw.message || "",
    error: raw.error,
    lastHeartbeatAt: raw.lastHeartbeatAt,
    verification:
      raw.summary &&
      typeof raw.summary === "object" &&
      "verification" in raw.summary
        ? (raw.summary as { verification?: BackgroundJobView["verification"] })
            .verification
        : undefined,
  };
}

export function useDatabaseWarmupJob(userId: number) {
  const job = usePersistedBackgroundJob({
    storageKey: STORAGE_KEY,
    userId,
    fetchStatus: (jobId) => getDatabaseWarmupStatus(jobId, userId),
    mapToView: mapWarmupStatus,
    resolveJobIdOnMount: async () => {
      try {
        const current = await fetchAccountWarmupCurrent();
        if (current.status === "running" && current.task_id) {
          return current.task_id;
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return null;
      } catch {
        /* ignore — fall through to stored id */
      }
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { jobId?: string; userId?: number };
        if (parsed.userId !== userId || !parsed.jobId) return null;
        const status = await getDatabaseWarmupStatus(parsed.jobId, userId);
        if (status.status === "running") {
          return parsed.jobId;
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } catch {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      return null;
    },
  });

  const startWarmup = useCallback(
    async (mode: WarmupMode = "full", resume = true) => {
      const { jobId } = await startDatabaseWarmup(mode, { resume, userId });
      await job.attachJob(jobId, {
        jobId,
        status: "running",
        stage: "",
        currentSection: "",
        progressPercent: 0,
        processed: 0,
        total: 1,
        message: "Запуск прогрева…",
      });
      return getDatabaseWarmupStatus(jobId, userId);
    },
    [job, userId],
  );

  const attachWarmup = useCallback(
    async (jobId: string, _mode: WarmupMode = "light") => {
      await job.attachJob(jobId, {
        jobId,
        status: "running",
        stage: "",
        currentSection: "",
        progressPercent: 0,
        processed: 0,
        total: 1,
        message: "Прогрев…",
      });
      return getDatabaseWarmupStatus(jobId, userId);
    },
    [job, userId],
  );

  const cancelWarmup = useCallback(async () => {
    try {
      await cancelDatabaseWarmup(userId);
    } finally {
      const id = job.view?.jobId;
      if (id) {
        try {
          const status = await getDatabaseWarmupStatus(id, userId);
          job.setView(mapWarmupStatus(status));
          if (status.status === "running") {
            return;
          }
        } catch {
          /* stale or gone */
        }
      }
      job.clearJob();
    }
  }, [job, userId]);

  const retryWarmup = useCallback(
    (mode: WarmupMode = "full") => startWarmup(mode, true),
    [startWarmup],
  );

  return {
    ...job,
    startWarmup,
    attachWarmup,
    cancelWarmup,
    retryWarmup,
    showCancel: true,
    showRetry: true,
  };
}
