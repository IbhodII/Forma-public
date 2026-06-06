import type {TsbPoint} from './types';

export function consecutiveAtlRise(series: TsbPoint[], minDays = 4): number {
  if (series.length < minDays + 1) {
    return 0;
  }
  const tail = series.slice(-(minDays + 2));
  let streak = 0;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i]!.atl > tail[i - 1]!.atl + 0.3) {
      streak += 1;
    } else {
      streak = 0;
    }
  }
  return streak;
}

export function consecutiveTsbFall(series: TsbPoint[], minDays = 4): number {
  if (series.length < minDays + 1) {
    return 0;
  }
  const tail = series.slice(-(minDays + 2));
  let streak = 0;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i]!.tsb < tail[i - 1]!.tsb - 0.5) {
      streak += 1;
    } else {
      streak = 0;
    }
  }
  return streak;
}

export function weekOverWeekTsbDelta(series: TsbPoint[]): number | null {
  if (series.length < 14) {
    return null;
  }
  const recent = series.slice(-7);
  const prior = series.slice(-14, -7);
  const avg = (pts: TsbPoint[]) => pts.reduce((s, p) => s + p.tsb, 0) / pts.length;
  return avg(recent) - avg(prior);
}

export function ctlTrendDelta(series: TsbPoint[]): number | null {
  if (series.length < 10) {
    return null;
  }
  const first = series.slice(0, Math.floor(series.length / 2));
  const second = series.slice(Math.floor(series.length / 2));
  const avg = (pts: TsbPoint[]) => pts.reduce((s, p) => s + p.ctl, 0) / pts.length;
  return avg(second) - avg(first);
}

export function hadRestDaysBefore(
  lastWorkoutDate: string | null,
  activityDates: string[],
  minRestDays = 2,
): boolean {
  if (!lastWorkoutDate) {
    return false;
  }
  const last = new Date(`${lastWorkoutDate}T12:00:00`);
  for (let d = 1; d <= minRestDays + 1; d++) {
    const cursor = new Date(last);
    cursor.setDate(cursor.getDate() - d);
    const key = cursor.toISOString().slice(0, 10);
    if (activityDates.includes(key)) {
      return false;
    }
  }
  return true;
}

export function countWorkoutsInWindow(
  dates: string[],
  endIso: string,
  windowDays: number,
): number {
  const end = new Date(`${endIso}T12:00:00`).getTime();
  const start = end - (windowDays - 1) * 86400000;
  const set = new Set(dates.map(d => d.slice(0, 10)));
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    if (set.has(key)) {
      count += 1;
    }
  }
  return count;
}
