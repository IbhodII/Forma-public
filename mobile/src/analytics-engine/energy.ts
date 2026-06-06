import type {DailyFacts} from './contracts';

export type CaloriesPoint = {
  date: string;
  strength_kcal: number;
  cardio_kcal: number;
  total_kcal: number;
};

export function computeCaloriesSeries(facts: DailyFacts[]): CaloriesPoint[] {
  return [...facts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({
      date: row.date,
      strength_kcal: 0,
      cardio_kcal: Math.round(Math.max(0, row.workoutCalories || row.activeCalories)),
      total_kcal: Math.round(Math.max(0, row.workoutCalories || row.activeCalories)),
    }));
}
