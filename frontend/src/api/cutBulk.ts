import { apiClient } from "./client";
import type { CutBulkProgressResponse } from "../modules/nutrition/analytics/types";

/** Входные данные для расчёта сушки/набора (вес + % жира). */
export interface CutBulkSnapshot {
  as_of_date?: string;
  weight_kg: number | null;
  weight_date?: string | null;
  body_metrics_date?: string | null;
  body_fat_percent: number;
  muscle_mass_kg?: number | null;
  lean_mass_kg?: number | null;
  fat_kg?: number | null;
}

export interface CutForecast {
  target_weight_kg: number;
  target_fat_kg: number;
  fat_to_lose_kg: number;
  days?: number | null;
  weeks?: number | null;
  target_date?: string | null;
  progress?: number | null;
  kcal_per_kg_fat: number;
  total_deficit_kcal_start: number;
  daily_loss_kg_fat_start: number;
}

const API_PREFIX = "/nutrition";

export async function fetchCutBulkSnapshot() {
  const { data } = await apiClient.get<CutBulkSnapshot>(`${API_PREFIX}/snapshot`);
  return data;
}

export interface ForecastReadiness {
  ok: boolean;
  filled_weeks: number;
  required_weeks: number;
  min_days_with_intake: number;
  message: string | null;
  weeks: Array<{
    period_start: string;
    period_end: string;
    days_with_intake: number;
    filled: boolean;
  }>;
}

export async function fetchForecastReadiness(phase: "cut" | "bulk") {
  const { data } = await apiClient.get<ForecastReadiness>(`${API_PREFIX}/forecast-readiness`, {
    params: { phase },
  });
  return data;
}

export interface NutritionPlan {
  target_fat_percent?: number | null;
  target_weight_kg?: number | null;
  deficit_calories?: number | null;
  surplus_calories?: number | null;
  gain_rate_kg_per_week?: number | null;
  target_date?: string | null;
  /** Когда цель (вес / % жира) последний раз сохранена в план. */
  updated_at?: string | null;
}

export async function fetchCutBulkPlan(phase: "cut" | "bulk") {
  const { data } = await apiClient.get<NutritionPlan>(`${API_PREFIX}/plan/${phase}`);
  return data;
}

export async function forecastCut(body: { target_fat_percent: number; kcal_per_kg_fat: number }) {
  const { data } = await apiClient.post<CutForecast>(`${API_PREFIX}/cut/forecast`, body);
  return data;
}

export async function forecastBulk(body: {
  target_weight_kg: number;
  gain_kg_per_week: number;
  surplus_calories: number;
}) {
  const { data } = await apiClient.post<Record<string, unknown>>(`${API_PREFIX}/bulk/forecast`, body);
  return data;
}

export async function fetchCutBulkProgress(phase: "cut" | "bulk") {
  const { data } = await apiClient.get<CutBulkProgressResponse>(
    `${API_PREFIX}/analytics/progress`,
    { params: { phase } }
  );
  return data;
}

export interface NutritionForecastResult {
  phase: "cut" | "bulk";
  current_weight_kg: number;
  current_body_fat_percent: number | null;
  average_daily_calorie_intake: number;
  average_daily_expenditure: number;
  daily_surplus_or_deficit: number;
  change_per_week_kg: number;
  weeks_to_target: number;
  target_date: string;
  target_weight_kg: number;
  lookback_days: number;
  balance_period?: "previous_week" | "rolling_7" | "rolling_14";
  balance_period_label?: string;
  balance_from?: string | null;
  balance_to?: string | null;
  target_bulk_grams_per_week?: number | null;
  target_daily_surplus_kcal?: number | null;
  target_body_fat_percent?: number | null;
  target_fat_kg?: number;
  target_lean_mass_kg?: number;
  min_weight_lean_preserved_kg?: number;
  fat_goal_achievable?: boolean | null;
  body_fat_note?: string | null;
  weight_projection: { week: number; date: string; weight_kg: number }[];
  goal_reached?: boolean;
  goal_reached_message?: string | null;
  model?: "dynamic_cut" | "linear";
  approximate?: boolean;
  weeks_log?: DynamicCutWeekLogEntry[];
  linear_weeks_to_target?: number | null;
  weeks_longer_than_linear?: number | null;
  real_avg_deficit_per_day?: number;
  observed_deficit_per_kg_fat?: number;
  max_deficit_per_kg_fat?: number;
  average_real_deficit_per_kg_fat?: number;
  target_deficit_per_kg_fat?: number;
  difference_kcal_per_day?: number;
  days_counted?: number;
  days_missing?: number;
  balance_days?: Array<{
    date: string;
    intake_kcal: number;
    expenditure_kcal: number;
    real_deficit_kcal: number;
    real_deficit_per_kg_fat?: number | null;
    is_complete: boolean;
  }>;
  deficit_over_limit_now?: boolean;
  current_deficit_limit_per_day?: number;
  extra_kcal_per_day?: number;
  deficit_capped_at_start?: boolean;
  dynamic_explanation?: string | null;
  deficit_warning?: string | null;
  deficit_status?: "safe" | "warning" | "danger";
  deficit_over_planned?: boolean;
  deficit_warning_message?: string | null;
  recommended_additional_calories?: number;
  max_physiological_deficit_per_kg_fat?: number;
  current_deficit_limit_safe_kcal?: number;
  current_deficit_limit_physiological_kcal?: number;
}

