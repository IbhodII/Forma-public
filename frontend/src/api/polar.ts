import { getUserIdHeader } from "../auth/session";
import { apiClient } from "./client";
import { getApiStatus } from "../utils/validation";
import { resolveApiBaseUrl, resolveApiOrigin } from "./runtimeBaseUrl";

export type PolarConnectionStatus = {
  connected: boolean;
  local_user_id: number;
  polar_user_id?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
};

export async function fetchPolarConnectionStatus(): Promise<PolarConnectionStatus> {
  const { data } = await apiClient.get<PolarConnectionStatus>("/polar/status");
  return data;
}

export async function disconnectPolar(): Promise<void> {
  await apiClient.delete("/polar/disconnect");
}

/** OAuth popup из настроек — привязка к текущему локальному профилю. */
export function polarAuthPopupUrl(linkUserId?: number): string {
  const base = resolveApiBaseUrl();
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const params = new URLSearchParams();
  const uid = linkUserId ?? Number(getUserIdHeader());
  if (Number.isFinite(uid) && uid >= 1) params.set("link_user", String(uid));
  const origin = resolveApiOrigin();
  if (origin) params.set("redirect_base", origin);
  const qs = params.toString();
  return `${prefix}polar/auth${qs ? `?${qs}` : ""}`;
}

export interface PolarPendingWorkout {
  id: number;
  polar_transaction_id: string;
  date: string | null;
  type: string | null;
  duration_sec: number | null;
  distance_km: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  imported: number;
}

/** Элемент списка GET /api/polar/pending/list */
export interface PolarPendingListItem {
  polar_transaction_id: string;
  date: string | null;
  type: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  calories: number | null;
  is_manual_upload?: boolean;
}

export interface PolarPendingListResponse {
  items: PolarPendingListItem[];
  total: number;
}

export interface PolarAttachResponse {
  message: string;
  hr_samples: number;
  has_hr_chart: boolean;
  gps_saved: boolean;
  fields_updated: boolean;
  hr_samples_received?: number;
  hr_samples_parsed?: number;
  hr_samples_inserted?: number;
  hr_parser_source?: string | null;
  scalar_fields_updated?: boolean;
  warnings?: string[];
}

export async function fetchPolarPending(date: string, type: string) {
  const { data } = await apiClient.get<PolarPendingWorkout>(`/polar/pending/${date}`, {
    params: { type },
  });
  return data;
}

export async function fetchPolarPendingList() {
  const { data } = await apiClient.get<PolarPendingListResponse>("/polar/pending/list");
  return data;
}

export async function deletePolarPending(polarTransactionId: string) {
  const { data } = await apiClient.delete<{ message: string }>("/polar/pending", {
    params: { polar_transaction_id: polarTransactionId },
  });
  return data;
}

export function isPolarManualUpload(item: Pick<PolarPendingListItem, "polar_transaction_id" | "is_manual_upload">): boolean {
  return item.is_manual_upload ?? item.polar_transaction_id.startsWith("upload:");
}

export async function attachPolarToCardio(workoutId: number, polarTransactionId: string) {
  const { data } = await apiClient.post<PolarAttachResponse>(
    `/cardio/${workoutId}/attach-polar`,
    { polar_transaction_id: polarTransactionId },
  );
  return data;
}

export async function attachPolarToStrength(workoutId: number, polarTransactionId: string) {
  const { data } = await apiClient.post<PolarAttachResponse>(
    `/strength/${workoutId}/attach-polar`,
    { polar_transaction_id: polarTransactionId },
  );
  return data;
}

export function isPolarPendingNotFound(err: unknown): boolean {
  return getApiStatus(err) === 404;
}

export function isPolarStrengthType(type: string | null | undefined): boolean {
  return type === "силовая";
}

export function isPolarCardioType(type: string | null | undefined): boolean {
  return type != null && type !== "силовая";
}
