export type WeightInputUnit = 'kg' | 'Jp' | 'Camry';

export function kgToWeightInputFields(
  kg: number,
  _useAmerican: boolean,
): {weight: string; weightUnit: WeightInputUnit} {
  return {weight: String(kg), weightUnit: 'kg'};
}

export function weightInputFieldsToKg(
  weight: string,
  _weightUnit: WeightInputUnit,
  _useAmerican: boolean,
): number {
  const v = Number(weight);
  return Number.isFinite(v) ? v : NaN;
}