export interface DynamicCutWeekLogEntry {
  week: number;
  weight_kg: number;
  body_fat_percent: number;
  fat_kg?: number;
  deficit_used: number;
  deficit_projected?: number;
  deficit_limit?: number;
  deficit_limit_safe?: number;
  deficit_limit_physiological?: number;
}

export interface CutDeficitControl {
  ok: boolean;
  error?: string;
  target_deficit_per_kg_fat?: number;
  max_deficit_per_kg_fat?: number;
  fat_kg?: number;
  average_daily_intake?: number;
  average_daily_expenditure?: number;
  real_deficit_kcal?: number;
  average_daily_deficit_kcal?: number;
  real_deficit_per_kg_fat?: number;
  deficit_per_kg_fat?: number;
  target_deficit_kcal_per_day?: number;
  difference_kcal_per_day?: number;
  status?: "within_limit" | "over_limit" | "below_target" | "no_deficit" | string;
  message?: string | null;
  extra_kcal_per_day?: number;
  reduce_kcal_per_day?: number;
  daily_balance_kcal?: number;
  days_counted?: number;
  days_missing?: number;
  period_start?: string;
  period_end?: string;
}

export interface BulkGainControl {
  ok: boolean;
  error?: string;
  target_grams_per_week?: number;
  target_daily_surplus_kcal?: number;
  current_daily_surplus_kcal?: number;
  surplus_difference_kcal?: number;
  status?: "on_target" | "below_target" | "above_target" | string;
  recommendation?: string;
  average_daily_intake?: number;
  average_daily_expenditure?: number;
  daily_balance_kcal?: number;
}

export async function fetchCutDeficitControl(
  preferChest = true,
  maxDeficitPerKgFat?: number,
) {
  const params: Record<string, string | number | boolean> = { prefer_chest: preferChest };
  if (maxDeficitPerKgFat != null) {
    params.max_deficit_per_kg_fat = maxDeficitPerKgFat;
  }
  const { data } = await apiClient.get<CutDeficitControl>(`${API_PREFIX}/cut/deficit-control`, {
    params,
  });
  return data;
}

export async function fetchBulkGainControl(
  preferChest = true,
  targetGramsPerWeek?: number,
) {
  const params: Record<string, string | number | boolean> = { prefer_chest: preferChest };
  if (targetGramsPerWeek != null) {
    params.target_grams_per_week = targetGramsPerWeek;
  }
  const { data } = await apiClient.get<BulkGainControl>(`${API_PREFIX}/bulk/gain-control`, {
    params,
  });
  return data;
}

export async function forecastDynamicCut(body: {
  target_weight_kg?: number | null;
  target_body_fat_percent?: number | null;
  prefer_chest_workout?: boolean;
  balance_period?: "previous_week" | "rolling_7" | "rolling_14";
  persist_plan?: boolean;
  max_deficit_per_kg_fat?: number | null;
}) {
  const { data } = await apiClient.post<NutritionForecastResult>(
    `${API_PREFIX}/forecast/dynamic`,
    { phase: "cut", ...body },
  );
  return data;
}

export async function forecastNutrition(body: {
  phase: "cut" | "bulk";
  target_weight_kg: number;
  target_body_fat_percent?: number | null;
  prefer_chest_workout?: boolean;
  target_bulk_grams_per_week?: number | null;
  balance_period?: "previous_week" | "rolling_7" | "rolling_14";
  persist_plan?: boolean;
}) {
  const { data } = await apiClient.post<NutritionForecastResult>(`${API_PREFIX}/forecast`, body);
  return data;
}

export async function saveCutBulkPlan(body: {
  phase: "cut" | "bulk";
  target_fat_percent?: number;
  deficit_calories?: number;
  target_weight_kg?: number;
  gain_rate_kg_per_week?: number;
  surplus_calories?: number;
  target_date?: string | null;
}) {
  const { data } = await apiClient.post<{ message: string }>(`${API_PREFIX}/plan`, body);
  return data;
}
