import { apiClient } from "./client";

export interface DailyWeightRow {
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
}

export interface WeeklyWeightRow {
  week_start: string;
  week_label: string;
  weight_kg: number | null;
  body_fat_percent: number | null;
  fat_mass_kg: number | null;
  lean_mass_kg: number | null;
  days: number;
}

export interface WeightDashboard {
  items: DailyWeightRow[];
  weekly: WeeklyWeightRow[];
  current_week: Record<string, number | null>;
}

export async function fetchWeightDashboard() {
  const { data } = await apiClient.get<WeightDashboard>("/weight/daily");
  return data;
}

export async function fetchWeightOverview(days = 30) {
  const { data } = await apiClient.get<WeightDashboard & { days?: number }>(
    "/weight/daily/overview",
    { params: { days } },
  );
  return data;
}

export async function saveDailyWeight(body: {
  date: string;
  weight_kg: number;
  body_fat_percent?: number | null;
  only_weight: boolean;
}) {
  const { data } = await apiClient.post<{ message: string }>("/weight/daily", body);
  return data;
}
