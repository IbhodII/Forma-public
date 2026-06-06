/** Единые пресеты периода для блоков аналитики. */
export type StandardPeriodId = "30" | "90" | "180" | "all";

import { CTL_ATL_TSB_DEFAULT_DAYS } from "../../../shared/trainingLoadMetrics";

export { CTL_ATL_TSB_DEFAULT_DAYS };

export const STANDARD_PERIOD_OPTIONS = [
  { id: "30" as const, label: "30 дн." },
  { id: "90" as const, label: "90 дн." },
  { id: "180" as const, label: "180 дн." },
  { id: "all" as const, label: "Всё" },
] as const;

/** Число дней для API (CTL, зоны пульса). */
export function periodToDays(id: StandardPeriodId): number {
  if (id === "all") return 365;
  return Number(id);
}

/** Диапазон дат ISO для TRIMP, калорий и т.п. */
export function dateRangeForPeriod(id: StandardPeriodId): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (id === "all") {
    from.setFullYear(from.getFullYear() - 5);
  } else {
    from.setDate(from.getDate() - (Number(id) - 1));
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Диапазон для e1RM / объёма (без from = всё время). */
export function strengthRangeForPeriod(id: StandardPeriodId): { from?: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (id === "all") return { to };
  const from = new Date();
  from.setDate(from.getDate() - (Number(id) - 1));
  return { from: from.toISOString().slice(0, 10), to };
}
