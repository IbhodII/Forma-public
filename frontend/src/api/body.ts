import { apiClient } from "./client";
import type { BodyMetricCreate, BodyMetricRow, PaginatedResponse } from "../types";

export interface MetricsParams {
  limit: number;
  offset: number;
  date_from?: string;
  date_to?: string;
  control_day_only?: boolean;
  body_measurements_only?: boolean;
}

export interface BodyMetricPoint {
  value: number;
  date: string;
  previous_value?: number;
  previous_date?: string;
}

export interface BodyMetricsSummary {
  metrics: Partial<
    Record<
      "weight_kg" | "body_fat_percent" | "muscle_mass_kg" | "waist_cm" | "hips_cm",
      BodyMetricPoint
    >
  >;
}

export interface GeneticLimit {
  status: "ok" | "no_height" | "no_body" | string;
  message?: string | null;
  lean_mass?: number | null;
  max_lean_mass?: number | null;
  percent?: number | null;
  remaining_kg?: number | null;
  measurement_date?: string | null;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  weight_date?: string | null;
  body_fat_date?: string | null;
  disclaimer: string;
  ffmi_limit?: number;
  interpretation?: string | null;
  level?: string | null;
}

export async function fetchGeneticLimit() {
  const { data } = await apiClient.get<GeneticLimit>("/body/genetic-limit");
  return data;
}

export async function fetchBodyMetricsSummary() {
  const { data } = await apiClient.get<BodyMetricsSummary>("/body/summary");
  return data;
}

export async function fetchBodyMetrics(params: MetricsParams) {
  const { data } = await apiClient.get<PaginatedResponse<BodyMetricRow>>("/body/metrics", {
    params,
  });
  return data;
}

export interface BodyFieldReference {
  fields: Partial<Record<string, number>>;
  field_dates: Partial<Record<string, string>>;
}

export async function fetchBodyFieldReference() {
  const { data } = await apiClient.get<BodyFieldReference>("/body/field-reference");
  return data;
}

export async function fetchLatestBody() {
  const { data } = await apiClient.get<BodyMetricRow>("/body/latest");
  return data;
}

export async function createBodyMetric(body: BodyMetricCreate) {
  const { data } = await apiClient.post<{ status: string }>("/body/metrics", body);
  return data;
}

export async function deleteBodyMetric(date: string) {
  const { data } = await apiClient.delete<{ status: string }>(
    `/body/metrics/${encodeURIComponent(date.slice(0, 10))}`,
  );
  return data;
}

export interface BodyWeeklyRow {
  week_start: string;
  week_label: string;
  weight_kg: number | null;
  body_fat_percent: number | null;
  muscle_mass_kg: number | null;
  count: number;
}

export interface BodyWeeklyResponse {
  weekly: BodyWeeklyRow[];
  current_week: Partial<BodyWeeklyRow>;
}

export async function fetchBodyWeekly(params?: { date_from?: string; date_to?: string }) {
  const { data } = await apiClient.get<BodyWeeklyResponse>("/body/metrics/weekly", { params });
  return data;
}

/** Все замеры за период (для детализации по неделям на клиенте). */
export async function fetchAllBodyMetrics(params?: { date_from?: string; date_to?: string }) {
  return fetchBodyMetrics({ limit: 5000, offset: 0, ...params });
}
