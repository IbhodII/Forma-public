import type { PlotData, PlotMouseEvent } from "plotly.js";
import { PlotChart } from "./Plot";
import type { WorkoutPowerResponse } from "../api/cardio";
import { timeChartXAxis, timeHoverLabels } from "../utils/bikeChartLayout";

export function BikePowerChart({
  data,
  onFocus,
}: {
  data: WorkoutPowerResponse;
  onFocus?: (elapsedSec: number | null) => void;
}) {
  const elapsed = data.series.map((p) => p.elapsed_sec);
  const power = data.series.map((p) => p.power_watts);
  const labels = timeHoverLabels(elapsed);

  const trace = {
    x: elapsed,
    y: power,
    type: "scatter" as const,
    mode: "lines" as const,
    name: "Мощность",
    line: { width: 1.5, color: "#7c3aed" },
    customdata: labels,
    hovertemplate: "%{y:.0f} Вт<br>Время: %{customdata}<extra></extra>",
  } as PlotData;

  const handleClick = (ev: Readonly<PlotMouseEvent>) => {
    if (!onFocus || !ev.points?.length) return;
    const x = ev.points[0]?.x;
    onFocus(typeof x === "number" ? x : null);
  };

  return (
    <PlotChart
      data={[trace]}
      layout={{
        title: { text: "Мощность", font: { size: 13 } },
        xaxis: timeChartXAxis(elapsed),
        yaxis: { title: { text: "Вт" } },
        margin: { t: 36, r: 12, b: 40, l: 48 },
      }}
      onClick={handleClick}
      className="min-h-[220px]"
    />
  );
}
