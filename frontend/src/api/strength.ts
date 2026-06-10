import { apiClient } from "./client";
import type {
  HeartRateResponse,
  PaginatedResponse,
  StrengthHrAnalysisResponse,
  StrengthHrAnalyticsFilters,
  StrengthProgressPoint,
  StrengthSession,
  StrengthSessionDetail,
  StrengthWorkoutCreate,
} from "../types";

export interface SessionsParams {
  limit: number;
  offset: number;
  date_from?: string;
  date_to?: string;
  workout_title?: string;
  preset_id?: number;
}

export async function fetchSessionsByPreset(
  presetId: number,
  params?: { limit?: number; offset?: number },
) {
  const { data } = await apiClient.get<PaginatedResponse<StrengthSession>>(
    `/strength/sessions/by-preset/${presetId}`,
    { params: { limit: 200, offset: 0, ...params },
  });
  return data;
}

export async function fetchSessions(params: SessionsParams) {
  const { data } = await apiClient.get<PaginatedResponse<StrengthSession>>("/strength/sessions", {
    params,
  });
  return data;
}

export async function fetchSessionDetail(date: string, workoutTitle: string) {
  const { data } = await apiClient.get<StrengthSessionDetail>(
    `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}`,
  );
  return data;
}

export async function fetchStrengthHeartRate(workoutId: number) {
  const { data } = await apiClient.get<HeartRateResponse>(
    `/strength/${workoutId}/heart-rate`,
  );
  return data;
}

export async function fetchStrengthSessionHeartRate(date: string, workoutTitle: string) {
  const { data } = await apiClient.get<HeartRateResponse>(
    `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}/heart-rate`,
  );
  return data;
}

export async function fetchStrengthHrAnalysis(date: string, workoutTitle: string) {
  const path = `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}/hr-analysis`;
  const { data } = await apiClient.get<StrengthHrAnalysisResponse>(path);
  return data;
}

export async function fetchStrengthHrBlockOverrides(date: string, workoutTitle: string) {
  const path = `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}/hr-block-overrides`;
  const { data } = await apiClient.get<import("../types/strengthHrEditor").StrengthHrBlockOverridesResponse>(path);
  return data;
}

export async function saveStrengthHrBlockOverrides(
  date: string,
  workoutTitle: string,
  blocks: import("../types/strengthHrEditor").StrengthHrBlockOverrideItem[],
) {
  const path = `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}/hr-block-overrides`;
  const { data } = await apiClient.put(path, { blocks });
  return data;
}

export async function deleteStrengthHrBlockOverrides(date: string, workoutTitle: string) {
  const path = `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}/hr-block-overrides`;
  const { data } = await apiClient.delete(path);
  return data;
}

export interface StrengthHrAnalyticsSessionsParams extends StrengthHrAnalyticsFilters {
  limit?: number;
  offset?: number;
}

export async function fetchStrengthHrAnalyticsSessions(params: StrengthHrAnalyticsSessionsParams) {
  const { data } = await apiClient.get<{
    items: import("../types").StrengthHrSessionSummary[];
    total: number;
    limit: number;
    offset: number;
  }>("/strength/hr-analytics/sessions", { params });
  return data;
}

export async function fetchStrengthHrAnalyticsSession(date: string, workoutTitle: string) {
  const { data } = await apiClient.get<{
    summary: import("../types").StrengthHrSessionSummary;
    analysis: StrengthHrAnalysisResponse;
    mappings: unknown[];
    meta: Record<string, unknown> | null;
  }>("/strength/hr-analytics/session", {
    params: { date, workout_title: workoutTitle },
  });
  return data;
}

export async function verifyStrengthHrSessionMapping(date: string, workoutTitle: string) {
  const { data } = await apiClient.post<{ mapping_status: string }>(
    "/strength/hr-analytics/session/mapping/verify",
    null,
    { params: { date, workout_title: workoutTitle } },
  );
  return data;
}

export async function deleteStrengthHrSessionMapping(date: string, workoutTitle: string) {
  const { data } = await apiClient.delete("/strength/hr-analytics/session/mapping", {
    params: { date, workout_title: workoutTitle },
  });
  return data;
}

export async function fetchStrengthHrAnalyticsExercises(params: StrengthHrAnalyticsFilters) {
  const { data } = await apiClient.get<{ items: import("../types").StrengthHrExerciseAggregate[] }>(
    "/strength/hr-analytics/exercises",
    { params },
  );
  return data;
}

export async function fetchStrengthHrAnalyticsTrends(params: StrengthHrAnalyticsFilters) {
  const { data } = await apiClient.get<{ items: import("../types").StrengthHrTrendPoint[] }>(
    "/strength/hr-analytics/trends",
    { params },
  );
  return data;
}

