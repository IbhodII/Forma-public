import type { HeartRatePoint, StrengthHrDetectedBlock } from "../types";
import { formatDuration } from "./format";
import {
  formatBlockChartLabel,
  formatBlockHoverHtml,
} from "./strengthHrBlockLabels";

export type HrChartAxis = "time" | "distance";

export interface HrChartPoint {
  x: number;
  y: number;
  hover: string;
}

/** Скользящее среднее пульса (для 5-секундных агрегатов Polar и шума). */

/** Прореживание для Plotly */
export function smoothHrPoints(points: HeartRatePoint[], windowSize = 5): HeartRatePoint[] {
  if (windowSize <= 1 || points.length <= 2) {
    return [...points].sort((a, b) => a.seconds - b.seconds);
  }
  const sorted = [...points].sort((a, b) => a.seconds - b.seconds);
  const half = Math.floor(windowSize / 2);
  return sorted.map((p, i) => {
    const slice = sorted.slice(Math.max(0, i - half), Math.min(sorted.length, i + half + 1));
    const avg = Math.round(slice.reduce((s, x) => s + x.heart_rate, 0) / slice.length);
    return { ...p, heart_rate: avg };
  });
}

export function downsampleHr<T>(rows: T[], maxPoints = 2000): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = Math.max(Math.floor(rows.length / maxPoints), 1);
  return rows.filter((_, i) => i % step === 0);
}

/** Активное время: накапливается только когда растёт дистанция (как в Streamlit). */
export function withMovingElapsed(points: HeartRatePoint[]): (HeartRatePoint & {
  distance_km: number;
  moving_elapsed_sec: number;
  moving_time_label: string;
})[] {
  const sorted = [...points]
    .filter((p) => p.distance_m != null && !Number.isNaN(p.distance_m))
    .sort((a, b) => a.seconds - b.seconds);

  let total = 0;
  let prevElapsed: number | null = null;
  let prevDistKm: number | null = null;

  return sorted.map((p) => {
    const distKm = p.distance_m! / 1000;
    if (
      prevElapsed != null &&
      prevDistKm != null &&
      distKm > prevDistKm + 1e-6
    ) {
      total += Math.round(p.seconds - prevElapsed);
    }
    prevElapsed = p.seconds;
    prevDistKm = distKm;
    const moving = total;
    return {
      ...p,
      distance_km: distKm,
      moving_elapsed_sec: moving,
      moving_time_label: moving > 0 ? formatDuration(moving) : "0 сек",
    };
  });
}

export type HrSeriesUnits = {
  formatDistance: (km: number) => string;
  distanceAxisTitle: string;
  convertDistanceX: (km: number) => number;
};

export function buildHrSeries(
  points: HeartRatePoint[],
  axis: HrChartAxis,
  units?: HrSeriesUnits,
  timeAxisSeconds = false,
): { series: HrChartPoint[]; xTitle: string; chartTitle: string; hasDistance: boolean } {
  if (!points.length) {
    return { series: [], xTitle: "", chartTitle: "", hasDistance: false };
  }

  const hasDistance = points.some((p) => p.distance_m != null && p.distance_m > 0);

  if (axis === "distance") {
    if (!hasDistance) {
      return {
        series: [],
        xTitle: "Дистанция, км",
        chartTitle: "По дистанции (без остановок)",
        hasDistance: false,
      };
    }
    const enriched = downsampleHr(withMovingElapsed(points));
    const xTitle = units ? `Дистанция, ${units.distanceAxisTitle}` : "Дистанция, км";
    return {
      series: enriched.map((p) => ({
        x: units ? units.convertDistanceX(p.distance_km) : p.distance_km,
        y: p.heart_rate,
        hover: units
          ? `Дистанция: ${units.formatDistance(p.distance_km)}<br>Пульс: ${p.heart_rate} уд/мин<br>Время без остановок: ${p.moving_time_label}`
          : `Дистанция: ${p.distance_km.toFixed(2)} км<br>Пульс: ${p.heart_rate} уд/мин<br>Время без остановок: ${p.moving_time_label}`,
      })),
      xTitle,
      chartTitle: "По дистанции (остановки не растягивают ось X)",
      hasDistance: true,
    };
  }

  const sorted = downsampleHr([...points].sort((a, b) => a.seconds - b.seconds));
  return {
    series: sorted.map((p) => {
      const label = p.seconds > 0 ? formatDuration(p.seconds) : "0 сек";
      return {
        x: timeAxisSeconds ? p.seconds : p.seconds / 60,
        y: p.heart_rate,
        hover: `Время: ${p.seconds} с (${label})<br>Пульс: ${p.heart_rate} уд/мин`,
      };
    }),
    xTitle: timeAxisSeconds ? "Секунды (elapsed_sec)" : "Минуты от старта",
    chartTitle: timeAxisSeconds
      ? "Пульс по времени"
      : "По времени (включая остановки)",
    hasDistance,
  };
}

const BLOCK_FILL = [
  "rgba(34, 197, 94, 0.07)",
  "rgba(59, 130, 246, 0.07)",
  "rgba(245, 158, 11, 0.07)",
  "rgba(168, 85, 247, 0.07)",
];
const BLOCK_EDGE = [
  "rgba(34, 197, 94, 0.32)",
  "rgba(59, 130, 246, 0.32)",
  "rgba(245, 158, 11, 0.32)",
  "rgba(168, 85, 247, 0.32)",
];

/** Whether set labels should appear on chart overlays (high confidence only, or manual toggle). */
export function shouldAutoShowSetMapping(
  confidence: string | null | undefined,
  manualOverride: boolean,
): boolean {
  if (manualOverride) return true;
  return confidence === "high";
}

