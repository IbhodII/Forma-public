/** Уровни цвета для числовых метрик на странице «Аналитика». */
export type MetricColorLevel = "red" | "orange" | "yellow" | "lime" | "green" | "neutral";

export const METRIC_TEXT_CLASS: Record<MetricColorLevel, string> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  lime: "text-lime-600 dark:text-lime-400",
  green: "text-green-600 dark:text-green-400",
  neutral: "text-slate-900 dark:text-slate-100",
};

export const METRIC_BORDER_CLASS: Record<MetricColorLevel, string> = {
  red: "border-red-300 dark:border-red-800",
  orange: "border-orange-300 dark:border-orange-800",
  yellow: "border-yellow-300 dark:border-yellow-800",
  lime: "border-lime-300 dark:border-lime-800",
  green: "border-green-300 dark:border-green-800",
  neutral: "border-slate-200 dark:border-slate-600",
};

export function ctlColorLevel(ctl: number | null | undefined): MetricColorLevel {
  if (ctl == null || !Number.isFinite(ctl)) return "neutral";
  if (ctl < 40) return "red";
  if (ctl < 60) return "orange";
  if (ctl < 80) return "yellow";
  if (ctl <= 100) return "lime";
  return "green";
}

/** ATL оценивается по разнице ATL − CTL. */
export function atlColorLevel(atl: number | null | undefined, ctl: number | null | undefined): MetricColorLevel {
  if (atl == null || ctl == null || !Number.isFinite(atl) || !Number.isFinite(ctl)) return "neutral";
  const diff = atl - ctl;
  if (diff < 0) return "green";
  if (diff <= 10) return "yellow";
  if (diff <= 20) return "orange";
  return "red";
}

export function tsbColorLevel(tsb: number | null | undefined): MetricColorLevel {
  if (tsb == null || !Number.isFinite(tsb)) return "neutral";
  if (tsb > 10) return "green";
  if (tsb > 5) return "lime";
  if (tsb >= -5) return "yellow";
  if (tsb >= -15) return "orange";
  return "red";
}

export function trimpColorLevel(trimp: number | null | undefined): MetricColorLevel {
  if (trimp == null || !Number.isFinite(trimp)) return "neutral";
  if (trimp < 100) return "green";
  if (trimp <= 200) return "yellow";
  if (trimp <= 250) return "orange";
  return "red";
}

export function muscleRatioColorLevel(ratio: number | null | undefined): MetricColorLevel {
  if (ratio == null || !Number.isFinite(ratio)) return "neutral";
  if (ratio > 0.9) return "green";
  if (ratio >= 0.75) return "yellow";
  return "red";
}

export function metricCardClasses(level: MetricColorLevel): { value: string; border: string } {
  return {
    value: METRIC_TEXT_CLASS[level],
    border: METRIC_BORDER_CLASS[level],
  };
}
