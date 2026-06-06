import { useMemo } from "react";
import type { FoodPhase, FoodWeekResponse } from "../../api/food";
import type { WeekDayCell } from "./useFoodWeekData";

export type WeekSummary = {
  avgIntake: number | null;
  avgExpenditure: number | null;
  avgBalance: number | null;
  avgProtein: number | null;
  adherencePct: number;
  daysLogged: number;
  daysWithBalance: number;
  weekProgressPct: number;
};

export function computeWeekSummary(
  cells: WeekDayCell[],
  week: FoodWeekResponse | undefined,
): WeekSummary {
  const withExpenditure = cells.filter((c) => c.expenditure != null);
  const daysWithBalance = withExpenditure.length;
  const daysLogged = cells.filter((c) => c.hasEntries).length;

  const avgIntake =
    withExpenditure.length > 0
      ? Math.round(
          withExpenditure.reduce((s, c) => s + c.intake, 0) / withExpenditure.length,
        )
      : week?.week_daily_average?.calories ?? null;

  const avgExp =
    withExpenditure.length > 0
      ? Math.round(
          withExpenditure.reduce((s, c) => s + (c.expenditure ?? 0), 0) / withExpenditure.length,
        )
      : null;

  const avgBalance =
    withExpenditure.length > 0
      ? Math.round(
          (withExpenditure.reduce(
            (s, c) => s + ((c.expenditure ?? 0) - c.intake),
            0,
          ) /
            withExpenditure.length) *
            10,
        ) / 10
      : null;

  const proteinDays = cells.filter((c) => c.protein > 0);
  const avgProtein =
    proteinDays.length > 0
      ? Math.round((proteinDays.reduce((s, c) => s + c.protein, 0) / proteinDays.length) * 10) / 10
      : week?.week_daily_average?.protein ?? null;

  const adherencePct = Math.round((daysLogged / Math.max(cells.length, 1)) * 100);

  const today = new Date().toISOString().slice(0, 10);
  let daysElapsed = cells.length;
  if (week) {
    daysElapsed = cells.filter((c) => c.date <= today).length;
  }
  const weekProgressPct = Math.round((daysElapsed / Math.max(cells.length, 1)) * 100);

  return {
    avgIntake: avgIntake ?? null,
    avgExpenditure: avgExp,
    avgBalance,
    avgProtein,
    adherencePct,
    daysLogged,
    daysWithBalance,
    weekProgressPct,
  };
}

export function useWeekSummary(cells: WeekDayCell[], week: FoodWeekResponse | undefined) {
  return useMemo(() => computeWeekSummary(cells, week), [cells, week]);
}

export type DayStatus = "good" | "warning" | "problem" | "neutral" | "empty";

export function dayStatus(
  cell: WeekDayCell,
  phase: FoodPhase,
  maxDeficitPerKgFat: number,
  fatKg: number | null,
): DayStatus {
  if (!cell.hasEntries && cell.expenditure == null) return "empty";
  if (cell.balance == null) return "neutral";

  if (phase === "cut") {
    if (cell.balance > 30) return "problem";
    if (cell.balance < -30) {
      if (fatKg && fatKg > 0) {
        const perKg = -cell.balance / fatKg;
        if (perKg > maxDeficitPerKgFat) return "problem";
        if (perKg > maxDeficitPerKgFat * 0.85) return "warning";
      }
      return "good";
    }
    return "neutral";
  }

  if (cell.balance < -30) return "problem";
  if (cell.balance > 50) return "good";
  if (cell.balance > 0) return "neutral";
  return "warning";
}
