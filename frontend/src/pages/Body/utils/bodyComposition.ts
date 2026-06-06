import type { BodyMetricsSummary } from "../../../api/body";
import type { GeneticLimit } from "../../../api/body";
import type { BodyMetricRow } from "../../../types";
import { sortRowsByDateAsc } from "../../../utils/bodyMetrics";

export type CompositionBreakdown = {
  weightKg: number | null;
  fatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  waterEstimateKg: number | null;
  ffmi: number | null;
  fatShare: number;
  leanShare: number;
};

/** Оценка воды ≈ 73% сухой массы (без бэкенда, только отображение). */
const WATER_LEAN_RATIO = 0.73;

export function deriveComposition(
  summary: BodyMetricsSummary | undefined,
  heightCm: number | null | undefined,
): CompositionBreakdown {
  const weight = summary?.metrics?.weight_kg?.value;
  const fatPct = summary?.metrics?.body_fat_percent?.value;
  const muscle = summary?.metrics?.muscle_mass_kg?.value ?? null;

  let fatMassKg: number | null = null;
  let leanMassKg: number | null = null;
  if (weight != null && fatPct != null && weight > 0 && fatPct >= 0) {
    fatMassKg = (weight * fatPct) / 100;
    leanMassKg = weight - fatMassKg;
  }

  const waterEstimateKg =
    leanMassKg != null && leanMassKg > 0 ? leanMassKg * WATER_LEAN_RATIO : null;

  let ffmi: number | null = null;
  const h = heightCm != null ? Number(heightCm) : null;
  if (leanMassKg != null && h != null && h > 0) {
    const hm = h / 100;
    ffmi = leanMassKg / (hm * hm);
  }

  const fatShare = weight != null && fatMassKg != null && weight > 0 ? (fatMassKg / weight) * 100 : 0;
  const leanShare = weight != null && leanMassKg != null && weight > 0 ? (leanMassKg / weight) * 100 : 0;

  return {
    weightKg: weight ?? null,
    fatPercent: fatPct ?? null,
    fatMassKg,
    leanMassKg,
    muscleMassKg: muscle,
    waterEstimateKg,
    ffmi,
    fatShare,
    leanShare,
  };
}

/** Допустимые диапазоны — отсекают опечатки и «мусорные» частичные замеры. */
const SPARKLINE_BOUNDS: Record<string, { min: number; max: number }> = {
  weight_kg: { min: 30, max: 300 },
  body_fat_percent: { min: 3, max: 60 },
  muscle_mass_kg: { min: 10, max: 150 },
  waist_cm: { min: 45, max: 200 },
  hips_cm: { min: 50, max: 220 },
};

function sparklineInRange(key: string, v: number): boolean {
  const b = SPARKLINE_BOUNDS[key];
  if (!b) return v > 0;
  return v >= b.min && v <= b.max;
}

export function sparklineValues(rows: BodyMetricRow[], key: string, maxPoints = 14): number[] {
  const sorted = sortRowsByDateAsc(rows);
  const values: number[] = [];
  for (const row of sorted) {
    const v = Number(row[key as keyof BodyMetricRow]);
    if (Number.isFinite(v) && sparklineInRange(key, v)) values.push(v);
  }
  return values.slice(-maxPoints);
}

/** Тренд соотношения талия/бёдра (как в карточке «Талия / бёдра»). */
export function sparklineWaistHipsRatio(rows: BodyMetricRow[], maxPoints = 14): number[] {
  const sorted = sortRowsByDateAsc(rows);
  const values: number[] = [];
  for (const row of sorted) {
    const w = Number(row.waist_cm);
    const h = Number(row.hips_cm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 45 || h < 50) continue;
    const ratio = w / h;
    if (ratio >= 0.5 && ratio <= 1.5) values.push(ratio);
  }
  return values.slice(-maxPoints);
}

export function geneticProgress(genetic: GeneticLimit | undefined): {
  percent: number;
  label: string;
} | null {
  if (!genetic || genetic.status !== "ok" || genetic.percent == null) return null;
  return {
    percent: Math.min(100, genetic.percent),
    label: genetic.interpretation ?? "",
  };
}
