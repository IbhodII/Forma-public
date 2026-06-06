import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import type { StrengthOneRmChartPoint } from "../../../api/strength";
import { useUnits } from "../../../hooks/useUnits";
import { kgToAmericanWeight } from "../../../utils/americanUnits";
import { chartDateLabel, sortByDate } from "../utils/chartDates";

function movingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    if (!slice.length) return Number.NaN;
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

function kgToChartWeight(kg: number, useAmerican: boolean): number {
  if (!useAmerican) return kg;
  return kgToAmericanWeight(kg).value;
}

export function OneRmChart({
  items,
  movingAverage7 = false,
}: {
  items: StrengthOneRmChartPoint[];
  movingAverage7?: boolean;
}) {
  const { system, formatBarbellWeight } = useUnits();
  const useAmerican = system === "american";
  const yTitle = useAmerican ? "Jp / Camry (e1RM)" : "кг (e1RM)";

  const chart = useMemo(() => {
    const sorted = sortByDate(items);
    const labels = sorted.map((r) => chartDateLabel(r.date));
    const e1rm = sorted.map((r) => kgToChartWeight(r.epley_1rm, useAmerican));
    const ma7 = movingAverage7 ? movingAverage(e1rm, 7) : null;
    return { labels, e1rm, ma7, sorted };
  }, [items, movingAverage7, useAmerican]);

  const layout = useMemo(
    () => ({
      margin: { t: 20, r: 12, b: 56, l: 44 },
      autosize: true,
      xaxis: { tickangle: -40, automargin: true },
      yaxis: { title: { text: yTitle }, automargin: true },
      legend: { orientation: "h" as const, y: 1.15 },
    }),
    [yTitle],
  );

  if (!items.length) {
    return <p className="text-sm text-slate-500 py-6 text-center">Нет замеров за период</p>;
  }

  const traces = [
    {
      x: chart.labels,
      y: chart.e1rm,
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "e1RM",
      line: { color: "#6366f1", width: 2 },
      marker: { size: 5 },
      customdata: chart.sorted.map(
        (r) => `${r.date}<br>e1RM: ${formatBarbellWeight(r.epley_1rm)}`,
      ),
      hovertemplate: "%{customdata}<extra></extra>",
    },
    ...(chart.ma7
      ? [
          {
            x: chart.labels,
            y: chart.ma7,
            type: "scatter" as const,
            mode: "lines" as const,
            name: "Среднее 7 дн.",
            line: { color: "#f59e0b", width: 2, dash: "dash" as const },
            connectgaps: true,
            hovertemplate: "%{customdata}<br>ср. 7 дн.: %{y:.2f}<extra></extra>",
            customdata: chart.sorted.map((r) => r.date),
          },
        ]
      : []),
  ];

  return (
    <div className="chart-container w-full min-w-0">
      <PlotChart data={traces} layout={layout} compact className="w-full min-w-0" />
    </div>
  );
}
