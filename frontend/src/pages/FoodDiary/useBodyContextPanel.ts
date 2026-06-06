import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CutBulkSnapshot } from "../../api/cutBulk";
import { fetchAllBodyMetrics, fetchBodyMetricsSummary } from "../../api/body";
import type { FoodPhase } from "../../api/food";
import { fetchUserProfile } from "../../api/user";
import { queryKeys } from "../../hooks/queryKeys";
import {
  FORECAST_BALANCE_DAYS_BACK,
  rollingBalanceDatesThroughYesterday,
} from "../../shared/utils/rollingBalancePeriod";
import type { BodyMetricRow } from "../../types";

export type BodyStatTrend = {
  diff: number | null;
  label: string;
  tone: "up" | "down" | "neutral";
};

export type BodyStatItem = {
  key: string;
  label: string;
  value: string;
  subValue?: string;
  trend: BodyStatTrend;
  sparkline: number[];
  sparkColor: string;
  sparkEmptyHint?: string;
  tooltip?: string;
};

function rowDate(r: BodyMetricRow): string | null {
  const d = r.date;
  if (typeof d !== "string" || !d) return null;
  return d.slice(0, 10);
}

function rowsInRange(rows: BodyMetricRow[], from: string, to: string) {
  return rows.filter((r) => {
    const d = rowDate(r);
    return d != null && d >= from && d <= to;
  });
}

function seriesForField(rows: BodyMetricRow[], field: string): number[] {
  return rows
    .filter((r) => {
      const v = r[field];
      return typeof v === "number" && Number.isFinite(v);
    })
    .sort((a, b) => (rowDate(a) ?? "").localeCompare(rowDate(b) ?? ""))
    .map((r) => Number(r[field]));
}

function weekTrend(
  series: number[],
  phase: FoodPhase,
  metric: "weight" | "fat" | "lean" | "neutral",
): BodyStatTrend {
  if (series.length < 2) {
    return { diff: null, label: "—", tone: "neutral" };
  }
  const first = series[0];
  const last = series[series.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return { diff: null, label: "—", tone: "neutral" };
  }
  const diff = Math.round((last - first) * 10) / 10;
  if (!Number.isFinite(diff)) {
    return { diff: null, label: "—", tone: "neutral" };
  }
  if (Math.abs(diff) < 0.05) {
    return { diff: 0, label: "стабильно", tone: "neutral" };
  }
  const arrow = diff > 0 ? "↑" : "↓";
  const label = `${arrow} ${diff > 0 ? "+" : ""}${diff}`;

  let tone: BodyStatTrend["tone"] = diff > 0 ? "up" : "down";
  if (metric === "weight") {
    if (phase === "cut") tone = diff < 0 ? "down" : "up";
    else tone = diff > 0 ? "up" : "down";
  } else if (metric === "fat") {
    if (phase === "cut") tone = diff < 0 ? "down" : "up";
    else tone = "neutral";
  } else if (metric === "lean") {
    if (phase === "bulk") tone = diff > 0 ? "up" : "down";
    else tone = diff < 0 ? "up" : "down";
  }

  return { diff, label, tone };
}

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function usableSparkline(series: number[]): number[] {
  if (series.length < 2) return [];
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (max - min < 0.01) return [];
  return series;
}

const SPARKLINE_HINT = `мало данных за ${FORECAST_BALANCE_DAYS_BACK} дн.`;

function seriesOrHint(series: number[]): { sparkline: number[]; hint?: string } {
  const sparkline = usableSparkline(series);
  if (sparkline.length >= 2) return { sparkline };
  return { sparkline: [], hint: SPARKLINE_HINT };
}

