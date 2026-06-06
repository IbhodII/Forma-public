export type WorkoutPeriodDays = 7 | 30 | 90 | 0;

export function periodDateFrom(days: WorkoutPeriodDays): string | undefined {
  if (days === 0) {
    return undefined;
  }
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const WORKOUT_PERIOD_OPTIONS: {id: WorkoutPeriodDays; label: string}[] = [
  {id: 7, label: '7 дн'},
  {id: 30, label: '30 дн'},
  {id: 90, label: '90 дн'},
  {id: 0, label: 'Все'},
];
