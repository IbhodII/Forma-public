import { apiClient } from "./client";

export interface SleepSummary {
  has_data: boolean;
  days: number;
  last_night_hours: number | null;
  last_night_date: string | null;
  avg_hours: number | null;
  consistency_score: number | null;
  source: string | null;
  nights_count: number;
  hc_analytics_enabled?: boolean;
  hc_stale?: boolean;
  hc_stale_warning?: string | null;
  sleep_debt_hours?: number | null;
}

export async function fetchSleepSummary(days = 7): Promise<SleepSummary> {
  const { data } = await apiClient.get<SleepSummary>("/sleep/summary", {
    params: { days },
  });
  return data;
}
