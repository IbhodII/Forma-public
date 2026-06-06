import type { DailyWeightRow, WeeklyWeightRow, WeightDashboard } from "../api/weight";
import type { BodyMetricRow } from "../types";
import {
  buildWeeklyCardStats,
  groupByWeek,
  periodToDateRange,
  type BodyWeeklyPeriod,
  type WeeklyAggregate,
  type WeeklyCardStats,
} from "./weeklyAggregation";

export function dailyToBodyRow(row: DailyWeightRow): BodyMetricRow {
  return {
    date: row.date,
    weight_kg: row.weight_kg,
    body_fat_percent: row.body_fat_percent,
  };
}

function leanFromAvg(weight: number | null, fat: number | null): number | null {
  if (weight == null || fat == null || fat <= 0) return null;
  return weight * (1 - fat / 100);
}

function filterDailyByPeriod(
  items: DailyWeightRow[],
  period: BodyWeeklyPeriod,
): DailyWeightRow[] {
  const { date_from, date_to } = periodToDateRange(period);
  return items.filter((i) => {
    const d = i.date.slice(0, 10);
    if (date_from && d < date_from) return false;
    if (date_to && d > date_to) return false;
    return true;
  });
}

/** Недели из ежедневных записей + сухая масса из API при наличии. */
export function buildWeightWeeks(
  data: WeightDashboard | undefined,
  period: BodyWeeklyPeriod,
  weekStartDay?: number,
): WeeklyAggregate[] {
  if (!data?.items.length) return [];
  const filtered = filterDailyByPeriod(data.items, period);
  const apiMap = new Map((data.weekly ?? []).map((w) => [w.week_start, w]));
  return groupByWeek(filtered.map(dailyToBodyRow), weekStartDay).map((w) => {
    const api: WeeklyWeightRow | undefined = apiMap.get(w.weekStart);
    return {
      ...w,
      avgMuscle: api?.lean_mass_kg ?? leanFromAvg(w.avgWeight, w.avgFat),
    };
  });
}

/** Карточки: current_week с API или последняя запись. */
export function buildWeightCardStats(
  data: WeightDashboard | undefined,
  weeks: WeeklyAggregate[],
  weekStartDay?: number,
): WeeklyCardStats {
  const cw = data?.current_week;
  if (cw && cw.days != null && Number(cw.days) > 0) {
    return {
      weightKg: cw.weight_kg ?? null,
      fatPercent: cw.body_fat_percent ?? null,
      muscleKg: cw.lean_mass_kg ?? null,
      count: Number(cw.days),
      fromCurrentWeek: true,
    };
  }
  const latest = data?.items?.[0];
  return buildWeeklyCardStats(weeks, latest ? dailyToBodyRow(latest) : null, weekStartDay);
}
