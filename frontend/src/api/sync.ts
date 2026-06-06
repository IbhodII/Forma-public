import { apiClient } from "./client";

import { getApiStatus, parseApiError } from "../utils/validation";



export interface FitSyncStats {

  files: number;

  imported: number;

  repaired: number;

  skipped: number;

  errors: number;

  files_seen?: number;

  skipped_by_filename_date?: number;

  parsed_files?: number;

  imported_files?: number;

  duplicates_skipped?: number;

}

export type FitSyncToastVariant = "success" | "warning" | "error" | "info";

function safeFitCount(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function fitImportToastVariant(
  status: string,
  stats: FitSyncStats,
): FitSyncToastVariant {
  const imported = safeFitCount(stats.imported);
  const repaired = safeFitCount(stats.repaired);
  const errors = safeFitCount(stats.errors);
  const total = imported + repaired;
  const isFailureStatus = status === "failed" || status === "error";
  if (isFailureStatus && total === 0 && errors > 0) return "error";
  if (isFailureStatus && total > 0) return "warning";
  if (errors > 0) return "warning";
  if (total > 0) return "success";
  return "info";
}



export interface FitSyncResponse {

  status: string;

  message: string;

  stats: FitSyncStats;

  folder?: string | null;

}



export interface FitSyncStartedResponse {

  status: "started";

  task_id: string;

  message: string;

}



export interface FitSyncTaskStatus {

  task_id: string;

  status: "running" | "completed" | "failed" | string;

  files_total: number;

  files_processed: number;

  imported: number;

  repaired: number;

  skipped: number;

  errors: number;

  files_seen?: number;

  skipped_by_filename_date?: number;

  parsed_files?: number;

  imported_files?: number;

  duplicates_skipped?: number;

  folder?: string | null;

  message: string;

  error?: string | null;

}



export interface IntegrationSyncItem {

  id: string;

  name: string;

  status: string;

  message: string;

  folder?: string | null;

  stats?: Record<string, number> | null;

}



export interface IntegrationsSyncResponse {

  status: string;

  message: string;

  items: IntegrationSyncItem[];

}



export interface PolarSyncFetchResponse {

  status: string;

  new_count: number;

  message: string;

}



export interface PolarUploadResponse {

  status: string;

  message: string;

  polar_transaction_id?: string | null;

  date?: string | null;

  type?: string | null;

}



const SYNC_TIMEOUT_MS = 300_000;

const FIT_POLL_MS = 2500;



function sleep(ms: number) {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



/** Фоновый импорт FIT — сразу возвращает task_id. */

export async function startFitImport(options?: {

  folder?: string | null;

  reimport?: boolean;

}) {

  const { data } = await apiClient.post<FitSyncStartedResponse>("/sync/fit", {

    folder: options?.folder?.trim() || null,

    reimport: options?.reimport ?? false,

  });

  return data;

}



/** Статус фоновой задачи импорта FIT. */

export async function fetchFitImportStatus(taskId: string) {

  const { data } = await apiClient.get<FitSyncTaskStatus>(`/sync/fit/status/${taskId}`);

  return data;

}



/**

 * Импорт FIT: по умолчанию фоновый (poll до завершения).

 * sync: true — старый синхронный режим (?sync=true), блокирует до конца.

 */

export async function syncFit(options?: {

  folder?: string | null;

  reimport?: boolean;

  sync?: boolean;

  onProgress?: (status: FitSyncTaskStatus) => void;

}): Promise<FitSyncResponse> {

  if (options?.sync) {

    const { data } = await apiClient.post<FitSyncResponse>(

      "/sync/fit",

      {

        folder: options?.folder?.trim() || null,

        reimport: options?.reimport ?? false,

      },

      { timeout: SYNC_TIMEOUT_MS, params: { sync: true } },

    );

    return data;

  }



  const started = await startFitImport(options);

  for (;;) {

    const status = await fetchFitImportStatus(started.task_id);

    options?.onProgress?.(status);

    if (status.status !== "running") {

      if (status.status === "failed") {

        const stats = fitStatsFromTaskStatus(status);
        if (stats.imported + stats.repaired > 0) {
          return {
            status: "error",
            message: status.error || status.message || "Импорт FIT завершён с предупреждением",
            stats,
            folder: status.folder,
          };
        }

        const msg = status.error || status.message || "Ошибка импорта FIT";

        throw Object.assign(new Error(msg), { fitTaskStatus: status });

      }

      return {

        status: status.errors > 0 ? "error" : "ok",

        message: status.message,

        stats: fitStatsFromTaskStatus(status),

        folder: status.folder,

      };

    }

    await sleep(FIT_POLL_MS);

  }

}



export async function syncAllIntegrations(options?: {

  reimportFit?: boolean;

  fitFolderPath?: string | null;

}) {

  const { data } = await apiClient.post<IntegrationsSyncResponse>(

    "/sync/integrations",

    {

      reimport_fit: options?.reimportFit ?? false,

      fit_folder_path: options?.fitFolderPath?.trim() || null,

    },

    { timeout: SYNC_TIMEOUT_MS },

  );

  return data;

}



export async function syncPolarFetch() {

  const { data } = await apiClient.post<PolarSyncFetchResponse>(

    "/sync/polar/fetch",

    {},

    { timeout: SYNC_TIMEOUT_MS },

  );

  return data;

}



export async function syncPolarUpload(file: File) {

  const form = new FormData();

  form.append("file", file);

  const { data } = await apiClient.post<PolarUploadResponse>(

    "/sync/polar/upload",

    form,

    {

      headers: { "Content-Type": "multipart/form-data" },

      timeout: SYNC_TIMEOUT_MS,

    },

  );

  return data;

}



export function fitStatsFromRecord(raw: Record<string, number> | null | undefined): FitSyncStats {

  return {

    files: safeFitCount(raw?.files),

    imported: safeFitCount(raw?.imported),

    repaired: safeFitCount(raw?.repaired),

    skipped: safeFitCount(raw?.skipped),

    errors: safeFitCount(raw?.errors),

    files_seen: safeFitCount(raw?.files_seen),

    skipped_by_filename_date: safeFitCount(raw?.skipped_by_filename_date),

    parsed_files: safeFitCount(raw?.parsed_files),

    imported_files: safeFitCount(raw?.imported_files),

    duplicates_skipped: safeFitCount(raw?.duplicates_skipped),

  };

}



export function fitStatsFromTaskStatus(status: FitSyncTaskStatus): FitSyncStats {

  return {

    files: safeFitCount(status.files_total || status.files_processed),

    imported: safeFitCount(status.imported),

    repaired: safeFitCount(status.repaired),

    skipped: safeFitCount(status.skipped),

    errors: safeFitCount(status.errors),

    files_seen: safeFitCount(status.files_seen),

    skipped_by_filename_date: safeFitCount(status.skipped_by_filename_date),

    parsed_files: safeFitCount(status.parsed_files),

    imported_files: safeFitCount(status.imported_files),

    duplicates_skipped: safeFitCount(status.duplicates_skipped),

  };

}



/** Ошибка проверки папки FIT (400) — показывать модальным окном. */

export function isFitSyncValidationError(err: unknown): boolean {

  return getApiStatus(err) === 400;

}



/** Импорт уже выполняется (409). */

export function isFitImportConflict(err: unknown): boolean {

  return getApiStatus(err) === 409;

}



export function parseFitImportConflict(err: unknown): { message: string; taskId?: string } | null {

  if (!isFitImportConflict(err)) return null;

  if (typeof err === "object" && err !== null && "response" in err) {

    const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;

    if (typeof detail === "object" && detail !== null) {

      const d = detail as { message?: string; task_id?: string };

      return {

        message: typeof d.message === "string" ? d.message : "Импорт FIT уже выполняется",

        taskId: d.task_id,

      };

    }

  }

  return { message: "Импорт FIT уже выполняется" };

}



/** Сообщение об ошибке импорта FIT (400 — текст из detail бэкенда). */

export function parseFitSyncError(err: unknown): string {

  return parseApiError(err);

}



export function formatFitSyncToast(stats: FitSyncStats, variant?: FitSyncToastVariant): string {

  const imported = safeFitCount(stats.imported);

  const repaired = safeFitCount(stats.repaired);

  const skipped = safeFitCount(stats.skipped);

  const errors = safeFitCount(stats.errors);

  const filenameSkipped = safeFitCount(stats.skipped_by_filename_date);

  const parsedFiles = safeFitCount(stats.parsed_files);

  const prefix =
    variant === "error"
      ? "Импорт не выполнен"
      : variant === "warning"
        ? "Импорт с ошибками"
        : "Импорт завершён";

  const parts = [`добавлено ${imported} тренировок`, `обновлено ${repaired}`];

  if (skipped > 0) parts.push(`пропущено ${skipped}`);

  if (filenameSkipped > 0) parts.push(`быстро пропущено ${filenameSkipped}`);

  if (parsedFiles > 0 && parsedFiles < safeFitCount(stats.files)) {
    parts.push(`прочитано FIT ${parsedFiles}`);
  }

  if (errors > 0) parts.push(`ошибок ${errors}`);

  return `${prefix}: ${parts.join(", ")}`;

}



export function formatFitProgressLabel(status: FitSyncTaskStatus): string {

  const total = safeFitCount(status.files_total);

  const done = safeFitCount(status.files_processed);

  const workouts = safeFitCount(status.imported) + safeFitCount(status.repaired);

  const skipped = safeFitCount(status.skipped);

  const errors = safeFitCount(status.errors);

  const filenameSkipped = safeFitCount(status.skipped_by_filename_date);

  const parsedFiles = safeFitCount(status.parsed_files);

  if (total > 0) {

    let label = `Файлов: ${done} / ${total}, тренировок: +${workouts}`;

    if (skipped > 0) label += `, пропущено ${skipped}`;

    if (filenameSkipped > 0) label += `, быстро ${filenameSkipped}`;

    if (parsedFiles > 0 && parsedFiles < total) label += `, прочитано ${parsedFiles}`;

    if (errors > 0) label += `, ошибок ${errors}`;

    return label;

  }

  return "Подготовка импорта…";

}



export interface HealthConnectSyncLogEntry {
  id: number;
  synced_at: string;
  days_count: number;
  saved_days: number;
  errors_count: number;
  payload_preview?: unknown;
  audit?: Record<string, unknown>;
  mobile_audit?: Record<string, unknown>;
  device_label?: string | null;
}

export interface HealthConnectFieldCatalogEntry {
  hc_field: string;
  target_table: string | null;
  target_column: string | null;
  notes?: string;
  analytics_used?: boolean;
  saved_by_backend?: boolean;
  required_permissions?: string[];
}

export interface HealthConnectLastBatch {
  synced_at?: string;
  days_count?: number;
  saved_days?: number;
  errors_count?: number;
  device_label?: string | null;
  payload_preview?: unknown;
  audit?: Record<string, unknown>;
  mobile_audit?: Record<string, unknown>;
}

export interface HealthConnectDebugResponse {
  status: string;
  field_catalog: HealthConnectFieldCatalogEntry[];
  exercise_type_map: Array<Record<string, unknown>>;
  last_sync: HealthConnectSyncLogEntry | null;
  recent_syncs?: HealthConnectSyncLogEntry[];
  last_batch?: HealthConnectLastBatch | null;
  counts_by_type?: Record<string, number>;
  date_ranges?: Record<string, { min: string | null; max: string | null }>;
  saved_by_field?: {
    layer: string;
    counts: Record<string, number>;
    ranges: Record<string, { min?: string | null; max?: string | null }>;
  };
  analytics_usage?: Record<
    string,
    { used: boolean; note?: string; saved_by_backend?: boolean }
  >;
  warnings?: string[];
  sync_endpoint: string;
}

export async function fetchHealthConnectDebug(): Promise<HealthConnectDebugResponse> {
  const { data } = await apiClient.get<HealthConnectDebugResponse>("/sync/health-connect/debug");
  return data;
}

export interface HealthConnectHubOverview {
  last_sync_at?: string | null;
  device_label?: string | null;
  sync_status: "ok" | "partial" | "no_data" | "stale" | string;
  imported_records: number;
  skipped_records: number;
  days_in_batch: number;
  saved_days_in_batch: number;
  permissions: Record<string, boolean>;
  warnings: string[];
}

export interface HealthConnectHubResponse {
  overview: HealthConnectHubOverview;
  steps: {
    has_data: boolean;
    today?: number | null;
    today_source?: string | null;
    week_series: Array<{ date: string; steps: number; source?: string | null }>;
    effective_source?: string | null;
    date_range: { min?: string | null; max?: string | null };
    source_breakdown: Array<Record<string, unknown>>;
    source_breakdown_note?: string | null;
    stale: boolean;
    stale_reason?: string | null;
  };
  sleep: {
    has_data: boolean;
    last_night: {
      date?: string | null;
      hours?: number | null;
      source?: string | null;
      start_time?: string | null;
      end_time?: string | null;
    };
    avg_hours?: number | null;
    consistency_score?: number | null;
    week_nights: Array<{
      date: string;
      start_time?: string | null;
      end_time?: string | null;
      duration_hours: number;
      source?: string | null;
    }>;
    freshness: string;
    stale_warning?: string | null;
  };
  calories: {
    has_data: boolean;
    today_total?: number | null;
    today_active?: number | null;
    today_source?: string | null;
    week_series: Array<{ date: string; total_calories: number; source?: string | null }>;
    sections: Record<string, { label: string; source: string; description: string }>;
    routing_notes: string[];
  };
  workouts: {
    has_data: boolean;
    items: Array<{
      id: number;
      date: string;
      type: string;
      duration_sec: number;
      calories?: number | null;
      source?: string | null;
      avg_hr?: number | null;
      max_hr?: number | null;
      link_status: "linked" | "standalone" | string;
      linked_source?: string | null;
    }>;
    linked_count: number;
    standalone_count: number;
    unlinked_items?: Array<{
      id: number;
      date: string;
      type: string;
      duration_sec: number;
      calories?: number | null;
      source?: string | null;
      link_status: string;
    }>;
    show_unlinked?: boolean;
  };
  heart_rate: {
    has_data: boolean;
    resting_hr_estimate?: number | null;
    daily_hr_min?: number | null;
    daily_hr_max?: number | null;
    sample_count: number;
    source?: string | null;
    incomplete_warning?: string | null;
    hr_skipped_count: number;
  };
  source_routing: {
    rules: Array<{
      metric: string;
      metric_label: string;
      effective: string;
      policy: string;
      fallback?: string | null;
    }>;
  };
  analytics_connected: boolean;
  debug_available: boolean;
}

export async function fetchHealthConnectHub(): Promise<HealthConnectHubResponse> {
  const { data } = await apiClient.get<HealthConnectHubResponse>("/sync/health-connect/hub");
  return data;
}

