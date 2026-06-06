import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  fetchFitImportStatus,
  isFitImportConflict,
  isFitSyncValidationError,
  parseFitImportConflict,
  parseFitSyncError,
  startFitImport,
  type FitSyncTaskStatus,
} from "../api/sync";

const POLL_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useFitImport(options?: {
  fitFolderPath?: string | null;
  reimport?: boolean;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<FitSyncTaskStatus | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const pollUntilDone = useCallback(async (taskId: string) => {
    for (;;) {
      const status = await fetchFitImportStatus(taskId);
      setProgress(status);
      if (status.status !== "running") {
        if (status.status === "failed") {
          const imported = Number(status.imported) || 0;
          const repaired = Number(status.repaired) || 0;
          if (imported + repaired > 0) {
            await qc.invalidateQueries({ queryKey: ["cardio"] });
            options?.onSuccess?.();
            return status;
          }
          const msg = status.error || status.message || "Ошибка импорта FIT";
          setValidationError(msg);
          return null;
        }
        await qc.invalidateQueries({ queryKey: ["cardio"] });
        options?.onSuccess?.();
        return status;
      }
      await sleep(POLL_MS);
    }
  }, [options?.onSuccess, qc]);

  const runImport = useCallback(async () => {
    setLoading(true);
    setProgress(null);
    setValidationError(null);
    try {
      const started = await startFitImport({
        folder: options?.fitFolderPath ?? undefined,
        reimport: options?.reimport ?? false,
      });
      return await pollUntilDone(started.task_id);
    } catch (err) {
      if (isFitImportConflict(err)) {
        const conflict = parseFitImportConflict(err);
        if (conflict?.taskId) {
          return await pollUntilDone(conflict.taskId);
        }
        throw new Error(conflict?.message ?? "Импорт FIT уже выполняется");
      }
      const msg = parseFitSyncError(err);
      if (isFitSyncValidationError(err)) {
        setValidationError(msg);
        return null;
      }
      throw err;
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [options?.fitFolderPath, options?.reimport, pollUntilDone]);

  return {
    loading,
    progress,
    validationError,
    setValidationError,
    runImport,
  };
}
