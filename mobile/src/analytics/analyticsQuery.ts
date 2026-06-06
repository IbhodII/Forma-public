import {computeCaloriesSeries, computeCtlAtlTsb} from '../analytics-engine';
import type {
  CaloriesAnalyticsResponse,
  CtlAtlTsbResponse,
  DailyTrimpResponse,
  ZoneTimeResponse,
} from '../api/analytics';
import {
  getDailyFactsInRange,
  hasAnyAnalyticsDataInRange,
} from './localAnalyticsAdapter';
import {toDateRange} from '../components/analytics/utils';
import {withTimeout} from '../utils/asyncTimeout';

const ANALYTICS_FETCH_TIMEOUT_MS = 5000;

async function guardedFacts(from: string, to: string, label: string) {
  const hasAny = await withTimeout(
    hasAnyAnalyticsDataInRange(from, to),
    ANALYTICS_FETCH_TIMEOUT_MS,
    `${label}.hasAnyData`,
  );
  if (!hasAny) {
    return null;
  }
  const facts = await withTimeout(
    getDailyFactsInRange(from, to),
    ANALYTICS_FETCH_TIMEOUT_MS,
    `${label}.dailyFacts`,
  );
  return facts.length ? facts : null;
}

export async function queryCtlAtlTsb(days = 42): Promise<CtlAtlTsbResponse> {
  const {from, to} = toDateRange(days);
  const facts = await guardedFacts(from, to, 'analytics.ctl');
  if (!facts) {
    return {items: [], current: {}};
  }
  const items = computeCtlAtlTsb(facts);
  const current = items.length ? items[items.length - 1] : undefined;
  return {
    items,
    current: current
      ? {
          ctl: current.ctl,
          atl: current.atl,
          tsb: current.tsb,
          trimp: current.trimp,
          last_workout_date: (() => {
            const daysWithWorkout = facts.filter(x => x.workouts > 0);
            return daysWithWorkout.length
              ? daysWithWorkout[daysWithWorkout.length - 1]!.date
              : null;
          })(),
        }
      : {},
  };
}

export async function queryCardioTrimp(
  dateFrom: string,
  dateTo: string,
): Promise<DailyTrimpResponse> {
  const facts = await guardedFacts(dateFrom, dateTo, 'analytics.trimp');
  if (!facts) {
    return {items: []};
  }
  return {items: facts.map(x => ({date: x.date, trimp: x.trimp}))};
}

export async function queryCaloriesAnalytics(
  dateFrom: string,
  dateTo: string,
): Promise<CaloriesAnalyticsResponse> {
  const facts = await guardedFacts(dateFrom, dateTo, 'analytics.calories');
  if (!facts) {
    return {items: []};
  }
  return {items: computeCaloriesSeries(facts)};
}

export async function queryZoneTime(days = 30): Promise<ZoneTimeResponse> {
  const {from, to} = toDateRange(days);
  const facts = await guardedFacts(from, to, 'analytics.zone');
  if (!facts) {
    return {items: [], total_seconds: 0};
  }
  const z = [0, 0, 0, 0, 0];
  for (const row of facts) {
    const hr = row.avgHr ?? row.restingHr ?? 0;
    if (hr <= 0) {
      continue;
    }
    const bucket = hr < 110 ? 0 : hr < 130 ? 1 : hr < 150 ? 2 : hr < 170 ? 3 : 4;
    z[bucket] += 600;
  }
  const names = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const total = z.reduce((a, b) => a + b, 0);
  const items = z.map((seconds, idx) => ({
    zone_id: `z${idx + 1}`,
    name: names[idx]!,
    seconds,
    minutes: Math.round(seconds / 60),
    percent: total > 0 ? (seconds / total) * 100 : 0,
  }));
  return {items, total_seconds: total};
}
