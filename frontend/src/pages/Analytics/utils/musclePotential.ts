import type { MetricColorLevel } from "./metricColors";
import { muscleRatioColorLevel } from "./metricColors";

/** max_lean_mass = 25 × (height_m)² */
export function maxLeanMassFfmi(heightCm: number | null | undefined): number | null {
  const h = typeof heightCm === "number" ? heightCm : Number(heightCm);
  if (!Number.isFinite(h) || h <= 0) return null;
  const heightM = h / 100;
  return Math.round(25 * heightM * heightM * 10) / 10;
}

export function leanMassFromFat(
  weightKg: unknown,
  bodyFatPercent: unknown,
): number | null {
  const w = typeof weightKg === "number" ? weightKg : Number(weightKg);
  const fat = typeof bodyFatPercent === "number" ? bodyFatPercent : Number(bodyFatPercent);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(fat) || fat < 0 || fat >= 100) {
    return null;
  }
  return Math.round(w * (1 - fat / 100) * 10) / 10;
}

export function muscleRatioColorFromPercent(percent: number): MetricColorLevel {
  return muscleRatioColorLevel(percent / 100);
}

export function musclePotentialInterpretation(ratio: number): string {
  if (ratio < 0.8) return "Потенциал раскрыт не полностью";
  if (ratio < 0.9) return "Хороший уровень";
  if (ratio < 0.98) return "Очень высокий";
  return "Практически достигнут предел";
}
