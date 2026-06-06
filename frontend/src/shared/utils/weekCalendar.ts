/** Единая логика недельного календаря (Python weekday: пн=0 … вс=6). */

export const WEEKDAY_MON = 0;
export const WEEKDAY_TUE = 1;
export const WEEKDAY_WED = 2;
export const WEEKDAY_THU = 3;
export const WEEKDAY_FRI = 4;
export const WEEKDAY_SAT = 5;
export const WEEKDAY_SUN = 6;

export const DEFAULT_WEEK_START_DAY = WEEKDAY_SAT;

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: WEEKDAY_MON, label: "Понедельник" },
  { value: WEEKDAY_TUE, label: "Вторник" },
  { value: WEEKDAY_WED, label: "Среда" },
  { value: WEEKDAY_THU, label: "Четверг" },
  { value: WEEKDAY_FRI, label: "Пятница" },
  { value: WEEKDAY_SAT, label: "Суббота" },
  { value: WEEKDAY_SUN, label: "Воскресенье" },
];

function pythonWeekday(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export const WEEKDAY_SHORT_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function weekdayLabelsFromStart(startDay = DEFAULT_WEEK_START_DAY): string[] {
  const sd = normalizeWeekStartDay(startDay);
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT_RU[(sd + i) % 7]);
}

/** Число пустых ячеек перед 1-м числом месяца (Python weekday: пн=0 … вс=6). */
export function monthGridLeadingPadding(
  year: number,
  month: number,
  startDay = DEFAULT_WEEK_START_DAY,
): number {
  const sd = normalizeWeekStartDay(startDay);
  const first = new Date(year, month, 1);
  return (pythonWeekday(first) - sd + 7) % 7;
}

export function normalizeWeekStartDay(value: number | null | undefined): number {
  if (value == null || value < 0 || value > 6) return DEFAULT_WEEK_START_DAY;
  return value;
}

export function weekStartForDate(isoDate: string, startDay = DEFAULT_WEEK_START_DAY): string {
  const sd = normalizeWeekStartDay(startDay);
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  const delta = (pythonWeekday(d) - sd + 7) % 7;
  d.setDate(d.getDate() - delta);
  return d.toISOString().slice(0, 10);
}

export function weekDatesFromAnchor(isoDate: string, startDay = DEFAULT_WEEK_START_DAY): string[] {
  const start = new Date(`${weekStartForDate(isoDate, startDay)}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export function shiftWeekStart(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStartIso: string): string {
  const ws = new Date(weekStartIso.slice(0, 10) + "T12:00:00");
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(ws.getDate())}.${pad(ws.getMonth() + 1)} – ${pad(we.getDate())}.${pad(we.getMonth() + 1)}.${we.getFullYear()}`;
}
