import { apiClient } from "./client";
import type { DailyTrimpPoint, ZoneTimeResponse } from "../types";

export async function fetchDailyTrimp(date_from: string, date_to: string) {
  const { data } = await apiClient.get<{ items: DailyTrimpPoint[] }>("/cardio/trimp", {
    params: { date_from, date_to },
  });
  return data.items;
}

export async function fetchZoneTime(days = 30, workoutType?: string) {
  const { data } = await apiClient.get<ZoneTimeResponse>("/cardio/zone-time", {
    params: { days, type: workoutType || undefined },
  });
  return data;
}
