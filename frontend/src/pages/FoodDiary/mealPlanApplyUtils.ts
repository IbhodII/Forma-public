/** Диапазон дат применения рациона (совпадает с backend resolve_meal_plan_apply_dates). */

import { localTodayIso } from "../../utils/format";

export const WEEKDAY_NAMES_FULL = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

export function pythonWeekday(iso: string): number {
  const js = new Date(`${iso.slice(0, 10)}T12:00:00`).getDay();
  return js === 0 ? 6 : js - 1;
}

/** Календарная дата ±N дней без сдвига UTC (toISOString). */
export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localTodayIso(d);
}

export function mealPlanApplyRange(
  startDate: string,
  isWeekly: boolean,
  endDateInput?: string | null,
): {
  start: string;
  end: string;
  dates: string[];
} {
  const start = startDate.slice(0, 10);
  if (!isWeekly) {
    return { start, end: start, dates: [start] };
  }

  const end = (endDateInput?.slice(0, 10) || addCalendarDays(start, 6)).slice(0, 10);
  const dates: string[] = [];
  let cur = start;
  while (cur <= end && dates.length < 7) {
    dates.push(cur);
    if (cur === end) break;
    cur = addCalendarDays(cur, 1);
  }
  if (!dates.length) {
    dates.push(start);
  }

  return {
    start,
    end: dates[dates.length - 1]!,
    dates,
  };
}

export function weekdayOrderFromStart(weekStartDay: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
}

export function weekdayLabel(dow: number): string {
  return WEEKDAY_NAMES_FULL[dow] ?? `День ${dow}`;
}