const WARMUP_FILL = "rgba(148, 163, 184, 0.12)";
const WARMUP_EDGE = "rgba(148, 163, 184, 0.45)";

const NOISE_REST_FILL = "rgba(100, 116, 139, 0.14)";
const NOISE_REST_EDGE = "rgba(100, 116, 139, 0.55)";

function blockStyle(
  b: StrengthHrDetectedBlock,
  colorIdx: number,
  editMode = false,
  isSelected = false,
): { fill: string; edge: string; dash: string; lineWidth: number } {
  const kind = (b as StrengthHrDetectedBlock & { kind?: string }).kind;
  if (kind === "noise" || kind === "rest") {
    const lineWidth = editMode ? (isSelected ? 1.5 : 1) : 0.75;
    return { fill: NOISE_REST_FILL, edge: NOISE_REST_EDGE, dash: "dash", lineWidth };
  }
  if (b.is_warmup) {
    const lineWidth = editMode ? (isSelected ? 1.2 : 0.85) : 0.5;
    return { fill: WARMUP_FILL, edge: WARMUP_EDGE, dash: "dash", lineWidth };
  }
  const fill = BLOCK_FILL[colorIdx];
  const edge = BLOCK_EDGE[colorIdx];
  let baseWidth = editMode ? 1 : b.confidence === "high" ? 0.75 : 0.5;
  if (isSelected && editMode) baseWidth = 1.5;
  if (b.confidence === "low") {
    const mutedFill = isSelected && editMode ? fill.replace("0.07", "0.08") : fill.replace("0.07", "0.04");
    const mutedEdge = isSelected && editMode ? edge.replace("0.32", "0.55") : edge.replace("0.32", "0.22");
    return { fill: mutedFill, edge: mutedEdge, dash: "dot", lineWidth: baseWidth };
  }
  if (b.confidence === "medium") {
    const mutedFill = isSelected && editMode ? fill.replace("0.07", "0.12") : fill;
    const mutedEdge = isSelected && editMode ? edge.replace("0.32", "0.55") : edge.replace("0.32", "0.26");
    return { fill: mutedFill, edge: mutedEdge, dash: "dot", lineWidth: baseWidth };
  }
  const activeFill = isSelected && editMode ? fill.replace("0.07", "0.16") : fill.replace("0.07", "0.1");
  const activeEdge = isSelected && editMode ? edge.replace("0.32", "0.65") : edge.replace("0.32", "0.45");
  return { fill: activeFill, edge: activeEdge, dash: "solid", lineWidth: baseWidth };
}

function blockToX(sec: number, timeAxisSeconds: boolean): number {
  return timeAxisSeconds ? sec : sec / 60;
}


/** Plotly overlay shapes/annotations + invisible hover markers for detected HR blocks. */
export function buildHrBlockOverlays(
  blocks: StrengthHrDetectedBlock[],
  timeAxisSeconds: boolean,
  showSetMapping = false,
  editMode = false,
  selectedBlockId: number | null = null,
): {
  shapes: Record<string, unknown>[];
  annotations: Record<string, unknown>[];
  hoverTrace: Record<string, unknown> | null;
} {
  if (!blocks.length) {
    return { shapes: [], annotations: [], hoverTrace: null };
  }

  const shapes: Record<string, unknown>[] = [];
  const annotations: Record<string, unknown>[] = [];
  const hoverX: number[] = [];
  const hoverY: number[] = [];
  const hoverText: string[] = [];

  for (const b of blocks) {
    const x0 = blockToX(b.start_sec, timeAxisSeconds);
    const x1 = blockToX(b.end_sec, timeAxisSeconds);
    const colorIdx = (b.block_index - 1) % BLOCK_FILL.length;
    const blockId = (b as StrengthHrDetectedBlock & { block_id?: number }).block_id ?? b.block_index;
    const isSelected = selectedBlockId != null && blockId === selectedBlockId;
    const { fill, edge, dash, lineWidth } = blockStyle(b, colorIdx, editMode, isSelected);

    shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0,
      x1,
      y0: 0,
      y1: 1,
      fillcolor: fill,
      line: { width: 0 },
      layer: "below",
    });
    for (const x of [x0, x1]) {
      shapes.push({
        type: "line",
        xref: "x",
        yref: "paper",
        x0: x,
        x1: x,
        y0: 0,
        y1: 1,
        line: { color: edge, width: lineWidth, dash },
        layer: "below",
      });
    }

    const mapping = editMode || showSetMapping;
    const label = formatBlockChartLabel(b, mapping, editMode);
    if (label && (x1 - x0) > (timeAxisSeconds ? 8 : 0.12)) {
      annotations.push({
        x: (x0 + x1) / 2,
        y: 1,
        xref: "x",
        yref: "paper",
        text: label,
        showarrow: false,
        yanchor: "bottom",
        yshift: 2,
        font: { size: 8, color: edge.replace("0.32", "0.85") },
        bgcolor: "rgba(255,255,255,0.55)",
        borderwidth: 0,
      });
    }

    const midX = (x0 + x1) / 2;
    hoverX.push(midX);
    hoverY.push(b.peak_hr ?? b.avg_hr ?? 0);
    hoverText.push(formatBlockHoverHtml(b, mapping));
  }

  const hoverTrace = {
    x: hoverX,
    y: hoverY,
    customdata: hoverText,
    type: "scatter",
    mode: "markers",
    name: "",
    marker: { size: 16, opacity: 0, color: "rgba(0,0,0,0)" },
    hovertemplate: "%{customdata}<extra></extra>",
    showlegend: false,
  };

  return { shapes, annotations, hoverTrace };
}
