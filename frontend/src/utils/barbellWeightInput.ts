import type { BodyWeightUnit } from "./americanUnits";
import {
  americanWeightToKg,
  formatAmericanNumber,
  kgToAmericanWeight,
} from "./americanUnits";

export type WeightInputUnit = BodyWeightUnit | "kg";

export function isAmericanWeightUnit(unit: string): unit is BodyWeightUnit {
  return unit === "Jp" || unit === "Camry";
}

/** Поля ввода из веса в кг (метрика — кг, american — Jp/Camry). */
export function kgToWeightInputFields(
  kg: number,
  useAmerican: boolean,
): { weight: string; weightUnit: WeightInputUnit } {
  if (!useAmerican) {
    return { weight: String(kg), weightUnit: "kg" };
  }
  const { value, unit } = kgToAmericanWeight(kg);
  const kind = unit === "Jp" ? "japanese" : "camry";
  return { weight: formatAmericanNumber(value, kind), weightUnit: unit };
}

/** Вес в кг из строки поля ввода. */
export function weightInputFieldsToKg(
  weight: string,
  weightUnit: WeightInputUnit,
  useAmerican: boolean,
): number {
  const v = Number(weight);
  if (!Number.isFinite(v)) return NaN;
  if (!useAmerican || weightUnit === "kg") return v;
  if (isAmericanWeightUnit(weightUnit)) {
    return americanWeightToKg(v, weightUnit);
  }
  return v;
}
