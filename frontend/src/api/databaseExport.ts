import { apiClient } from "./client";
import { fetchWithDbLockRetry, LONG_TASK_TIMEOUT_MS } from "./longTaskPolling";

const EXPORT_POLL_MS = 800;
const longTaskRequest = { timeout: LONG_TASK_TIMEOUT_MS };

export type DatabaseExportStatus = {
  task_id: string;
  status: "running" | "completed" | "failed";
  phase: string;
  current: number;
  total: number;
  percent: number;
  message: string;
  error?: string | null;
  download_filename?: string | null;
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

export async function startDatabaseExport(): Promise<{ task_id: string }> {
  const { data } = await apiClient.post<{ task_id: string }>(
    "/database/export/start",
    undefined,
    longTaskRequest,
  );
  return data;
}

export async function fetchDatabaseExportStatus(
  taskId: string,
): Promise<DatabaseExportStatus> {
  const { data } = await apiClient.get<DatabaseExportStatus>(
    `/database/export/status/${taskId}`,
    longTaskRequest,
  );
  return data;
}

export async function downloadDatabaseExportResult(
  taskId: string,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/database/export/result/${taskId}`, {
    responseType: "blob",
    timeout: LONG_TASK_TIMEOUT_MS,
  });
  triggerBlobDownload(data, filename);
}

export async function downloadFullDatabaseZip(
  onProgress?: (status: DatabaseExportStatus) => void,
): Promise<void> {
  let taskId: string;
  try {
    ({ task_id: taskId } = await startDatabaseExport());
  } catch (err) {
    const existing = taskIdFromConflict(err);
    if (!existing) throw err;
    taskId = existing;
  }

  for (;;) {
    const status = await fetchWithDbLockRetry(() => fetchDatabaseExportStatus(taskId));
    onProgress?.(status);
    if (status.status === "completed") {
      const name = status.download_filename || "forma_db_export.zip";
      onProgress?.({ ...status, percent: 100, message: "Скачивание файла…" });
      await downloadDatabaseExportResult(taskId, name);
      return;
    }
    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Export failed");
    }
    await sleep(EXPORT_POLL_MS);
  }
}
