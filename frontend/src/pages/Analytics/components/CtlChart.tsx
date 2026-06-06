import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import type { CtlAtlTsbPoint } from "../../../types";
import { chartDateLabel, sortByDate } from "../utils/chartDates";

const PLOT_LAYOUT = {
  margin: { t: 12, r: 48, b: 52, l: 48 },
  autosize: true,
  xaxis: { tickangle: -35, automargin: true, showgrid: true },
  yaxis: { title: { text: "CTL / ATL" }, automargin: true, zeroline: false },
  yaxis2: {
    title: { text: "TSB" },
    overlaying: "y" as const,
    side: "right" as const,
    automargin: true,
    zeroline: false,
  },
  legend: { orientation: "h" as const, y: 1.12, x: 0, xanchor: "left" as const },
  hovermode: "x unified" as const,
  transition: { duration: 400, easing: "cubic-in-out" as const },
};

export function CtlChart({ items, hero = false }: { items: CtlAtlTsbPoint[]; hero?: boolean }) {
  const chart = useMemo(() => {
    const sorted = sortByDate(items);
    return {
      labels: sorted.map((r) => chartDateLabel(r.date)),
      ctl: sorted.map((r) => r.ctl),
      atl: sorted.map((r) => r.atl),
      tsb: sorted.map((r) => r.tsb),
    };
  }, [items]);

  if (!items.length) {
    return <p className="text-sm text-slate-500 py-6 text-center">Нет данных CTL/ATL/TSB</p>;
  }

  return (
    <div className={hero ? "analytics-hero-chart chart-container" : "chart-container w-full min-w-0"}>
      <PlotChart
        data={[
          {
            x: chart.labels,
            y: chart.ctl,
            type: "scatter",
            mode: "lines",
            name: "CTL",
            line: { color: "#3b82f6", width: 2.5, shape: "spline" },
            hovertemplate: "CTL: %{y:.1f}<extra></extra>",
          },
          {
            x: chart.labels,
            y: chart.atl,
            type: "scatter",
            mode: "lines",
            name: "ATL",
            line: { color: "#f97316", width: 2.5, shape: "spline" },
            hovertemplate: "ATL: %{y:.1f}<extra></extra>",
          },
          {
            x: chart.labels,
            y: chart.tsb,
            type: "scatter",
            mode: "lines",
            name: "TSB",
            line: { color: "#10b981", width: 2, dash: "dot", shape: "spline" },
            yaxis: "y2",
            hovertemplate: "TSB: %{y:.1f}<extra></extra>",
          },
        ]}
        layout={PLOT_LAYOUT}
        compact
        tall={hero}
        className="w-full min-w-0"
        config={{ displayModeBar: hero ? "hover" : true, displaylogo: false }}
      />
    </div>
  );
}
