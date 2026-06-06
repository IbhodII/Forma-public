import type {BodyMetricRow, WeightDailyResponse} from '../types/body';
import {fetchBodyLatest, fetchBodyMetrics, fetchWeightDaily} from '../api/body';
import {getCachedBodyLatest, getCachedBodyMetrics} from '../database/bodyStore';
import {requiresPcApi, type OperatingMode} from '../mode/operatingMode';

export async function getBodyLatestLocalFirst(opts: {
  mode: OperatingMode;
  apiReachable: boolean;
}): Promise<BodyMetricRow | null> {
  if (!requiresPcApi(opts.mode)) {
    return getCachedBodyLatest();
  }
  if (opts.apiReachable) {
    try {
      return await fetchBodyLatest();
    } catch {
      return getCachedBodyLatest();
    }
  }
  return getCachedBodyLatest();
}

export async function getBodyMetricsLocalFirst(opts: {
  mode: OperatingMode;
  apiReachable: boolean;
}): Promise<BodyMetricRow[]> {
  if (!requiresPcApi(opts.mode)) {
    return getCachedBodyMetrics();
  }
  if (opts.apiReachable) {
    try {
      const data = await fetchBodyMetrics({limit: 120, offset: 0});
      return data.items;
    } catch {
      return getCachedBodyMetrics();
    }
  }
  return getCachedBodyMetrics();
}

function weightDailyFromCache(rows: BodyMetricRow[]): WeightDailyResponse {
  const items = rows
    .filter(r => r.weight_kg != null)
    .map(r => ({
      date: r.date,
      weight_kg: r.weight_kg!,
      body_fat_percent: r.body_fat_percent ?? null,
    }));
  return {items};
}

export async function getWeightDailyLocalFirst(opts: {
  mode: OperatingMode;
  apiReachable: boolean;
}): Promise<WeightDailyResponse> {
  if (!requiresPcApi(opts.mode)) {
    return weightDailyFromCache(await getCachedBodyMetrics());
  }
  if (opts.apiReachable) {
    try {
      return await fetchWeightDaily();
    } catch {
      return weightDailyFromCache(await getCachedBodyMetrics());
    }
  }
  return weightDailyFromCache(await getCachedBodyMetrics());
}
