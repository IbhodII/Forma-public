import type { PlotParams } from "react-plotly.js";
import type { BodyMetricRow } from "../../../types";
import { BODY_METRIC_DECIMALS, sortRowsByDateAsc } from "../../../utils/bodyMetrics";
import { chartDateLabel } from "../../Analytics/utils/chartDates";
import { formatNumber } from "../../../utils/format";
import { cmToDick, kgToJapanese } from "../../../utils/americanUnits";

const COMPOSITION_KG_KEYS = new Set(["weight_kg", "muscle_mass_kg"]);
const BODY_FAT_PERCENT_KEY = "body_fat_percent";

function kgToChartJp(kg: number): number {
  return Number(formatNumber(kgToJapanese(kg), 1));
}

function cmToChartDk(cm: number): number {
  return Number(formatNumber(cmToDick(cm), 2));
}

function chartYValue(key: string, value: number, useAmerican: boolean): number {
  if (useAmerican && COMPOSITION_KG_KEYS.has(key)) {
    return kgToChartJp(value);
  }
  if (useAmerican && key.endsWith("_cm")) {
    return cmToChartDk(value);
  }
  const factor = 10 ** BODY_METRIC_DECIMALS;
  return Math.round(value * factor) / factor;
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildBodyChartTraces(
  rows: BodyMetricRow[],
  lines: { key: string; label: string; color: string }[],
  activeKeys: string[],
  useAmerican: boolean,
  focusKey: string | null,
): NonNullable<PlotParams["data"]> {
  const sorted = sortRowsByDateAsc(rows);
  const dates = sorted.map((r) => chartDateLabel(String(r.date)));
  const traces: NonNullable<PlotParams["data"]> = [];

  for (const line of lines) {
    if (!activeKeys.includes(line.key)) continue;
    if (focusKey && focusKey !== line.key) continue;

    const y = sorted.map((r) => {
      const v = Number(r[line.key as keyof BodyMetricRow]);
      if (!Number.isFinite(v) || v <= 0) return null;
      return chartYValue(line.key, v, useAmerican);
    });
    if (!y.some((v) => v != null)) continue;

    const focused = focusKey === line.key;
    const isFatPercent = line.key === BODY_FAT_PERCENT_KEY;
    traces.push({
      x: dates,
      y,
      type: "scatter",
      mode: "lines",
      name: line.label,
      ...(isFatPercent ? { yaxis: "y2" as const } : {}),
      line: {
        color: line.color,
        width: focused ? 3 : 2.25,
        shape: "spline",
      },
      fill: focused ? "tozeroy" : "none",
      fillcolor: hexAlpha(line.color, 0.15),
      connectgaps: true,
      hovertemplate: isFatPercent
        ? `${line.label}: %{y:.2f}%<extra></extra>`
        : `${line.label}: %{y:.2f}<extra></extra>`,
    });
  }
  return traces;
}

export const BODY_CHART_LAYOUT: NonNullable<PlotParams["layout"]> = {
  margin: { t: 8, r: 16, b: 48, l: 52 },
  autosize: true,
  xaxis: { tickangle: -30, automargin: true, showgrid: false },
  yaxis: { automargin: true, zeroline: false, showgrid: true },
  legend: { orientation: "h", y: 1.14, x: 0, xanchor: "left" },
  hovermode: "x unified",
  transition: { duration: 350, easing: "cubic-in-out" as const },
};
