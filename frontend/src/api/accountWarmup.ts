import { apiClient } from "./client";

export const WARMUP_STATUS_TIMEOUT_MS = 15_000;
const shortWarmupRequest = { timeout: WARMUP_STATUS_TIMEOUT_MS };

export type WarmupMode = "light" | "full";

export type WarmupTaskStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type WarmupStageStatus = {
  id: string;
  label: string;
  status: string;
  elapsed_ms: number;
  detail?: string | null;
};

export type AccountWarmupStatus = {
  task_id: string;
  status: WarmupTaskStatus;
  phase: string;
  current: number;
  total: number;
  stage: string;
  currentSection?: string;
  percent: number;
  message: string;
  error?: string | null;
  elapsed_sec: number;
  stages: WarmupStageStatus[];
  warnings: string[];
  processed_units?: number;
  total_units?: number;
  processed?: number;
  lastHeartbeatAt?: string | null;
  summary?: {
    mode: WarmupMode;
    stages: WarmupStageStatus[];
    warnings: string[];
    total_elapsed_ms: number;
    workout_visibility?: Record<string, unknown>;
    verification?: {
      ok?: boolean;
      checks?: Array<{ label: string; ok?: boolean; error?: string }>;
    };
  } | null;
};

export type AccountWarmupCurrent = {
  status: "idle" | "running";
  task_id?: string | null;
  task?: AccountWarmupStatus | null;
};

export async function fetchAccountWarmupCurrent(): Promise<AccountWarmupCurrent> {
  const { data } = await apiClient.get<AccountWarmupCurrent>(
    "/account/warmup/current",
    shortWarmupRequest,
  );
  return data;
}

export async function cancelAccountWarmup(): Promise<void> {
  await apiClient.post("/account/warmup/cancel", undefined, shortWarmupRequest);
}

export async function startAccountWarmup(
  mode: WarmupMode = "full",
  includeVacuum = false,
  resume = true,
): Promise<{ task_id: string }> {
  const { data } = await apiClient.post<{ task_id: string; job_id?: string }>(
    `/account/warmup/start?mode=${mode}&include_vacuum=${includeVacuum ? "true" : "false"}&resume=${resume ? "true" : "false"}`,
    undefined,
    shortWarmupRequest,
  );
  return { task_id: data.job_id || data.task_id };
}

export async function fetchAccountWarmupStatus(taskId: string): Promise<AccountWarmupStatus> {
  const { data } = await apiClient.get<AccountWarmupStatus>(
    `/account/warmup/status/${taskId}`,
    shortWarmupRequest,
  );
  return data;
}
