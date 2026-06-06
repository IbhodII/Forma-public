import type { WorkoutExpenditureDay } from "../../api/analytics";

export const PREFER_CHEST_WORKOUT_KCAL_KEY = "health-dashboard-prefer-chest-workout-kcal";

export function loadPreferChestWorkoutKcal(): boolean {
  try {
    return localStorage.getItem(PREFER_CHEST_WORKOUT_KCAL_KEY) !== "0";
  } catch {
    return true;
  }
}

export function savePreferChestWorkoutKcal(value: boolean): void {
  try {
    localStorage.setItem(PREFER_CHEST_WORKOUT_KCAL_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Итог за день: пульсометр, если включён чекбокс и есть данные, иначе часы. */
export function effectiveWorkoutKcal(row: WorkoutExpenditureDay, preferChest: boolean): number {
  if (preferChest && row.calories_chest_sum > 0) {
    return row.calories_chest_sum;
  }
  return row.calories_watch_sum;
}

export function sumEffectiveWorkoutKcal(
  rows: WorkoutExpenditureDay[],
  preferChest: boolean,
): number {
  return rows.reduce((acc, row) => acc + effectiveWorkoutKcal(row, preferChest), 0);
}
