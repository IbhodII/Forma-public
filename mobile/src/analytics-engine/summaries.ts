import type {DailyFacts} from './contracts';

export function weeklySummary(facts: DailyFacts[]) {
  const slice = [...facts].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  return aggregate(slice);
}

export function monthlySummary(facts: DailyFacts[]) {
  const slice = [...facts].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  return aggregate(slice);
}

function aggregate(rows: DailyFacts[]) {
  const sum = <T extends keyof DailyFacts>(key: T) =>
    rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  return {
    days: rows.length,
    steps: Math.round(sum('steps')),
    activeCalories: Math.round(sum('activeCalories')),
    workoutCalories: Math.round(sum('workoutCalories')),
    trimp: Math.round(sum('trimp')),
    avgSleepHours:
      rows.length > 0
        ? Math.round(
            (rows.reduce((acc, row) => acc + (row.sleepHours ?? 0), 0) / rows.length) * 10,
          ) / 10
        : null,
  };
}
