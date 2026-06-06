import type { CtlAtlTsbPoint, CtlAtlTsbResponse } from "../types";

/** Окно расчёта CTL/ATL/TSB по умолчанию (главная, аналитика, API). */
export const CTL_ATL_TSB_DEFAULT_DAYS = 90;

export const TRAINING_LOAD_HOME_HINTS = {
  ctl: "Нагрузка — долгосрочная тренировочная форма (CTL)",
  atl: "Усталость — краткосрочная нагрузка за последние дни (ATL)",
  tsb: "Баланс — свежесть организма (TSB = CTL − ATL)",
  trimpToday:
    "Суммарный TRIMP всех кардио-тренировок за сегодня. Без тренировки — 0. Не путать с CTL и с TRIMP последней тренировки в аналитике.",
} as const;

export type TrainingLoadCurrent = NonNullable<CtlAtlTsbResponse["current"]>;

export function trainingLoadCurrent(
  data: CtlAtlTsbResponse | undefined,
): TrainingLoadCurrent | undefined {
  return data?.current;
}

function isFiniteMetric(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/** CTL, ATL и TSB должны быть заданы — иначе показываем «Недостаточно данных». */
export function hasTrainingLoadMetrics(
  cur: TrainingLoadCurrent | undefined,
): cur is TrainingLoadCurrent & { ctl: number; atl: number; tsb: number } {
  if (!cur) return false;
  return isFiniteMetric(cur.ctl) && isFiniteMetric(cur.atl) && isFiniteMetric(cur.tsb);
}

export function formatTrainingLoadMetric(
  v: number | null | undefined,
  digits = 1,
): string {
  if (!isFiniteMetric(v)) return "—";
  return v.toFixed(digits);
}

/** Дневной TRIMP (сумма за дату), как в ряду CTL/ATL — 0, если кардио сегодня не было. */
export function todayDailyTrimp(
  items: CtlAtlTsbPoint[] | undefined,
  todayIso: string,
): number | null {
  if (!items?.length) return null;
  const row = items.find((i) => i.date === todayIso);
  if (!row) return 0;
  const t = row.trimp;
  return t != null && Number.isFinite(t) ? t : 0;
}
