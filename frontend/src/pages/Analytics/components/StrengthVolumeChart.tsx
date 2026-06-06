import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import { useUnits } from "../../../hooks/useUnits";
import { kgToJapanese } from "../../../utils/americanUnits";
import type { StrengthVolumeDay } from "../../../types";
import { chartDateLabel, sortByDate } from "../utils/chartDates";

export function StrengthVolumeChart({ items }: { items: StrengthVolumeDay[] }) {
  const { system } = useUnits();

  const chart = useMemo(() => {
    const sorted = sortByDate(items);
    const yUnit = system === "american" ? "Jp" : "кг";
    return {
      labels: sorted.map((r) => chartDateLabel(r.date)),
      values: sorted.map((r) =>
        system === "american" ? kgToJapanese(r.volume_kg) : r.volume_kg,
      ),
      sorted,
      yTitle: system === "american" ? "тоннаж, Jp" : "кг × повторения",
      yUnit,
    };
  }, [items, system]);

  if (!items.length) {
    return <p className="text-sm text-slate-500 py-6 text-center">Нет силовых за период</p>;
  }

  return (
    <div className="chart-container w-full min-w-0">
    <PlotChart
      data={[
        {
          x: chart.labels,
          y: chart.values,
          type: "bar",
          name: "Объём",
          marker: { color: "#6366f1" },
          customdata: chart.sorted.map((r) => chartDateLabel(r.date)),
          hovertemplate: `%{y:.1f} ${chart.yUnit}<br>%{customdata}<extra></extra>`,
        },
      ]}
      layout={{
        margin: { t: 24, r: 24, b: 64, l: 48 },
        xaxis: { tickangle: -35, type: "category" },
        yaxis: { title: { text: chart.yTitle } },
      }}
      compact
    />
    </div>
  );
}
