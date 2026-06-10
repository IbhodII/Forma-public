import type { NutritionForecastResult, NutritionPlan } from "../../../api/cutBulk";

const KCAL_PER_KG_FAT = 7700;
const MIN_WEIGHT_DELTA = 0.05;

export function finiteWeight(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ForecastChartPoint = {
  label: string;
  week: number;
  weight: number;
  plannedWeight?: number;
  date?: string;
  deficit?: number;
};

export type PlannedTrajectory = {
  startWeight: number;
  targetWeight: number;
  startDate: string;
  endDate: string;
  rateKgPerWeek: number | null;
};

export function forecastHasChartSource(forecast: NutritionForecastResult): boolean {
  const wp = forecast.weight_projection?.length ?? 0;
  const wl = forecast.weeks_log?.length ?? 0;
  return wp > 0 || wl > 0;
}

function isoDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  return (b - a) / 86400000;
}

function resolvePlannedKgPerWeek(
  forecast: NutritionForecastResult,
  plan?: NutritionPlan | null,
): number | null {
  if (forecast.phase === "bulk") {
    const fromPlan = finiteWeight(plan?.gain_rate_kg_per_week);
    if (fromPlan != null && fromPlan > 0) return fromPlan;
    const grams = forecast.target_bulk_grams_per_week;
    if (grams != null && grams > 0) return grams / 1000;
    return null;
  }

  const perKg = finiteWeight(forecast.target_deficit_per_kg_fat ?? forecast.max_deficit_per_kg_fat);
  const bf = finiteWeight(forecast.current_body_fat_percent);
  const cw = finiteWeight(forecast.current_weight_kg);
  if (perKg == null || perKg <= 0 || bf == null || bf <= 0 || cw == null || cw <= 0) return null;
  const fatKg = (cw * bf) / 100;
  const deficitDay = perKg * fatKg;
  return (deficitDay * 7) / KCAL_PER_KG_FAT;
}

/** Linear plan from current weight to target using saved target date or planned weekly rate. */
export function resolvePlannedTrajectory(
  forecast: NutritionForecastResult,
  plan?: NutritionPlan | null,
  startDate?: string | null,
): PlannedTrajectory | null {
  const startWeight = finiteWeight(forecast.current_weight_kg);
  const targetWeight = finiteWeight(plan?.target_weight_kg ?? forecast.target_weight_kg);
  if (startWeight == null || targetWeight == null) return null;
  if (Math.abs(targetWeight - startWeight) < MIN_WEIGHT_DELTA) return null;

  const start = isoDateOnly(startDate) ?? isoDateOnly(new Date().toISOString());
  if (!start) return null;

  const planEnd = isoDateOnly(plan?.target_date);
  const rate = resolvePlannedKgPerWeek(forecast, plan);

  let endDate: string | null = null;
  if (planEnd && daysBetween(start, planEnd) > 0) {
    endDate = planEnd;
  } else if (rate != null && rate > 0) {
    const weeks = Math.max(1, Math.ceil(Math.abs(targetWeight - startWeight) / rate));
    endDate = addDays(start, weeks * 7);
  }

  if (!endDate) return null;

  return {
    startWeight,
    targetWeight,
    startDate: start,
    endDate,
    rateKgPerWeek: rate,
  };
}

export function plannedWeightAt(
  trajectory: PlannedTrajectory,
  week: number,
  date?: string,
): number {
  const { startWeight, targetWeight, startDate, endDate } = trajectory;
  const pointDate = isoDateOnly(date);
  const totalDays = daysBetween(startDate, endDate);
  if (totalDays <= 0) return targetWeight;

  if (pointDate) {
    const elapsed = daysBetween(startDate, pointDate);
    const t = Math.max(0, Math.min(1, elapsed / totalDays));
    return startWeight + t * (targetWeight - startWeight);
  }

  const totalWeeks = Math.max(1, totalDays / 7);
  const t = Math.max(0, Math.min(1, week / totalWeeks));
  return startWeight + t * (targetWeight - startWeight);
}

function appendTargetPoint(
  rows: ForecastChartPoint[],
  forecast: NutritionForecastResult,
): ForecastChartPoint[] {
  if (rows.length !== 1 || forecast.target_weight_kg == null) return rows;
  const target = finiteWeight(forecast.target_weight_kg);
  const last = rows[0];
  if (target == null || last == null || Math.abs(target - last.weight) < MIN_WEIGHT_DELTA) return rows;
  const targetWeek = Math.max(1, Math.ceil(forecast.weeks_to_target || 1));
  return [
    ...rows,
    {
      label: "Цель",
      week: targetWeek,
      weight: target,
      date: forecast.target_date,
    },
  ];
}

function attachPlannedWeights(
  rows: ForecastChartPoint[],
  forecast: NutritionForecastResult,
  plan?: NutritionPlan | null,
): ForecastChartPoint[] {
  const startDate = rows.find((r) => r.date)?.date ?? rows[0]?.date;
  const trajectory = resolvePlannedTrajectory(forecast, plan, startDate);
  if (!trajectory) return rows;

  return rows.map((row) => ({
    ...row,
    plannedWeight: Math.round(plannedWeightAt(trajectory, row.week, row.date) * 10) / 10,
  }));
}

export function chartHasPlannedTrajectory(rows: ForecastChartPoint[]): boolean {
  const planned = rows.map((r) => r.plannedWeight).filter((w) => w != null && Number.isFinite(w));
  return planned.length >= 2;
}

export function buildForecastChartData(
  forecast: NutritionForecastResult,
  plan?: NutritionPlan | null,
): ForecastChartPoint[] {
  const projectionDates = new Map<number, string>();
  for (const row of forecast.weight_projection ?? []) {
    if (row.date) projectionDates.set(row.week, row.date);
  }

  let rows: ForecastChartPoint[];

  if (forecast.model === "dynamic_cut" && (forecast.weeks_log?.length ?? 0) > 0) {
    rows = [];
    for (const row of forecast.weeks_log ?? []) {
      const weight = finiteWeight(row.weight_kg);
      if (weight == null) continue;
      const deficitRaw =
        row.week > 0 ? finiteWeight(row.deficit_projected ?? row.deficit_used) : null;
      rows.push({
        label: row.week === 0 ? "Сейчас" : `Н${row.week}`,
        week: row.week,
        weight,
        date: projectionDates.get(row.week),
        ...(deficitRaw != null ? { deficit: deficitRaw } : {}),
      });
    }
  } else {
    rows = [];
    for (const p of forecast.weight_projection ?? []) {
      const weight = finiteWeight(p.weight_kg);
      if (weight == null) continue;
      const deficitRaw =
        forecast.real_avg_deficit_per_day != null && p.week > 0
          ? finiteWeight(forecast.real_avg_deficit_per_day)
          : null;
      rows.push({
        label: p.week === 0 ? "Сейчас" : `Н${p.week}`,
        week: p.week,
        weight,
        date: p.date,
        ...(deficitRaw != null ? { deficit: deficitRaw } : {}),
      });
    }
  }

  rows = appendTargetPoint(rows, forecast);
  return attachPlannedWeights(rows, forecast, plan);
}
