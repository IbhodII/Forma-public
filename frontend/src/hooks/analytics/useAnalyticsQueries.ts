import { useQuery } from "@tanstack/react-query";
import { fetchCtlAtlTsb } from "../../api/analytics";
import { fetchZoneTime, fetchDailyTrimp } from "../../api/cardioAnalytics";
import {
  fetchPassiveHeartRateDaily,
  fetchPassiveHeartRateTimeline,
} from "../../api/passiveHeartRate";
import { fetchSleepSummary } from "../../api/sleep";
import { queryKeys } from "../queryKeys";

export function useCtlAtlTsbQuery(days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.ctlAtlTsb(days),
    queryFn: () => fetchCtlAtlTsb(days),
    enabled,
  });
}

export function useDailyTrimpQuery(
  from: string,
  to: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.dailyTrimp(from, to),
    queryFn: () => fetchDailyTrimp(from, to),
    enabled: enabled && Boolean(from && to),
  });
}

export function useZoneTimeQuery(
  days: number,
  workoutType: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.zoneTime(days, workoutType),
    queryFn: () => fetchZoneTime(days, workoutType || undefined),
    enabled,
  });
}

export function usePassiveHrDailyQuery(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.passiveHeartRateDaily(from, to),
    queryFn: () => fetchPassiveHeartRateDaily(from, to),
    enabled: enabled && Boolean(from && to),
  });
}

export function usePassiveHrTimelineQuery(date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.passiveHeartRateTimeline(date),
    queryFn: () => fetchPassiveHeartRateTimeline(date),
    enabled: enabled && Boolean(date),
  });
}

export function useSleepSummaryQuery(days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sleepSummary(days),
    queryFn: () => fetchSleepSummary(days),
    enabled,
  });
}
