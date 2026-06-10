/** Display-layer forecast for today's calorie expenditure (does not alter stored data). */

export type TodayExpenditureForecastSource = "previous_week_same_day" | "current_estimate";

export type TodayExpenditureForecast = {
  value: number;
  source: TodayExpenditureForecastSource;
  label: string;
  explanation: string;
};

export function sameWeekdayPreviousWeek(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function resolveTodayExpenditureForecast(opts: {
  currentEstimate: number | null | undefined;
  previousWeekSameDay: number | null | undefined;
}): TodayExpenditureForecast | null {
  const prev = finitePositive(opts.previousWeekSameDay);
  if (prev != null) {
    return {
      value: round1(prev),
      source: "previous_week_same_day",
      label: "Прогноз расхода на сегодня",
      explanation: "Основано на расходе в этот день недели на прошлой неделе.",
    };
  }

  const current = finitePositive(opts.currentEstimate);
  if (current != null) {
    return {
      value: round1(current),
      source: "current_estimate",
      label: "Ожидаемый расход к концу дня",
      explanation:
        "Оценка по BMR, TEF и текущим данным активности (браслет или тренировки).",
    };
  }

  return null;
}

function finitePositive(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
