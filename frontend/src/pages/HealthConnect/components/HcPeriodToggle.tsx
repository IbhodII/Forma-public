export type HcChartPeriod = "day" | "week" | "month";

const LABELS: Record<HcChartPeriod, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

export function HcPeriodToggle({
  value,
  onChange,
}: {
  value: HcChartPeriod;
  onChange: (p: HcChartPeriod) => void;
}) {
  return (
    <div className="hc-period-toggle" role="tablist" aria-label="Период графика">
      {(Object.keys(LABELS) as HcChartPeriod[]).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={`hc-period-toggle__btn ${value === key ? "hc-period-toggle__btn--active" : ""}`}
          onClick={() => onChange(key)}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}

export function buildHcChartPoints(
  series: Array<{ date: string; value: number }>,
  period: HcChartPeriod,
): Array<{ label: string; value: number }> {
  if (!series.length) return [];

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

  if (period === "day") {
    const last = sorted.slice(-7);
    return last.map((p) => ({
      label: p.date.slice(5),
      value: p.value,
    }));
  }

  if (period === "week") {
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const p of sorted) {
      const d = new Date(`${p.date}T12:00:00`);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = weekStart.toISOString().slice(0, 10);
      const prev = buckets.get(key) ?? { sum: 0, count: 0 };
      buckets.set(key, { sum: prev.sum + p.value, count: prev.count + 1 });
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([key, { sum, count }]) => ({
        label: key.slice(5),
        value: Math.round(sum / Math.max(1, count)),
      }));
  }

  const buckets = new Map<string, { sum: number; count: number }>();
  for (const p of sorted) {
    const key = p.date.slice(0, 7);
    const prev = buckets.get(key) ?? { sum: 0, count: 0 };
    buckets.set(key, { sum: prev.sum + p.value, count: prev.count + 1 });
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { sum, count }]) => ({
      label: key,
      value: Math.round(sum / Math.max(1, count)),
    }));
}
