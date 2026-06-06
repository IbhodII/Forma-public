import { apiClient } from "./client";

export type PassiveHeartRateDaily = {
  date: string;
  sample_count: number;
  avg_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  resting_hr: number | null;
};

export type PassiveHeartRateTimelinePoint = {
  time: string;
  bpm: number;
  source: string;
};

export type PassiveHeartRateHcGate = {
  allowed: boolean;
  enabled: boolean;
  fresh: boolean;
  stale_warning: string | null;
};

export async function fetchPassiveHeartRateDaily(date_from: string, date_to: string) {
  const { data } = await apiClient.get<{
    days: PassiveHeartRateDaily[];
    hc_gate?: PassiveHeartRateHcGate;
  }>("/analytics/passive-heart-rate/daily", {
    params: { date_from, date_to },
  });
  return data;
}

export async function fetchPassiveHeartRateTimeline(date: string, limit = 2000) {
  const { data } = await apiClient.get<{
    date: string;
    count: number;
    points: PassiveHeartRateTimelinePoint[];
  }>("/analytics/passive-heart-rate/timeline", {
    params: { date, limit },
  });
  return data;
}
