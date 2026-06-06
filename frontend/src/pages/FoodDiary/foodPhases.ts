/** Константы фаз питания (без импорта из FoodDiaryPage — избегаем цикла с MicrosTab). */
export const FOOD_PHASE_CUT = "cut" as const;
export const FOOD_PHASE_BULK = "bulk" as const;

export type FoodDiaryPhase = typeof FOOD_PHASE_CUT | typeof FOOD_PHASE_BULK;

export const FOOD_PHASE_TABS = [
  { id: FOOD_PHASE_CUT, label: "Сушка" },
  { id: FOOD_PHASE_BULK, label: "Набор" },
] as const;

export function resolveFoodPhase(param: string | null): FoodDiaryPhase {
  return param === FOOD_PHASE_BULK ? FOOD_PHASE_BULK : FOOD_PHASE_CUT;
}
