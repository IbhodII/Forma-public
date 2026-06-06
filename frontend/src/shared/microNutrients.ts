/** Справочник микронутриентов (на 100 г), синхронизирован с utils/micro_nutrients.py */
export const MICRO_NUTRIENTS = [
  { key: "vitamin_c_mg", label: "Витамин C", unit: "мг", defaultGoal: 90 },
  { key: "vitamin_d_mcg", label: "Витамин D", unit: "мкг", defaultGoal: 15 },
  { key: "vitamin_b12_mcg", label: "Витамин B12", unit: "мкг", defaultGoal: 2.4 },
  { key: "calcium_mg", label: "Кальций", unit: "мг", defaultGoal: 1000 },
  { key: "iron_mg", label: "Железо", unit: "мг", defaultGoal: 18 },
  { key: "magnesium_mg", label: "Магний", unit: "мг", defaultGoal: 400 },
  { key: "zinc_mg", label: "Цинк", unit: "мг", defaultGoal: 11 },
  { key: "potassium_mg", label: "Калий", unit: "мг", defaultGoal: 3500 },
  { key: "sodium_mg", label: "Натрий", unit: "мг", defaultGoal: 2000 },
] as const;

export type MicroNutrientKey = (typeof MICRO_NUTRIENTS)[number]["key"];

export const MICRO_NUTRIENT_KEYS: MicroNutrientKey[] = MICRO_NUTRIENTS.map((n) => n.key);

export function microLabel(key: string): string {
  return MICRO_NUTRIENTS.find((n) => n.key === key)?.label ?? key;
}

export function formatMicroAmount(value: number, unit: string): string {
  if (value <= 0) return "—";
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}
