import { apiClient } from "./client";
import { fetchWithDbLockRetry, LONG_TASK_TIMEOUT_MS } from "./longTaskPolling";

const BACKUP_TIMEOUT_MS = LONG_TASK_TIMEOUT_MS;
const EXPORT_POLL_MS = 800;
const longTaskRequest = { timeout: LONG_TASK_TIMEOUT_MS };

export type BackupImportMode = "merge" | "replace";

export type BackupImportReport = {
  imported: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
  skipped_tables: string[];
  warmup_recommended?: boolean;
  warmup_task_id?: string;
  warmup_auto_error?: string;
};

export type RemarkStrengthSyncResult = {
  sessions: number;
  rows_marked: number;
};

export type BackupExportStatus = {
  task_id: string;
  status: "running" | "completed" | "failed";
  phase: string;
  current: number;
  total: number;
  table: string;
  percent: number;
  message: string;
  error?: string | null;
};

export type BackupImportStatus = BackupExportStatus & {
  report?: BackupImportReport;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function startBackupExport(): Promise<{ task_id: string }> {
  const { data } = await apiClient.post<{ task_id: string }>(
    "/backup/export/start",
    undefined,
    longTaskRequest,
  );
  return data;
}

export async function fetchBackupExportStatus(taskId: string): Promise<BackupExportStatus> {
  const { data } = await apiClient.get<BackupExportStatus>(
    `/backup/export/status/${taskId}`,
    longTaskRequest,
  );
  return data;
}

export async function downloadBackupExportResult(taskId: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/backup/export/result/${taskId}`, {
    responseType: "blob",
    timeout: BACKUP_TIMEOUT_MS,
  });
  triggerBlobDownload(data, "forma_backup_v1.json");
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

export async function downloadFullBackup(
  onProgress?: (status: BackupExportStatus) => void,
): Promise<void> {
  let taskId: string;
  try {
    ({ task_id: taskId } = await startBackupExport());
  } catch (err) {
    const existing = taskIdFromConflict(err);
    if (!existing) throw err;
    taskId = existing;
  }

  for (;;) {
    const status = await fetchWithDbLockRetry(() => fetchBackupExportStatus(taskId));
    onProgress?.(status);
    if (status.status === "completed") {
      onProgress?.({ ...status, percent: 100, message: "Скачивание файла…" });
      await downloadBackupExportResult(taskId);
      return;
    }
    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Export failed");
    }
    await sleep(EXPORT_POLL_MS);
  }
}

export async function startBackupImport(
  file: File,
  mode: BackupImportMode,
): Promise<{ task_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<{ task_id: string }>(
    `/backup/import/start?mode=${mode}`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: BACKUP_TIMEOUT_MS,
    },
  );
  return data;
}

export async function fetchBackupImportStatus(taskId: string): Promise<BackupImportStatus> {
  const { data } = await apiClient.get<BackupImportStatus>(
    `/backup/import/status/${taskId}`,
    longTaskRequest,
  );
  return data;
}

export async function importFullBackup(
  file: File,
  mode: BackupImportMode,
  onProgress?: (status: BackupImportStatus) => void,
): Promise<BackupImportReport> {
  let taskId: string;
  try {
    ({ task_id: taskId } = await startBackupImport(file, mode));
  } catch (err) {
    const existing = taskIdFromConflict(err);
    if (!existing) throw err;
    taskId = existing;
  }

  for (;;) {
    const status = await fetchWithDbLockRetry(() => fetchBackupImportStatus(taskId));
    onProgress?.(status);
    if (status.status === "completed") {
      if (status.report) return status.report;
      throw new Error(status.message || "Import completed without report");
    }
    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Import failed");
    }
    await sleep(EXPORT_POLL_MS);
  }
}

export async function remarkStrengthForSync(): Promise<RemarkStrengthSyncResult> {
  const { data } = await apiClient.post<RemarkStrengthSyncResult>(
    "/backup/admin/remark-strength-sync",
  );
  return data;
}

export async function downloadCloudDatabaseBackup(
  provider: "yandex" | "google",
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>("/cloud/backup/download", {
    params: { provider, filename },
    responseType: "blob",
    timeout: BACKUP_TIMEOUT_MS,
  });
  triggerBlobDownload(data, filename);
}
