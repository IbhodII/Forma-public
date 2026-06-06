import {getDailyFactsInRange, toDateRange} from '../analytics/localAnalyticsAdapter';
import type {SleepSummary} from '../utils/recoveryAdvice';

export async function fetchSleepSummary(days = 7): Promise<SleepSummary> {
  const {from, to} = toDateRange(days);
  const facts = await getDailyFactsInRange(from, to);
  const sleepRows = facts.filter(x => (x.sleepHours ?? 0) > 0);
  const last = sleepRows.length ? sleepRows[sleepRows.length - 1]! : null;
  const avg =
    sleepRows.length > 0
      ? sleepRows.reduce((acc, row) => acc + (row.sleepHours ?? 0), 0) / sleepRows.length
      : null;
  return {
    has_data: sleepRows.length > 0,
    days,
    last_night_hours: last?.sleepHours ?? null,
    last_night_date: last?.date ?? null,
    avg_hours: avg != null ? Math.round(avg * 10) / 10 : null,
    consistency_score: avg != null ? Math.max(0, Math.min(100, Math.round((avg / 8) * 100))) : null,
    source: sleepRows.length ? 'health_connect' : null,
    nights_count: sleepRows.length,
  };
}

export type {SleepSummary};