export async function fetchStrengthHrAnalyticsOverview(
  params: StrengthHrAnalyticsSessionsParams,
) {
  const { data } = await apiClient.get<import("../types").StrengthHrAnalyticsOverview>(
    "/strength/hr-analytics/overview",
    { params },
  );
  return data;
}

export interface ExerciseCatalogItem {
  id: number;
  name: string;
}

export interface ExerciseCatalogDetailItem extends ExerciseCatalogItem {
  display_name: string;
  is_archived: boolean;
  is_shared?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function fetchExercises() {
  const { data } = await apiClient.get<string[]>("/strength/exercises");
  return data;
}

export async function fetchExerciseCatalog() {
  const { data } = await apiClient.get<ExerciseCatalogDetailItem[]>("/strength/exercises/catalog");
  return data;
}

export async function addStrengthExercise(name: string) {
  const { data } = await apiClient.post<ExerciseCatalogItem>("/strength/exercises", {
    name: name.trim(),
  });
  return data;
}

export async function updateStrengthExercise(id: number, name: string) {
  const { data } = await apiClient.put<ExerciseCatalogItem>(`/strength/exercises/${id}`, {
    name: name.trim(),
  });
  return data;
}

export async function deleteStrengthExercise(id: number) {
  const { data } = await apiClient.delete<{
    id: number;
    name: string;
    action: "deleted" | "archived";
    usage: Record<string, number>;
  }>(`/strength/exercises/${id}`);
  return data;
}

/** Регистрирует новые названия в справочнике; дубликаты игнорируются. */
export async function ensureStrengthExercisesInCatalog(names: string[]): Promise<void> {
  const seen = new Set<string>();
  const tasks: Promise<unknown>[] = [];
  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(addStrengthExercise(n).catch(() => undefined));
  }
  await Promise.all(tasks);
}

export { fetchWorkoutTypes, fetchWorkoutFormPrefill } from "./exercises";

export interface StrengthOneRmChartPoint {
  date: string;
  epley_1rm: number;
}

export type StrengthEquipmentType = "barbell" | "dumbbell" | "unknown";

export interface StrengthNextWorkoutSuggestion {
  should_increase: boolean;
  suggested_increment?: number;
  reason?: string;
  equipment_type?: StrengthEquipmentType;
}

export function formatWeightIncreaseHint(s: StrengthNextWorkoutSuggestion): string {
  if (!s.should_increase || s.suggested_increment == null) return "";
  if (s.equipment_type === "dumbbell") {
    return `Попробуйте увеличить вес на ${s.suggested_increment} кг (на гантель).`;
  }
  return `Попробуйте увеличить вес на ${s.suggested_increment} кг.`;
}

export async function fetchStrengthNextWorkoutSuggestion(params: {
  exercise_name: string;
  workout_title?: string;
}) {
  const { data } = await apiClient.get<StrengthNextWorkoutSuggestion>(
    "/strength/next-workout-suggestion",
    {
      params: {
        exercise_name: params.exercise_name,
        workout_title: params.workout_title,
      },
    },
  );
  return data;
}

export async function fetchStrength1RmChart(params: {
  exercise_name: string;
  date_from?: string;
  date_to?: string;
  include_warmup?: boolean;
}) {
  const { data } = await apiClient.get<StrengthOneRmChartPoint[]>("/strength/1rm-chart", {
    params: {
      exercise_name: params.exercise_name,
      date_from: params.date_from,
      date_to: params.date_to,
      include_warmup: params.include_warmup ?? false,
    },
  });
  return data;
}

export async function fetchExerciseProgress(
  exercise: string,
  date_from?: string,
  date_to?: string,
  include_warmup?: boolean,
) {
  const { data } = await apiClient.get<StrengthProgressPoint[]>(
    `/strength/progress/${encodeURIComponent(exercise)}`,
    { params: { date_from, date_to, include_warmup: include_warmup ?? false } },
  );
  return data;
}

export async function fetchStrengthVolume(
  date_from: string,
  date_to: string,
  include_warmup?: boolean,
) {
  const { data } = await apiClient.get<{ items: { date: string; volume_kg: number }[] }>(
    "/strength/volume",
    { params: { date_from, date_to, include_warmup: include_warmup ?? false } },
  );
  return data.items;
}

export async function createStrengthWorkout(body: StrengthWorkoutCreate) {
  const { data } = await apiClient.post<{ inserted_sets: number; workout_id: number; message: string }>(
    "/strength/workout",
    body,
  );
  return data;
}

export async function deleteStrengthSession(date: string, workoutTitle: string) {
  await apiClient.delete(
    `/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}`,
  );
}
