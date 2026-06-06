export type WorkoutPeriod = "30d" | "3m" | "6m" | "12m" | "all";

export const WORKOUT_PERIOD_OPTIONS: { value: WorkoutPeriod; label: string }[] = [
  { value: "30d", label: "30 дней" },
  { value: "3m", label: "3 месяца" },
  { value: "6m", label: "6 месяцев" },
  { value: "12m", label: "1 год" },
  { value: "all", label: "Всё время" },
];

/** Calendar date in local timezone (workout dates are YYYY-MM-DD, not UTC instants). */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Диапазон для API (date_from / date_to), inclusive. Для «Всё время» поля не заданы. */
export function workoutPeriodToDateRange(
  period: WorkoutPeriod,
): { from?: string; to?: string } {
  if (period === "all") return {};

  const today = localToday();
  const toStr = localIsoDate(today);

  if (period === "30d") {
    const from = addLocalDays(today, -30);
    return { from: localIsoDate(from), to: toStr };
  }

  const months = period === "3m" ? 3 : period === "6m" ? 6 : 12;
  const from = new Date(today);
  from.setMonth(from.getMonth() - months);
  return { from: localIsoDate(from), to: toStr };
}

export function workoutPeriodLabel(period: WorkoutPeriod): string {
  return WORKOUT_PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;
}

export function isWorkoutPeriodCustom(
  period: WorkoutPeriod,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (period === "all") return false;
  const expected = workoutPeriodToDateRange(period);
  const expFrom = expected.from ?? "";
  const expTo = expected.to ?? "";
  return dateFrom !== expFrom || dateTo !== expTo;
}

export function workoutPeriodDisplayLabel(
  period: WorkoutPeriod,
  dateFrom: string,
  dateTo: string,
): string {
  if (period === "all") return workoutPeriodLabel("all");
  if (isWorkoutPeriodCustom(period, dateFrom, dateTo)) {
    if (dateFrom && dateTo) return `Свой период: ${dateFrom} — ${dateTo}`;
    if (dateFrom) return `Свой период: с ${dateFrom}`;
    if (dateTo) return `Свой период: по ${dateTo}`;
    return "Свой период";
  }
  return workoutPeriodLabel(period);
}
