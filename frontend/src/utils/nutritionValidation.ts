import type { FoodEntry, MacroTotals } from "../api/food";
import { calcMacroCalories } from "../api/food";

export type EntryWithAlcohol = FoodEntry & { is_alcohol?: boolean };

/** Разделить записи: макросы только у неалкогольных, калории алкоголя отдельно. */
export function separateAlcoholEntries(entries: EntryWithAlcohol[]): {
  nonAlcoholEntries: EntryWithAlcohol[];
  alcoholCalories: number;
} {
  const nonAlcoholEntries: EntryWithAlcohol[] = [];
  let alcoholCalories = 0;
  for (const row of entries) {
    if (row.is_alcohol) {
      alcoholCalories += row.calories;
    } else {
      nonAlcoholEntries.push(row);
    }
  }
  return {
    nonAlcoholEntries,
    alcoholCalories: Math.round(alcoholCalories * 10) / 10,
  };
}

export function sumMacroTotals(entries: EntryWithAlcohol[]): MacroTotals {
  const { nonAlcoholEntries, alcoholCalories } = separateAlcoholEntries(entries);
  const totals = { protein: 0, fat: 0, carbs: 0, calories: 0, fiber: 0 };
  for (const row of nonAlcoholEntries) {
    totals.protein += row.protein;
    totals.fat += row.fat;
    totals.carbs += row.carbs;
    totals.calories += row.calories;
    totals.fiber += row.fiber ?? 0;
  }
  totals.calories += alcoholCalories;
  return {
    protein: Math.round(totals.protein * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    calories: Math.round(totals.calories * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
  };
}

/** Доли калорий по БЖУ (только неалкогольные калории). */
export function macroCalorieSharesFromTotals(
  protein: number,
  fat: number,
  carbs: number,
): { key: string; label: string; grams: number; kcal: number; percent: number }[] {
  const items = [
    { key: "protein", label: "Белки", grams: protein, kcal: protein * 4 },
    { key: "fat", label: "Жиры", grams: fat, kcal: fat * 9 },
    { key: "carbs", label: "Углеводы", grams: carbs, kcal: carbs * 4 },
  ];
  const totalKcal = items.reduce((acc, i) => acc + i.kcal, 0);
  if (totalKcal <= 0) {
    return items.map((i) => ({ ...i, grams: round1(i.grams), kcal: 0, percent: 0 }));
  }
  return items.map((i) => ({
    key: i.key,
    label: i.label,
    grams: round1(i.grams),
    kcal: round1(i.kcal),
    percent: round1((i.kcal / totalKcal) * 100),
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Проверка расхождения калорий с макросами (>10%).
 * Для алкоголя не применяется.
 */
export function checkCalorieMacroMismatch(
  protein: number,
  fat: number,
  carbs: number,
  calories: number,
  isAlcohol: boolean,
): string | null {
  if (isAlcohol) return null;
  const calculated = calcMacroCalories(protein, fat, carbs);
  const entered = calories;
  const denom = Math.max(calculated, entered, 1);
  if (Math.abs(calculated - entered) / denom > 0.1) {
    return (
      `Расхождение калорий с макросами более 10%. ` +
      `Рассчитано ${Math.round(calculated)} ккал, введено ${Math.round(entered)} ккал. ` +
      `Проверьте данные или отметьте продукт как алкоголь.`
    );
  }
  return null;
}
