import type { BodyMetricRow } from "../types";
import {
  DEFAULT_WEEK_START_DAY,
  formatWeekLabel,
  weekStartForDate,
} from "../shared/utils/weekCalendar";
export type BodyWeeklyPeriod = "90d" | "180d" | "365d" | "all";

export const BODY_WEEKLY_PERIOD_OPTIONS: { id: BodyWeeklyPeriod; label: string }[] = [
  { id: "90d", label: "3 мес." },
  { id: "180d", label: "6 мес." },
  { id: "365d", label: "12 мес." },
  { id: "all", label: "Всё" },
];

export interface WeeklyAggregate {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  avgWeight: number | null;
  avgFat: number | null;
  avgMuscle: number | null;
  count: number;
  measurements: BodyMetricRow[];
}

export interface WeeklyCardStats {
  weightKg: number | null;
  fatPercent: number | null;
  muscleKg: number | null;
  count: number;
  /** true — средние за текущую неделю; false — последний замер */
  fromCurrentWeek: boolean;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function meanPositive(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null && v > 0);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function periodToDateRange(
  period: BodyWeeklyPeriod,
): { date_from?: string; date_to?: string } {
  if (period === "all") return {};
  const days = period === "90d" ? 90 : period === "180d" ? 180 : 365;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { date_from: toIsoDate(from), date_to: toIsoDate(to) };
}

/** Группировка замеров по неделям, свежие недели первыми. */
export function groupByWeek(
  metrics: BodyMetricRow[],
  weekStartDay: number = DEFAULT_WEEK_START_DAY,
): WeeklyAggregate[] {
  const byWeek = new Map<string, BodyMetricRow[]>();
  for (const row of metrics) {
    const dateStr = String(row.date ?? "").slice(0, 10);
    if (!dateStr) continue;
    const ws = weekStartForDate(dateStr, weekStartDay);
    const list = byWeek.get(ws) ?? [];
    list.push(row);
    byWeek.set(ws, list);
  }
  const weeks: WeeklyAggregate[] = [];
  for (const [weekStart, measurements] of byWeek) {
    measurements.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const wsDate = new Date(weekStart + "T12:00:00");
    const weDate = new Date(wsDate);
    weDate.setDate(weDate.getDate() + 6);
    weeks.push({
      weekStart,
      weekEnd: toIsoDate(weDate),
      weekLabel: formatWeekLabel(weekStart),
      avgWeight: meanPositive(measurements.map((m) => num(m.weight_kg))),
      avgFat: meanPositive(measurements.map((m) => num(m.body_fat_percent))),
      avgMuscle: meanPositive(measurements.map((m) => num(m.muscle_mass_kg))),
      count: measurements.length,
      measurements,
    });
  }
  weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return weeks;
}

export function getCurrentWeekAggregate(
  weeks: WeeklyAggregate[],
  weekStartDay: number = DEFAULT_WEEK_START_DAY,
): WeeklyAggregate | null {
  const cur = weekStartForDate(toIsoDate(new Date()), weekStartDay);
  return weeks.find((w) => w.weekStart === cur) ?? null;
}

/** Карточки: текущая неделя или последний замер. */
export function buildWeeklyCardStats(
  weeks: WeeklyAggregate[],
  latest?: BodyMetricRow | null,
  weekStartDay: number = DEFAULT_WEEK_START_DAY,
): WeeklyCardStats {
  const cur = getCurrentWeekAggregate(weeks, weekStartDay);
  if (cur && cur.count > 0) {
    return {
      weightKg: cur.avgWeight,
      fatPercent: cur.avgFat,
      muscleKg: cur.avgMuscle,
      count: cur.count,
      fromCurrentWeek: true,
    };
  }
  const w = num(latest?.weight_kg);
  const f = num(latest?.body_fat_percent);
  const m = num(latest?.muscle_mass_kg);
  return {
    weightKg: w != null && w > 0 ? w : null,
    fatPercent: f != null && f > 0 ? f : null,
    muscleKg: m != null && m > 0 ? m : null,
    count: 0,
    fromCurrentWeek: false,
  };
}

export function formatWeeklyNum(v: number | null, digits = 1, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(digits).replace(/\.0$/, "");
  return unit ? `${s} ${unit}` : s;
}

/** CSV для таблицы по неделям. */
export function weeklyToCsv(weeks: WeeklyAggregate[]): string {
  const header = "Неделя;Вес кг;Жир %;Мышцы кг;Замеров";
  const rows = weeks.map(
    (w) =>
      `${w.weekLabel};${w.avgWeight?.toFixed(1) ?? ""};${w.avgFat?.toFixed(1) ?? ""};${w.avgMuscle?.toFixed(1) ?? ""};${w.count}`,
  );
  return "\uFEFF" + [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
