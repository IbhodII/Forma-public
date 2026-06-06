import type { StepsHistoryPoint, StepsYearlyTotal } from "../api/steps";

export type StepsRecordRow = {
  label: string;
  value: string;
  detail: string;
};

export type YearHighlight = {
  year: number;
  total_steps: number;
  months_count: number;
  best_month_label: string;
  best_month_steps: number;
  best_distance_km: number | null;
};

export type StepsRecordsBundle = {
  global: StepsRecordRow[];
  byYear: YearHighlight[];
  bestYearTotal: { year: number; total_steps: number } | null;
};

function monthLabel(iso: string, names: string[]): string {
  const [y, m] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  return `${names[mi] ?? m} ${y}`;
}

const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function formatSteps(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function buildStepsRecords(
  items: StepsHistoryPoint[],
  yearly: StepsYearlyTotal[],
  formatDistance?: (km: number) => string,
): StepsRecordsBundle {
  if (!items.length) {
    return { global: [], byYear: [], bestYearTotal: null };
  }

  const bestSteps = items.reduce((a, b) => (b.steps > a.steps ? b : a));
  const lowSteps = items.reduce((a, b) => (b.steps < a.steps ? b : a));
  const withKm = items.filter((i) => i.distance_km != null && i.distance_km > 0);
  const bestKm = withKm.length
    ? withKm.reduce((a, b) => ((b.distance_km ?? 0) > (a.distance_km ?? 0) ? b : a))
    : null;

  const yearlyDesc = [...yearly].sort((a, b) => b.year - a.year);
  const bestYearTotal = yearlyDesc.length
    ? yearlyDesc.reduce((a, b) => (b.total_steps > a.total_steps ? b : a))
    : null;

  const global: StepsRecordRow[] = [
    {
      label: "Лучший месяц (шаги)",
      value: formatSteps(bestSteps.steps),
      detail: monthLabel(bestSteps.date, MONTH_NAMES),
    },
    {
      label: "Самый спокойный месяц",
      value: formatSteps(lowSteps.steps),
      detail: monthLabel(lowSteps.date, MONTH_NAMES),
    },
  ];

  if (bestKm && bestKm.distance_km != null) {
    global.push({
      label: "Максимум дистанции",
      value: formatDistance
        ? formatDistance(bestKm.distance_km)
        : `${bestKm.distance_km.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`,
      detail: monthLabel(bestKm.date, MONTH_NAMES),
    });
  }

  if (bestYearTotal) {
    global.push({
      label: "Самый активный год",
      value: formatSteps(bestYearTotal.total_steps),
      detail: String(bestYearTotal.year),
    });
  }

  const byYear: YearHighlight[] = yearlyDesc.map((y) => {
    const inYear = items.filter((i) => i.date.startsWith(`${y.year}-`));
    const bestMonth = inYear.reduce((a, b) => (b.steps > a.steps ? b : a), inYear[0]);
    const bestDist = inYear
      .filter((i) => i.distance_km != null)
      .reduce<StepsHistoryPoint | null>(
        (acc, cur) =>
          !acc || (cur.distance_km ?? 0) > (acc.distance_km ?? 0) ? cur : acc,
        null,
      );

    return {
      year: y.year,
      total_steps: y.total_steps,
      months_count: y.months_count,
      best_month_label: monthLabel(bestMonth.date, MONTH_NAMES),
      best_month_steps: bestMonth.steps,
      best_distance_km: bestDist?.distance_km ?? null,
    };
  });

  return { global, byYear, bestYearTotal };
}
