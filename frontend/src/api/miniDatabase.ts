import { apiClient } from "./client";

export type MiniDbCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string | null;
  error?: string | null;
};

export type MiniDbBuildReport = {
  ok: boolean;
  user_id: number;
  source_workouts_bytes: number;
  source_shared_bytes: number;
  workouts_bytes: number;
  shared_bytes: number;
  zip_bytes: number;
  row_counts: Record<string, number>;
  strength_sessions: Array<{ date: string; workout_title: string }>;
  checks: MiniDbCheck[];
  errors: string[];
};

export type MiniDbBuildResponse = {
  export_id: string;
  ok: boolean;
  report: MiniDbBuildReport;
  download_filename: string;
  message: string;
};

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function buildMiniDatabase(): Promise<MiniDbBuildResponse> {
  const { data } = await apiClient.post<MiniDbBuildResponse>(
    "/database/mini-db/build",
    undefined,
    { timeout: 120_000 },
  );
  return data;
}

export async function downloadMiniDatabaseResult(
  exportId: string,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/database/mini-db/result/${encodeURIComponent(exportId)}`,
    { responseType: "blob", timeout: 120_000 },
  );
  triggerBlobDownload(data, filename);
}
