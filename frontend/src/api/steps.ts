import { apiClient } from "./client";

export interface StepsHistoryPoint {
  date: string;
  steps: number;
  step_length_m: number | null;
  distance_km: number | null;
  source?: string | null;
}

export interface StepsYearlyTotal {
  year: number;
  total_steps: number;
  months_count: number;
  avg_monthly_steps: number;
}

export interface StepsHistoryResponse {
  items: StepsHistoryPoint[];
  yearly: StepsYearlyTotal[];
  summary: {
    count: number;
    min_date: string | null;
    max_date: string | null;
    latest?: StepsHistoryPoint | null;
    total_steps_all?: number | null;
    avg_monthly_steps?: number | null;
  };
}

export async function fetchStepsHistory(params?: { date_from?: string; date_to?: string }) {
  const { data } = await apiClient.get<StepsHistoryResponse>("/steps/history", { params });
  return data;
}

export interface StepsHistoryUpsertPayload {
  date: string;
  steps: number;
  step_length_m?: number;
  distance_km?: number;
}

export interface StepsHistoryUpsertResponse {
  status: "created" | "updated";
  item: StepsHistoryPoint;
}

export async function upsertStepsHistory(payload: StepsHistoryUpsertPayload) {
  const { data } = await apiClient.post<StepsHistoryUpsertResponse>("/steps/history", payload);
  return data;
}

