import type { NutritionForecastResult } from "../../../api/cutBulk";

export function finiteWeight(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ForecastChartPoint = {
  label: string;
  week: number;
  weight: number;
  date?: string;
  deficit?: number;
};

export function forecastHasChartSource(forecast: NutritionForecastResult): boolean {
  const wp = forecast.weight_projection?.length ?? 0;
  const wl = forecast.weeks_log?.length ?? 0;
  return wp > 0 || wl > 0;
}

function appendTargetPoint(
  rows: ForecastChartPoint[],
  forecast: NutritionForecastResult,
): ForecastChartPoint[] {
  if (rows.length !== 1 || forecast.target_weight_kg == null) return rows;
  const target = finiteWeight(forecast.target_weight_kg);
  const last = rows[0];
  if (target == null || last == null || Math.abs(target - last.weight) < 0.05) return rows;
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

export function buildForecastChartData(forecast: NutritionForecastResult): ForecastChartPoint[] {
  const projectionDates = new Map<number, string>();
  for (const row of forecast.weight_projection ?? []) {
    if (row.date) projectionDates.set(row.week, row.date);
  }

  if (forecast.model === "dynamic_cut" && (forecast.weeks_log?.length ?? 0) > 0) {
    const rows: ForecastChartPoint[] = [];
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
    return appendTargetPoint(rows, forecast);
  }

  const rows: ForecastChartPoint[] = [];
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
  return appendTargetPoint(rows, forecast);
}
