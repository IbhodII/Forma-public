import { todayIso } from "./dateHighlight";

/** Сколько дней назад от «вчера» начинается окно (вчера включительно в конец). */
export const FORECAST_BALANCE_DAYS_BACK = 14;

/** Инclusive-диапазон [вчера − daysBack … вчера], сегодня не входит. */
export function rollingBalanceDatesThroughYesterday(
  daysBack = FORECAST_BALANCE_DAYS_BACK,
  onDate?: string,
): { start: string; end: string } {
  const today = new Date(`${(onDate ?? todayIso()).slice(0, 10)}T12:00:00`);
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, daysBack));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
