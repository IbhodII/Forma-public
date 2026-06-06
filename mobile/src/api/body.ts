import {apiFetch} from './client';
import {
  cacheBodyMetricsResponse,
  cacheBodyMetricRow,
  enqueueBodyMetric,
  enqueueBodyMetricDelete,
  getCachedBodyMetrics,
  getCachedBodyLatest,
} from '../database/bodyStore';
import {isOnline} from '../services/network';
import {localFirstWrite} from '../sync/localFirstWrite';
import type {
  BodyMetricCreatePayload,
  BodyMetricRow,
  BodyMetricsResponse,
  WeightDailyResponse,
} from '../types/body';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export type GeneticLimit = {
  status: 'ok' | 'no_height' | 'no_body' | string;
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
};

export async function fetchGeneticLimit(): Promise<GeneticLimit> {
  return jsonOrThrow<GeneticLimit>(await apiFetch('/api/body/genetic-limit'));
}

export async function fetchBodyLatest() {
  if (await isOnline()) {
    try {
      const res = await apiFetch('/api/body/latest');
      const row = await jsonOrThrow<BodyMetricRow>(res);
      await cacheBodyMetricRow(row);
      return row;
    } catch {
      // fallback to cache
    }
  }
  return getCachedBodyLatest();
}

export async function fetchBodyMetrics(params?: {
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
}) {
  if (await isOnline()) {
    try {
      const sp = new URLSearchParams();
      if (params?.limit != null) sp.set('limit', String(params.limit));
      if (params?.offset != null) sp.set('offset', String(params.offset));
      if (params?.date_from) sp.set('date_from', params.date_from);
      if (params?.date_to) sp.set('date_to', params.date_to);
      const suffix = sp.toString() ? `?${sp.toString()}` : '';
      const res = await apiFetch(`/api/body/metrics${suffix}`);
      const data = await jsonOrThrow<BodyMetricsResponse>(res);
      await cacheBodyMetricsResponse(data);
      return data;
    } catch {
      const items = await getCachedBodyMetrics();
      return {
        items,
        meta: {total: items.length, limit: params?.limit ?? 100, offset: params?.offset ?? 0},
      };
    }
  }
  const items = await getCachedBodyMetrics();
  return {
    items,
    meta: {total: items.length, limit: params?.limit ?? 100, offset: params?.offset ?? 0},
  };
}

export async function createBodyMetric(body: BodyMetricCreatePayload) {
  return localFirstWrite({
    persist: async () => {
      await enqueueBodyMetric(body);
      return {status: 'ok'};
    },
  });
}

export async function deleteBodyMetric(date: string) {
  return localFirstWrite({
    persist: async () => {
      await enqueueBodyMetricDelete(date);
      return {status: 'ok'};
    },
  });
}

export async function fetchWeightDaily() {
  const res = await apiFetch('/api/weight/daily');
  return jsonOrThrow<WeightDailyResponse>(res);
}

export async function saveWeightDaily(body: {
  date: string;
  weight_kg: number;
  body_fat_percent?: number | null;
  only_weight?: boolean;
}) {
  const res = await apiFetch('/api/weight/daily', {
    method: 'POST',
    body: JSON.stringify({
      date: body.date,
      weight_kg: body.weight_kg,
      body_fat_percent: body.body_fat_percent ?? null,
      only_weight: body.only_weight ?? false,
    }),
  });
  return jsonOrThrow<{message: string}>(res);
}
