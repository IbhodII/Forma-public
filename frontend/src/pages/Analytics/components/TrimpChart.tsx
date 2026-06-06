import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import type { DailyTrimpPoint } from "../../../types";
import { chartDateLabel, sortByDate } from "../utils/chartDates";

const PLOT_LAYOUT = {
  margin: { t: 12, r: 12, b: 48, l: 44 },
  autosize: true,
  xaxis: { tickangle: -35, automargin: true },
  yaxis: { title: { text: "TRIMP" }, automargin: true, zeroline: false },
  transition: { duration: 400, easing: "cubic-in-out" as const },
};

export function TrimpChart({
  items,
  mode,
}: {
  items: DailyTrimpPoint[];
  mode: "bar" | "line";
}) {
  const chart = useMemo(() => {
    const sorted = sortByDate(items);
    return {
      labels: sorted.map((r) => chartDateLabel(r.date)),
      values: sorted.map((r) => r.trimp),
    };
  }, [items]);

  if (!items.length) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        Нет TRIMP за период. Нужны кардио-тренировки с детальным пульсом.
      </p>
    );
  }

  return (
    <div className="chart-container w-full min-w-0">
      <PlotChart
        data={[
          {
            x: chart.labels,
            y: chart.values,
            type: mode === "bar" ? "bar" : "scatter",
            mode: mode === "line" ? "lines+markers" : undefined,
            name: "TRIMP",
            marker: { color: "#8b5cf6", line: { width: 0 } },
            line:
              mode === "line"
                ? { color: "#8b5cf6", width: 2.5, shape: "spline" }
                : undefined,
            hovertemplate: "TRIMP: %{y:.1f}<extra></extra>",
          },
        ]}
        layout={PLOT_LAYOUT}
        compact
        className="w-full min-w-0"
      />
    </div>
  );
}
