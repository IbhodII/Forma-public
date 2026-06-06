import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBodyMetric,
  deleteBodyMetric,
  fetchBodyMetrics,
  fetchBodyMetricsSummary,
  type MetricsParams,
} from "../api/body";
import { queryKeys } from "./queryKeys";
import type { BodyMetricRow } from "../types";
import type { BodyChartPeriod } from "../utils/bodyMetrics";
import { chartPeriodToRange } from "../utils/bodyMetrics";

function filterRowsByChartPeriod(
  items: BodyMetricRow[],
  period: BodyChartPeriod,
): BodyMetricRow[] {
  const range = chartPeriodToRange(period);
  if (!range.date_from) return items;
  const from = range.date_from;
  const to = range.date_to ?? new Date().toISOString().slice(0, 10);
  return items.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return d >= from && d <= to;
  });
}

export const BODY_HISTORY_PAGE_SIZE = 10;
export const BODY_CHART_FETCH_LIMIT = 2000;

/** Сводка: последнее значение каждой метрики (может быть с разных дат). */
export function useBodyMetricsSummary() {
  return useQuery({
    queryKey: queryKeys.bodySummary,
    queryFn: fetchBodyMetricsSummary,
  });
}

export function useBodyHistory(offset: number) {
  const params: MetricsParams = {
    limit: BODY_HISTORY_PAGE_SIZE,
    offset,
    body_measurements_only: true,
  };
  return useQuery({
    queryKey: queryKeys.bodyMetrics(params),
    queryFn: () => fetchBodyMetrics(params),
  });
}

/** Данные для графиков (ленивая загрузка через enabled). */
export function useBodyChartSeries(
  period: BodyChartPeriod,
  enabled: boolean,
  options?: { controlDayOnly?: boolean },
) {
  const controlDayOnly = options?.controlDayOnly ?? false;
  const range = chartPeriodToRange(period);
  const params: MetricsParams = {
    limit: BODY_CHART_FETCH_LIMIT,
    offset: 0,
    ...(controlDayOnly ? { control_day_only: true } : range),
  };
  return useQuery({
    queryKey: queryKeys.bodyMetrics({
      ...params,
      scope: "chart",
      period,
      controlDayOnly,
    }),
    queryFn: async () => {
      const data = await fetchBodyMetrics(params);
      if (!controlDayOnly) return data;
      const items = filterRowsByChartPeriod(data.items, period);
      return {
        ...data,
        items,
        meta: { ...data.meta, total: items.length },
      };
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useInvalidateBodyMetrics() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["body"] });
  };
}

export function useSaveBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBodyMetric,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["body"] });
      void qc.invalidateQueries({ queryKey: queryKeys.weight });
    },
  });
}

export function useDeleteBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBodyMetric,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["body"] });
      void qc.invalidateQueries({ queryKey: queryKeys.weight });
    },
  });
}