export function useBodyContextPanel(
  phase: FoodPhase,
  snap: CutBulkSnapshot | null | undefined,
  goalLabel?: string | null,
) {
  const sparkPeriod = useMemo(() => rollingBalanceDatesThroughYesterday(), []);

  const summaryQuery = useQuery({
    queryKey: ["body", "summary"],
    queryFn: fetchBodyMetricsSummary,
    staleTime: 60_000,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
    staleTime: 120_000,
  });

  const sparkMetricsQuery = useQuery({
    queryKey: ["body", "metrics", "spark", sparkPeriod.start, sparkPeriod.end],
    queryFn: () =>
      fetchAllBodyMetrics({ date_from: sparkPeriod.start, date_to: sparkPeriod.end }),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const summary = summaryQuery.data;
    const rows = sparkMetricsQuery.data?.items ?? [];
    const periodRows = rowsInRange(rows, sparkPeriod.start, sparkPeriod.end);

    const weightSeries = seriesForField(periodRows, "weight_kg");
    const fatSeries = seriesForField(periodRows, "body_fat_percent");

    const weight =
      snap?.weight_kg ??
      summary?.metrics?.weight_kg?.value ??
      (weightSeries.length ? weightSeries[weightSeries.length - 1] : null);
    const fatPct =
      snap?.body_fat_percent ??
      summary?.metrics?.body_fat_percent?.value ??
      (fatSeries.length ? fatSeries[fatSeries.length - 1] : null);

    let lean =
      snap?.lean_mass_kg ??
      (weight != null && fatPct != null ? weight - (weight * fatPct) / 100 : null);

    const heightCm = profileQuery.data?.height_cm;
    let bmi: number | null = null;
    if (weight != null && heightCm != null && heightCm > 0) {
      const hm = heightCm / 100;
      bmi = Math.round((weight / (hm * hm)) * 10) / 10;
    }

    let ffmi: number | null = null;
    if (lean != null && heightCm != null && heightCm > 0) {
      const hm = heightCm / 100;
      ffmi = Math.round((lean / (hm * hm)) * 10) / 10;
    }

    const waist = summary?.metrics?.waist_cm?.value;
    const waterEst =
      lean != null && lean > 0 ? Math.round(lean * 0.73 * 10) / 10 : null;

    const goal =
      goalLabel?.trim() || (phase === "cut" ? "Сушка" : "Набор");

    const lastUpdated =
      formatUpdated(snap?.weight_date) ??
      formatUpdated(snap?.body_metrics_date) ??
      formatUpdated(summary?.metrics?.weight_kg?.date);

    const stats: BodyStatItem[] = [];

    if (weight != null) {
      const weightSpark = seriesOrHint(weightSeries);
      stats.push({
        key: "weight",
        label: "Вес",
        value: `${weight.toFixed(1)}`,
        subValue: "кг",
        trend: weekTrend(weightSeries, phase, "weight"),
        sparkline: weightSpark.sparkline,
        sparkEmptyHint: weightSpark.hint,
        sparkColor: "#22C55E",
        tooltip: `Текущий вес и изменение за последние ${FORECAST_BALANCE_DAYS_BACK} дн. (до вчера)`,
      });
    }

    if (fatPct != null) {
      const fatSpark = seriesOrHint(fatSeries);
      stats.push({
        key: "fat",
        label: "% жира",
        value: fatPct.toFixed(1),
        subValue: "%",
        trend: weekTrend(fatSeries, phase, "fat"),
        sparkline: fatSpark.sparkline,
        sparkEmptyHint: fatSpark.hint,
        sparkColor: "#EAB308",
        tooltip: "Доля жировой массы",
      });
    }

    if (lean != null) {
      const leanSeries =
        weightSeries.length >= 2 && fatSeries.length >= 2
          ? weightSeries.map((w, i) => {
              const f = fatSeries[Math.min(i, fatSeries.length - 1)] ?? 0;
              return Math.round((w - (w * f) / 100) * 10) / 10;
            })
          : [];
      const leanSpark = seriesOrHint(leanSeries);
      stats.push({
        key: "lean",
        label: "Сухая масса",
        value: lean.toFixed(1),
        subValue: "кг",
        trend: weekTrend(leanSeries, phase, "lean"),
        sparkline: leanSpark.sparkline,
        sparkEmptyHint: leanSpark.hint,
        sparkColor: "#3b82f6",
      });
    }

    if (bmi != null) {
      stats.push({
        key: "bmi",
        label: "ИМТ",
        value: bmi.toFixed(1),
        trend: { diff: null, label: "—", tone: "neutral" },
        sparkline: [],
        sparkColor: "#94a3b8",
        tooltip: heightCm ? `Рост ${heightCm} см` : undefined,
      });
    }

    stats.push({
      key: "goal",
      label: "Цель",
      value: goal,
      trend: { diff: null, label: phase === "cut" ? "дефицит" : "набор", tone: "neutral" },
      sparkline: [],
      sparkColor: "#8b5cf6",
      tooltip: "Режим дневника питания",
    });

    const optional: BodyStatItem[] = [];
    if (waterEst != null) {
      optional.push({
        key: "water",
        label: "Вода ~",
        value: waterEst.toFixed(1),
        subValue: "кг",
        trend: { diff: null, label: "оценка", tone: "neutral" },
        sparkline: [],
        sparkColor: "#06b6d4",
        tooltip: "≈73% сухой массы (оценка)",
      });
    }
    if (waist != null) {
      const waistSeries = seriesForField(periodRows, "waist_cm");
      const waistSpark = seriesOrHint(waistSeries);
      optional.push({
        key: "waist",
        label: "Талия",
        value: waist.toFixed(1),
        subValue: "см",
        trend: weekTrend(waistSeries, phase, "neutral"),
        sparkline: waistSpark.sparkline,
        sparkEmptyHint: waistSpark.hint,
        sparkColor: "#a855f7",
      });
    }
    if (ffmi != null) {
      optional.push({
        key: "ffmi",
        label: "FFMI",
        value: ffmi.toFixed(1),
        trend: { diff: null, label: "—", tone: "neutral" },
        sparkline: [],
        sparkColor: "#64748b",
        tooltip: "Индекс безжировой массы",
      });
    }

    return {
      stats: [...stats, ...optional],
      lastUpdated,
      sparkPeriod,
      isLoading: summaryQuery.isLoading || sparkMetricsQuery.isLoading,
      hasData: stats.length > 0,
    };
  }, [
    summaryQuery.data,
    summaryQuery.isLoading,
    sparkMetricsQuery.data,
    sparkMetricsQuery.isLoading,
    sparkPeriod,
    phase,
    snap,
    profileQuery.data?.height_cm,
    goalLabel,
  ]);
}
