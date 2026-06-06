import { apiClient } from "./client";
import { resolveClientMode } from "../config/clientCapabilities";
import type { DatabaseImportJobStatus } from "../types/desktopJobs";
import {
  fetchWithDbLockRetry,
  LONG_TASK_TIMEOUT_MS,
} from "./longTaskPolling";

export type DatabaseImportMode = "merge" | "replace";

/** Recommend replace when combined staging DB size exceeds backend threshold (~150 MB). */
export const LARGE_DB_BYTES_THRESHOLD = 150 * 1024 * 1024;
export const IMPORT_STALL_WARNING_MS = 10 * 60 * 1000;

const POLL_MS = 800;
const UPLOAD_TIMEOUT_MS = 600_000;
const longTaskRequest = { timeout: LONG_TASK_TIMEOUT_MS };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDesktopDatabaseImport(): boolean {
  if (!window.desktopApp?.isDesktop) return false;
  const api = window.electronAPI;
  return (
    typeof api?.startDatabaseImport === "function" &&
    typeof api?.getDatabaseImportStatus === "function" &&
    typeof api?.pickDatabaseImportFiles === "function"
  );
}

/** Dev-браузер (admin_browser) или localhost preview. */
export function isBrowserDatabaseImport(): boolean {
  if (isDesktopDatabaseImport()) return false;
  const mode = resolveClientMode();
  return mode === "admin_browser";
}

export function recommendedImportModeForBytes(
  workoutsBytes: number,
  sharedBytes: number,
): DatabaseImportMode {
  return workoutsBytes + sharedBytes >= LARGE_DB_BYTES_THRESHOLD ? "replace" : "merge";
}

export function isImportProgressStalled(
  status: Pick<DatabaseImportJobStatus, "last_progress_at" | "status">,
  nowMs: number = Date.now(),
): boolean {
  if (status.status !== "running" && status.status !== "pending") return false;
  const at = status.last_progress_at;
  if (!at) return false;
  const ts = Date.parse(at);
  if (Number.isNaN(ts)) return false;
  return nowMs - ts >= IMPORT_STALL_WARNING_MS;
}

function requireElectronApi() {
  const api = window.electronAPI;
  if (!api?.startDatabaseImport || !api.getDatabaseImportStatus || !api.pickDatabaseImportFiles) {
    throw new Error("Импорт базы доступен только в desktop-приложении");
  }
  return api;
}

export async function pickDatabaseImportZip() {
  return requireElectronApi().pickDatabaseImportFiles("zip");
}

export async function pickDatabaseImportDbFiles() {
  return requireElectronApi().pickDatabaseImportFiles("files");
}

type BrowserImportSource =
  | { kind: "zip-file"; file: File }
  | { kind: "files-blob"; workouts: File; shared: File };

async function stageDatabaseImportBrowser(
  source: BrowserImportSource,
  mode: DatabaseImportMode,
): Promise<string> {
  const form = new FormData();
  form.append("mode", mode);
  if (source.kind === "zip-file") {
    form.append("zip_file", source.file, source.file.name || "import.zip");
  } else {
    form.append("workouts_file", source.workouts, source.workouts.name || "workouts.db");
    form.append("shared_file", source.shared, source.shared.name || "shared.db");
  }
  const { data } = await apiClient.post<{ job_id: string; mode: string }>(
    "/database/import/stage",
    form,
    {
      timeout: UPLOAD_TIMEOUT_MS,
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data.job_id;
}

async function startImportJob(jobId: string, mode: DatabaseImportMode): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ job_id: string; task_id: string; status: string }>(
    "/database/import/start",
    { job_id: jobId, mode },
    { timeout: LONG_TASK_TIMEOUT_MS },
  );
  return { jobId: data.job_id || data.task_id || jobId };
}

export async function startDatabaseImport(
  source:
    | { kind: "zip"; path: string }
    | { kind: "files"; workoutsPath: string; sharedPath: string }
    | { kind: "zip-file"; file: File }
    | { kind: "files-blob"; workouts: File; shared: File },
  mode: DatabaseImportMode,
  _userId: number,
): Promise<{ jobId: string }> {
  if (source.kind === "zip" || source.kind === "files") {
    const staged = await requireElectronApi().startDatabaseImport({
      source,
      mode,
      userId: _userId,
    });
    return { jobId: staged.jobId };
  }

  if (source.kind === "zip-file") {
    const jobId = await stageDatabaseImportBrowser(source, mode);
    return startImportJob(jobId, mode);
  }
  const jobId = await stageDatabaseImportBrowser(source, mode);
  return startImportJob(jobId, mode);
}

export async function fetchDatabaseImportStatus(
  jobId: string,
  userId: number,
): Promise<DatabaseImportJobStatus> {
  if (isDesktopDatabaseImport()) {
    return requireElectronApi().getDatabaseImportStatus({ jobId, userId });
  }
  const { data } = await apiClient.get<DatabaseImportJobStatus>(
    `/database/import/status/${encodeURIComponent(jobId)}`,
    longTaskRequest,
  );
  return data;
}

export async function pollDatabaseImportJob(options: {
  jobId: string;
  userId: number;
  onProgress?: (status: DatabaseImportJobStatus) => void;
}): Promise<DatabaseImportJobStatus> {
  for (;;) {
    const status = await fetchWithDbLockRetry(() =>
      fetchDatabaseImportStatus(options.jobId, options.userId),
    );
    options.onProgress?.(status);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    await sleep(POLL_MS);
  }
}

export async function runDatabaseImportJob(
  source:
    | { kind: "zip"; path: string }
    | { kind: "files"; workoutsPath: string; sharedPath: string }
    | { kind: "zip-file"; file: File }
    | { kind: "files-blob"; workouts: File; shared: File },
  mode: DatabaseImportMode,
  userId: number,
  onProgress?: (status: DatabaseImportJobStatus) => void,
): Promise<DatabaseImportJobStatus> {
  const { jobId } = await startDatabaseImport(source, mode, userId);
  return pollDatabaseImportJob({ jobId, userId, onProgress });
}
