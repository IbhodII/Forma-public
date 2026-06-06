const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const DEFAULT_WEEK_START = 6;

function normalizeDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 12, 0, 0, 0);
  }
  const [year, month, day] = input.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateIso: string, days: number): string {
  const date = normalizeDate(dateIso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function getWeekStart(date: string | Date): string {
  const source = normalizeDate(date);
  const day = source.getDay();
  const diff = (day - DEFAULT_WEEK_START + 7) % 7;
  source.setDate(source.getDate() - diff);
  return toIso(source);
}

export function getWeekRange(date: string | Date): {start: string; end: string} {
  const start = getWeekStart(date);
  return {start, end: addDaysIso(start, 6)};
}

export function groupByFormaWeek<T>(
  items: T[],
  getDate: (item: T) => string,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = getWeekStart(getDate(item));
    if (!out[key]) {
      out[key] = [];
    }
    out[key].push(item);
  }
  return out;
}

export function formatFormaWeekLabel(date: string | Date): string {
  const {start, end} = getWeekRange(date);
  const startDate = normalizeDate(start);
  const endDate = normalizeDate(end);
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.getDate()}–${endDate.getDate()} ${MONTHS_RU[startDate.getMonth()]}`;
  }
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}
