export function calcMacroCalories(
  protein: number,
  fat: number,
  carbs: number,
): number {
  return Math.round(protein * 4 + fat * 9 + carbs * 4);
}

export function parseNum(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 14);
}
