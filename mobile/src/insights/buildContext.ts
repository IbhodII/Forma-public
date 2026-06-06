import type {CycleImpact} from '../api/cycle';
import type {CtlAtlTsbPoint} from '../api/analytics';
import {trendDelta} from '../components/analytics/utils';
import {countWorkoutsInWindow, hadRestDaysBefore} from './signals';
import type {InsightContext, TsbPoint} from './types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(iso: string) {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(`${todayIso()}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function buildInsightContext(input: {
  ctlPoints: CtlAtlTsbPoint[];
  current?: {
    ctl?: number | null;
    atl?: number | null;
    tsb?: number | null;
  } | null;
  activityDates: string[];
  stretchRecent: boolean;
  streak: number;
  kcalToday: number;
  proteinToday: number;
  isFemale: boolean;
  cycle?: CycleImpact | null;
  trimpValues?: number[];
}): InsightContext {
  const today = todayIso();
  const tsbSeries: TsbPoint[] = input.ctlPoints.map((p: CtlAtlTsbPoint) => ({
    date: p.date,
    tsb: p.tsb,
    atl: p.atl,
    ctl: p.ctl,
  }));

  const sortedDates = [...input.activityDates].map(d => d.slice(0, 10)).sort();
  const lastWorkoutDate = sortedDates.length ? sortedDates[sortedDates.length - 1]! : null;
  const daysSinceWorkout = lastWorkoutDate ? daysAgo(lastWorkoutDate) : 99;

  const trimpValues = input.trimpValues ?? [];
  const trimpTrendPerDay = trimpValues.length >= 4 ? trendDelta(trimpValues) : null;
  const trimpSumPeriod = trimpValues.reduce((a, b) => a + b, 0);

  return {
    tsb: input.current?.tsb ?? null,
    atl: input.current?.atl ?? null,
    ctl: input.current?.ctl ?? null,
    tsbSeries,
    daysSinceWorkout,
    lastWorkoutDate,
    stretchRecent: input.stretchRecent,
    streak: input.streak,
    kcalToday: input.kcalToday,
    proteinToday: input.proteinToday,
    isFemale: input.isFemale,
    cycle: input.cycle ?? null,
    workoutsLast7d: countWorkoutsInWindow(sortedDates, today, 7),
    workoutsPrev7d: countWorkoutsInWindow(
      sortedDates,
      addDaysIso(today, -7),
      7,
    ),
    hadRestBeforeLastWorkout: hadRestDaysBefore(lastWorkoutDate, sortedDates, 2),
    trimpTrendPerDay,
    trimpSumPeriod,
  };
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
