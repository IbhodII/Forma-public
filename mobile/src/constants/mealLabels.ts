/** Meal type keys from API → Russian labels for UI. */
export const MEAL_LABELS: Record<string, string> = {
  breakfast1: 'Завтрак 1',
  breakfast2: 'Завтрак 2',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

export function mealLabel(meal: string): string {
  return MEAL_LABELS[meal] ?? meal;
}
