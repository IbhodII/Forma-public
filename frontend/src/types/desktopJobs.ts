export type DatabaseWarmupJobStatus = {
  task_id: string;
  job_id?: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  phase: string;
  current: number;
  total: number;
  stage: string;
  currentSection?: string;
  percent: number;
  message: string;
  error?: string | null;
  elapsed_sec: number;
  processed?: number;
  processed_units?: number;
  total_units?: number;
  lastHeartbeatAt?: string | null;
  stages: Array<{
    id: string;
    label: string;
    status: string;
    elapsed_ms: number;
    detail?: string | null;
  }>;
  warnings: string[];
  summary?: {
    mode: string;
    stages: Array<{
      id: string;
      label: string;
      status: string;
      elapsed_ms: number;
      detail?: string | null;
    }>;
    warnings: string[];
    total_elapsed_ms: number;
    workout_visibility?: Record<string, unknown>;
  } | null;
};

export type DatabaseImportJobStatus = {
  job_id: string;
  task_id: string;
  status: "pending" | "running" | "completed" | "failed";
  stage: string;
  progressPercent: number;
  processed: number;
  total: number;
  message: string;
  error?: string | null;
  report?: Record<string, unknown> | null;
  backendRestartError?: string;
  started_at?: string | null;
  last_progress_at?: string | null;
  recommended_mode?: "merge" | "replace" | null;
};
