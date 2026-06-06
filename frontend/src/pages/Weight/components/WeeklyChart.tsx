import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import { useUnits } from "../../../hooks/useUnits";
import { kgToJapanese } from "../../../utils/americanUnits";
import { formatNumber } from "../../../utils/format";
import type { WeeklyAggregate } from "../../../utils/weeklyAggregation";

function kgToChartJp(kg: number): number {
  return Number(formatNumber(kgToJapanese(kg), 1));
}

/** Подписи оси X: 0, 5, 10, … (номер недели от начала периода). */
function weekAxisTicks(pointCount: number): { tickvals: number[]; ticktext: string[] } {
  if (pointCount <= 0) return { tickvals: [], ticktext: [] };
  const tickvals: number[] = [];
  const maxTick = Math.min(50, pointCount - 1);
  for (let i = 0; i <= maxTick; i += 5) {
    tickvals.push(i);
  }
  const last = pointCount - 1;
  if (last > maxTick || !tickvals.includes(last)) {
    tickvals.push(last);
  }
  return { tickvals, ticktext: tickvals.map(String) };
}

export function WeeklyChart({
  weeks,
  formatBodyWeight,
}: {
  weeks: WeeklyAggregate[];
  formatBodyWeight: (kg: number) => string;
}) {
  const { system } = useUnits();
  const useAmerican = system === "american";

  const chart = useMemo(() => {
    const asc = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const weekIndex = asc.map((_, i) => i);
    return {
      weekLabels: asc.map((w) => w.weekLabel),
      weekIndex,
      weights: asc.map((w) =>
        w.avgWeight != null && Number.isFinite(w.avgWeight)
          ? useAmerican
            ? kgToChartJp(w.avgWeight)
            : Math.round(w.avgWeight * 10) / 10
          : null,
      ),
      fats: asc.map((w) => w.avgFat),
    };
  }, [weeks, useAmerican]);

  if (!chart.weekIndex.length) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">Нет данных для графика за выбранный период</p>
    );
  }

  const hasFat = chart.fats.some((f) => f != null);
  const weightHover = chart.weights.map((w) =>
    w != null && Number.isFinite(w) ? formatBodyWeight(w) : "—",
  );
  const weightCustom = chart.weekLabels.map((label, i) => [label, weightHover[i]] as [string, string]);
  const { tickvals, ticktext } = weekAxisTicks(chart.weekIndex.length);

  return (
    <PlotChart
      data={[
        {
          x: chart.weekIndex,
          y: chart.weights,
          type: "scatter",
          mode: "lines+markers",
          name: useAmerican ? "Вес, Jp" : "Вес, кг",
          yaxis: "y",
          customdata: weightCustom,
          hovertemplate: "%{customdata[0]}<br>Вес: %{customdata[1]}<extra></extra>",
        },
        ...(hasFat
          ? [
              {
                x: chart.weekIndex,
                y: chart.fats,
                type: "scatter" as const,
                mode: "lines+markers" as const,
                name: "Жир, %",
                yaxis: "y2" as const,
                line: { dash: "dot" as const },
                customdata: chart.weekLabels,
                hovertemplate: "%{customdata}<br>Жир: %{y:.1f} %<extra></extra>",
              },
            ]
          : []),
      ]}
      layout={{
        margin: { t: 24, r: hasFat ? 56 : 24, b: 56, l: 48 },
        xaxis: {
          tickmode: "array",
          tickvals,
          ticktext,
          title: { text: "Неделя" },
        },
        yaxis: { title: { text: useAmerican ? "Вес, Jp" : "Вес, кг" }, tickformat: ".1f" },
        ...(hasFat
          ? {
              yaxis2: {
                title: { text: "%" },
                overlaying: "y",
                side: "right",
              },
            }
          : {}),
        legend: { orientation: "h", y: 1.12 },
        hovermode: "x unified",
      }}
      compact
    />
  );
}
