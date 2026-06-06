import { apiClient } from "./client";
import type { CaloriesAnalyticsRow, CtlAtlTsbResponse } from "../types";

export async function fetchCaloriesAnalytics(date_from: string, date_to: string) {
  const { data } = await apiClient.get<{ items: CaloriesAnalyticsRow[] }>("/analytics/calories", {
    params: { date_from, date_to },
  });
  return data.items;
}

export async function fetchCtlAtlTsb(days = 90) {
  const { data } = await apiClient.get<CtlAtlTsbResponse>("/analytics/ctl", { params: { days } });
  return data;
}

export interface WorkoutExpenditureDay {
  date: string;
  calories_watch_sum: number;
  calories_chest_sum: number;
  calories_hr_sum: number;
}

export async function fetchWorkoutExpenditure(dateFrom: string, dateTo: string) {
  const { data } = await apiClient.get<{ items: WorkoutExpenditureDay[] }>(
    "/analytics/workout-expenditure",
    { params: { from: dateFrom, to: dateTo } },
  );
  return data.items;
}

export interface DailyBraceletCalories {
  date: string;
  total_calories: number;
  source?: string | null;
  updated_at?: string | null;
}

export async function fetchDailyBraceletCalories(dateFrom: string, dateTo: string) {
  const { data } = await apiClient.get<{ items: DailyBraceletCalories[] }>(
    "/analytics/daily-bracelet-calories",
    { params: { from: dateFrom, to: dateTo } },
  );
  return data.items;
}

export async function saveDailyBraceletCalories(body: {
  date: string;
  total_calories: number;
  source?: string;
}) {
  const { data } = await apiClient.post<DailyBraceletCalories>(
    "/analytics/daily-bracelet-calories",
    body,
  );
  return data;
}

export interface DailyExpenditure {
  date: string;
  bmr: number | null;
  tef: number;
  bracelet_total: number | null;
  bracelet_source?: string | null;
  watch_total: number;
  chest_total: number;
  chest_raw_total?: number;
  workout_effective_total: number;
  corrected_activity: number | null;
  total_expenditure: number | null;
  needs_bracelet_input: boolean;
  calculation_mode: "bracelet" | "fallback";
  prefer_chest: boolean;
  has_fallback?: boolean;
  fallback_used_for?: string[];
  hc_analytics_enabled?: boolean;
  hc_stale?: boolean;
  hc_stale_warning?: string | null;
}

export async function fetchDailyExpenditure(
  date: string,
  phase: "cut" | "bulk",
  opts?: { preferChest?: boolean; braceletCalories?: number | null },
) {
  const params: Record<string, string | number | boolean> = {
    date,
    phase,
    prefer_chest: opts?.preferChest ?? true,
  };
  if (opts?.braceletCalories != null && opts.braceletCalories > 0) {
    params.bracelet_calories = opts.braceletCalories;
  }
  const { data } = await apiClient.get<DailyExpenditure>("/analytics/daily-expenditure", {
    params,
  });
  return data;
}

export interface WeekDailyExpenditure {
  items: DailyExpenditure[];
  days_with_bracelet: number;
  days_without_bracelet: number;
  total_corrected_expenditure: number | null;
}

export async function fetchWeekDailyExpenditure(
  anchorDate: string,
  phase: "cut" | "bulk",
  preferChest = true,
) {
  const { data } = await apiClient.get<WeekDailyExpenditure>(
    "/analytics/daily-expenditure/week",
    { params: { anchor_date: anchorDate, phase, prefer_chest: preferChest } },
  );
  return data;
}
