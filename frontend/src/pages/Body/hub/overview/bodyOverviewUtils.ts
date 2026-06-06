import type { HealthConnectHubResponse } from "../../../../api/sync";
import type { WeightDashboard, WeeklyWeightRow } from "../../../../api/weight";
import type { WeeklyAggregate } from "../../../../utils/weeklyAggregation";
import { buildWeightWeeks } from "../../../../utils/weightWeekly";

export function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/** Недели из API (полный df), когда items пуст после filter_weight_items. */
export function weeksFromApiWeekly(weekly: WeeklyWeightRow[]): WeeklyAggregate[] {
  return [...weekly]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((w) => ({
      weekStart: w.week_start.slice(0, 10),
      weekEnd: w.week_start.slice(0, 10),
      weekLabel: w.week_label,
      avgWeight: w.weight_kg,
      avgFat: w.body_fat_percent,
      avgMuscle: w.lean_mass_kg,
      count: w.days,
      measurements: [],
    }));
}

/** Те же недели, что на вкладке «Вес», с fallback на weekly[]. */
export function buildWeightWeeksForOverview(
  weight: WeightDashboard | undefined,
  weekStartDay?: number,
): WeeklyAggregate[] {
  const fromDaily = buildWeightWeeks(weight, "all", weekStartDay);
  if (fromDaily.length > 0) return fromDaily;
  return weeksFromApiWeekly(weight?.weekly ?? []);
}

export const BODY_OVERVIEW_WEIGHT_DAYS = 30;

/** Календарные дни [start … end], всего `count` дней. */
export function lastCalendarDays(count: number, endAt?: Date): string[] {
  const end = endAt ?? new Date();
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function weightByDateMap(weight: WeightDashboard | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of weight?.items ?? []) {
    const d = String(row.date).slice(0, 10);
    const v = Number(row.weight_kg);
    if (d.length === 10 && Number.isFinite(v) && v > 0) map.set(d, v);
  }
  if (map.size === 0) {
    for (const w of weight?.weekly ?? []) {
      const d = String(w.week_start).slice(0, 10);
      const v = Number(w.weight_kg);
      if (d.length === 10 && Number.isFinite(v) && v > 0) map.set(d, v);
    }
  }
  return map;
}

/** Ряд за фиксированные 30 дней (forward-fill после первого замера). */
export function buildWeightSparkline30(weight: WeightDashboard | undefined): number[] {
  const days = lastCalendarDays(BODY_OVERVIEW_WEIGHT_DAYS);
  const byDate = weightByDateMap(weight);
  const out: number[] = [];
  let last: number | null = null;
  let started = false;

  for (const d of days) {
    const v = byDate.get(d);
    if (v != null) {
      last = v;
      started = true;
    }
    if (started && last != null) out.push(last);
  }

  return out;
}

export function weightSparkTrend30(values: number[]): {
  diff: number | null;
  label: string;
} {
  if (values.length < 2) return { diff: null, label: "мало данных за 30 дн." };
  return sparkTrendFromValues(values, { unit: "кг", periodLabel: "30 дн." });
}

export function sparkTrendFromValues(
  values: number[],
  opts?: { unit?: string; periodLabel?: string; decimals?: number },
): { diff: number | null; label: string } {
  const unit = opts?.unit ?? "";
  const period = opts?.periodLabel ?? "период";
  const dec = opts?.decimals ?? 1;
  if (values.length < 2) return { diff: null, label: `мало данных за ${period}` };
  const first = values[0];
  const last = values[values.length - 1];
  const diff = Math.round((last - first) * 10 ** dec) / 10 ** dec;
  const suffix = unit ? ` ${unit}` : "";
  if (Math.abs(diff) < 10 ** -dec) return { diff: 0, label: `стабильно за ${period}` };
  const arrow = diff > 0 ? "↑" : "↓";
  return {
    diff,
    label: `${arrow} ${diff > 0 ? "+" : ""}${diff}${suffix} за ${period}`,
  };
}

export function seriesToSparkValues(
  series: Array<{ date: string; value: number | null | undefined }>,
): number[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const out: number[] = [];
  let last: number | null = null;
  for (const p of sorted) {
    const v = p.value;
    if (v != null && Number.isFinite(v)) {
      last = v;
      out.push(v);
    } else if (last != null) {
      out.push(last);
    }
  }
  return out;
}

export function chartSeriesFromWeight(
  weight: WeightDashboard | undefined,
  weeks?: WeeklyAggregate[],
) {
  const daily = sortByDate(weight?.items ?? [])
    .map((i) => ({
      date: String(i.date).slice(0, 10),
      value: Number(i.weight_kg),
    }))
    .filter((p) => p.date.length === 10 && Number.isFinite(p.value) && p.value > 0);

  if (daily.length > 0) return daily;

  const wks = weeks ?? buildWeightWeeksForOverview(weight);
  return wks
    .filter((w) => w.avgWeight != null && Number.isFinite(w.avgWeight))
    .map((w) => ({ date: w.weekStart, value: w.avgWeight as number }));
}

export function weightOverview(
  weight: WeightDashboard | undefined,
  weekStartDay?: number,
) {
  const weeks = buildWeightWeeksForOverview(weight, weekStartDay);
  const series = chartSeriesFromWeight(weight, weeks);

  if (series.length) {
    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    return {
      current: last.value,
      delta: prev ? last.value - prev.value : null,
      spark: series.slice(-14).map((p) => p.value),
    };
  }

  const cw = weight?.current_week;
  const cwKg = cw?.weight_kg != null ? Number(cw.weight_kg) : null;
  if (cwKg != null && Number.isFinite(cwKg)) {
    return { current: cwKg, delta: null as number | null, spark: [] as number[] };
  }

  return { current: null as number | null, delta: null as number | null, spark: [] as number[] };
}

export function formatSyncLabel(iso: string | null | undefined): string {
  if (!iso) return "Ещё не синхронизировалось";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60_000);
  if (diffMin < 1) return "Только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hcSyncStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ok: "Актуально",
    partial: "Частично",
    no_data: "Нет данных",
    stale: "Устарело",
  };
  return map[status] ?? status;
}

export function permissionsSummary(permissions: Record<string, boolean> | undefined) {
  const entries = Object.entries(permissions ?? {});
  const granted = entries.filter(([, ok]) => ok).length;
  return { granted, total: entries.length, entries };
}

export function avgCaloriesWeek(hub: HealthConnectHubResponse | undefined): number | null {
  const series = hub?.calories.week_series ?? [];
  if (!series.length) return null;
  const sum = series.reduce((s, d) => s + d.total_calories, 0);
  return Math.round(sum / series.length);
}

export function hrAvgEstimate(hub: HealthConnectHubResponse | undefined): number | null {
  const hr = hub?.heart_rate;
  if (!hr?.has_data || hr.daily_hr_min == null || hr.daily_hr_max == null) return null;
  return Math.round((hr.daily_hr_min + hr.daily_hr_max) / 2);
}
