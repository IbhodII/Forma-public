import { useCallback } from "react";

import type { BackgroundJobView } from "../components/BackgroundJobStatusPanel";
import {
  fetchDatabaseImportStatus,
  isImportProgressStalled,
  startDatabaseImport,
  type DatabaseImportMode,
} from "../api/databaseImport";
import type { DatabaseImportJobStatus } from "../types/desktopJobs";
import { usePersistedBackgroundJob } from "./usePersistedBackgroundJob";

const STORAGE_KEY = "forma.db-import.job.v1";

const IMPORT_STAGE_LABELS: Record<string, string> = {
  validating: "Проверка файлов",
  backup_current: "Резервная копия",
  importing: "Импорт данных",
  activating: "Переключение базы",
  migrating: "Миграции",
  integrity_check: "Проверка целостности",
  indexes: "Индексы",
  analyze: "ANALYZE",
  warmup: "Прогрев",
  verifying: "Проверка базы",
  done: "Готово",
  error: "Ошибка",
};

function mapImportStatus(raw: DatabaseImportJobStatus): BackgroundJobView {
  const stage = raw.stage || "";
  const stalled = isImportProgressStalled(raw);
  const baseMessage = raw.message || "";
  const message = stalled
    ? `${baseMessage} · Импорт всё ещё выполняется (без изменений >10 мин) — это нормально для большой базы.`
    : baseMessage;
  return {
    jobId: raw.job_id || raw.task_id,
    status: raw.status,
    stage,
    currentSection: IMPORT_STAGE_LABELS[stage] || stage,
    progressPercent: raw.progressPercent ?? 0,
    processed: raw.processed ?? 0,
    total: raw.total ?? 0,
    message,
    error: raw.error,
    verification:
      raw.report &&
      typeof raw.report === "object" &&
      "verification" in raw.report
        ? (raw.report as { verification?: BackgroundJobView["verification"] })
            .verification
        : undefined,
    report:
      raw.report && typeof raw.report === "object"
        ? (raw.report as Record<string, unknown>)
        : undefined,
  };
}

export function useDatabaseImportJob(userId: number) {
  const job = usePersistedBackgroundJob({
    storageKey: STORAGE_KEY,
    userId,
    fetchStatus: (jobId) => fetchDatabaseImportStatus(jobId, userId),
    mapToView: mapImportStatus,
    resolveJobIdOnMount: async () => readSnapshotJobId(userId),
  });

  const startImport = useCallback(
    async (
      source:
        | { kind: "zip"; path: string }
        | { kind: "files"; workoutsPath: string; sharedPath: string }
        | { kind: "zip-file"; file: File }
        | { kind: "files-blob"; workouts: File; shared: File },
      mode: DatabaseImportMode,
    ): Promise<DatabaseImportJobStatus> => {
      const { jobId } = await startDatabaseImport(source, mode, userId);
      await job.attachJob(jobId, {
        jobId,
        status: "pending",
        stage: "validating",
        currentSection: IMPORT_STAGE_LABELS.validating,
        progressPercent: 0,
        processed: 0,
        total: 1,
        message: "Запуск импорта…",
      });
      return fetchDatabaseImportStatus(jobId, userId);
    },
    [job, userId],
  );

  return {
    ...job,
    startImport,
    showCancel: false,
    showRetry: job.view?.status === "failed",
  };
}

function readSnapshotJobId(userId: number): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { jobId?: string; userId?: number };
    if (parsed.userId !== userId || !parsed.jobId) return null;
    return parsed.jobId;
  } catch {
    return null;
  }
}
