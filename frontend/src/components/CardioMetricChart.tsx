import { useMemo } from "react";
import type { CardioWorkout } from "../types";
import { useUnits } from "../hooks/useUnits";
import { kmhToSolPerHour, paceMinPerKmToMinPerSol } from "../utils/americanUnits";
import { formatDateRu, formatPace100m, paceSecPer100m, speedKmh } from "../utils/format";
import { SPEED_AXIS_AMERICAN, SPEED_AXIS_METRIC } from "../utils/units";
import { PlotChart } from "./Plot";

export type CardioMetricChartKind = "bike-speed" | "pool-pace";

type Props = {
  workouts: CardioWorkout[];
  kind: CardioMetricChartKind;
};

function sortByDateAsc(items: CardioWorkout[]): CardioWorkout[] {
  return [...items].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

export function CardioMetricChart({ workouts, kind }: Props) {
  const { system, formatSpeed, formatPace } = useUnits();
  const useAmerican = system === "american";

  const chart = useMemo(() => {
    const sorted = sortByDateAsc(workouts);
    const dates: string[] = [];
    const values: number[] = [];
    const hover: string[] = [];

    for (const w of sorted) {
      if (kind === "bike-speed") {
        const sp = speedKmh(w.distance_km, w.duration_sec, w.avg_speed_kmh);
        if (sp == null) continue;
        dates.push(formatDateRu(w.date));
        values.push(useAmerican ? kmhToSolPerHour(sp) : Math.round(sp * 10) / 10);
        hover.push(formatSpeed(sp));
      } else {
        const pace = paceSecPer100m(w.distance_km, w.duration_sec, w.pace_sec_100m);
        if (pace == null) continue;
        dates.push(formatDateRu(w.date));
        const paceMinPerKm = (pace * 10) / 60;
        values.push(
          useAmerican
            ? Math.round(paceMinPerKmToMinPerSol(paceMinPerKm) * 100) / 100
            : Math.round(pace * 10) / 10,
        );
        hover.push(useAmerican ? formatPace(paceMinPerKm) : formatPace100m(pace));
      }
    }

    return { dates, values, hover };
  }, [workouts, kind, useAmerican, formatSpeed, formatPace]);

  const title = kind === "bike-speed" ? "Скорость по тренировкам" : "Темп по тренировкам";
  const yTitle =
    kind === "bike-speed"
      ? useAmerican
        ? SPEED_AXIS_AMERICAN
        : SPEED_AXIS_METRIC
      : useAmerican
        ? "мин/SoL"
        : "сек / 100 м";

  if (!chart.dates.length) {
    return (
      <div className="card-panel mt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 py-6 text-center">
          Нет данных для графика за выбранный период
        </p>
      </div>
    );
  }

  return (
    <div className="card-panel mt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <PlotChart
        data={[
          {
            x: chart.dates,
            y: chart.values,
            text: chart.hover,
            hovertemplate: "%{x}<br>%{text}<extra></extra>",
            type: "scatter",
            mode: "lines+markers",
            name: yTitle,
            line: { color: kind === "bike-speed" ? "#2563eb" : "#0891b2" },
            marker: { size: 7 },
          },
        ]}
        layout={{
          margin: { t: 8, r: 16, b: 48, l: 48 },
          xaxis: { title: { text: "Дата" }, tickangle: -35 },
          yaxis: { title: { text: yTitle } },
        }}
      />
    </div>
  );
}
