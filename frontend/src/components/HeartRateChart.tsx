import { useMemo } from "react";
import type { PlotParams } from "react-plotly.js";
import type { HeartRatePoint, StrengthHrConfidence, StrengthHrDetectedBlock, StrengthHrMatchQuality } from "../types";
import { useUnits } from "../hooks/useUnits";
import { kmToSol } from "../utils/americanUnits";
import { DISTANCE_AXIS_AMERICAN, DISTANCE_AXIS_METRIC } from "../utils/units";
import {
  buildHrBlockOverlays,
  buildHrSeries,
  smoothHrPoints,
  type HrChartAxis,
} from "../utils/hrChart";
import { PlotChart } from "./Plot";

interface HeartRateChartProps {
  points: HeartRatePoint[];
  axis: HrChartAxis;
  /** Окно скользящего среднего (0 = без сглаживания). */
  smoothWindow?: number;
  /** Ось X в секундах (elapsed_sec), а не в минутах. */
  timeAxisSeconds?: boolean;
  /** Detected strength set/block segments (time axis only). */
  detectedBlocks?: StrengthHrDetectedBlock[];
  matchQuality?: StrengthHrMatchQuality;
  sessionConfidence?: StrengthHrConfidence;
  /** Show exercise/set labels on block overlays (high confidence auto, or manual toggle). */
  showSetMapping?: boolean;
  /** Edit mode: stronger borders, always show assigned labels. */
  editMode?: boolean;
  selectedBlockId?: number | null;
  /** Taller plot area for analytics-first layouts. */
  tall?: boolean;
  /** Inline match-quality banner (off when summary handles warnings). */
  showMatchBanner?: boolean;
  onPlotInitialized?: PlotParams["onInitialized"];
  onPlotUpdate?: PlotParams["onUpdate"];
  onPlotClick?: PlotParams["onClick"];
  onPlotRelayout?: PlotParams["onRelayout"];
  plotClassName?: string;
}

export function HeartRateChart({
  points,
  axis,
  smoothWindow = 0,
  timeAxisSeconds = false,
  detectedBlocks,
  matchQuality,
  sessionConfidence,
  showSetMapping = false,
  editMode = false,
  selectedBlockId = null,
  tall = false,
  showMatchBanner = false,
  onPlotInitialized,
  onPlotUpdate,
  onPlotClick,
  onPlotRelayout,
  plotClassName,
}: HeartRateChartProps) {
  const { system, formatDistance } = useUnits();
  const chartPoints = useMemo(
    () => (smoothWindow > 1 ? smoothHrPoints(points, smoothWindow) : points),
    [points, smoothWindow],
  );
  const hrUnits = useMemo(
    () =>
      system === "american"
        ? {
            formatDistance,
            distanceAxisTitle: DISTANCE_AXIS_AMERICAN,
            convertDistanceX: kmToSol,
          }
        : {
            formatDistance,
            distanceAxisTitle: DISTANCE_AXIS_METRIC,
            convertDistanceX: (km: number) => km,
          },
    [system, formatDistance],
  );
  const built = useMemo(
    () => buildHrSeries(chartPoints, axis, hrUnits, timeAxisSeconds),
    [chartPoints, axis, hrUnits, timeAxisSeconds],
  );
  const canDistance = useMemo(
    () => chartPoints.some((p) => p.distance_m != null && (p.distance_m ?? 0) > 0),
    [chartPoints],
  );

  const blockOverlays = useMemo(() => {
    if (!detectedBlocks?.length || axis !== "time") {
      return { shapes: [], annotations: [], hoverTrace: null };
    }
    return buildHrBlockOverlays(
      detectedBlocks,
      timeAxisSeconds,
      showSetMapping,
      editMode,
      selectedBlockId,
    );
  }, [detectedBlocks, axis, timeAxisSeconds, showSetMapping, editMode, selectedBlockId]);

  const plotData = useMemo(() => {
    const traces: Record<string, unknown>[] = [
      {
        x: built.series.map((s) => s.x),
        y: built.series.map((s) => s.y),
        customdata: built.series.map((s) => s.hover),
        type: "scatter",
        mode: "lines",
        name: "Пульс",
        line: { color: "#dc2626", width: 1.5 },
        hovertemplate: "%{customdata}<extra></extra>",
      },
    ];
    if (blockOverlays.hoverTrace) {
      traces.push(blockOverlays.hoverTrace);
    }
    return traces;
  }, [built.series, blockOverlays.hoverTrace]);

  const plotLayout = useMemo(
    () => ({
      title: tall ? undefined : { text: built.chartTitle, font: { size: 12 } },
      margin: tall ? { t: 28, r: 12, b: 40, l: 48 } : undefined,
      xaxis: { title: { text: built.xTitle, font: { size: tall ? 10 : 11 } } },
      yaxis: { title: { text: "уд/мин", font: { size: tall ? 10 : 11 } } },
      hovermode: "closest" as const,
      shapes: blockOverlays.shapes,
      annotations: blockOverlays.annotations,
      dragmode: editMode ? ("pan" as const) : undefined,
    }),
    [built.chartTitle, built.xTitle, blockOverlays, tall, editMode],
  );

  if (!chartPoints.length) {
    return <p className="text-sm text-slate-500">Нет данных пульса</p>;
  }

  return (
    <div className={tall ? "space-y-1" : "space-y-2"}>
      {axis === "distance" && !canDistance && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Нет дистанции у точек пульса.
        </p>
      )}

      {showMatchBanner && sessionConfidence !== "high" && matchQuality && matchQuality !== "exact" && detectedBlocks?.length ? (
        <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
          {matchQuality === "partial"
            ? "Часть блоков не совпала с подходами."
            : "Блоки только по пульсу, без привязки к подходам."}
        </p>
      ) : null}

      {built.series.length > 0 ? (
        <PlotChart
          compact={!tall}
          tall={tall}
          data={plotData}
          layout={plotLayout}
          className={plotClassName ?? "hr-chart-plot w-full"}
          onInitialized={onPlotInitialized}
          onUpdate={onPlotUpdate}
          onClick={onPlotClick}
          onRelayout={onPlotRelayout}
        />
      ) : (
        axis === "distance" &&
        canDistance && <p className="text-sm text-slate-500">Недостаточно точек с дистанцией</p>
      )}
    </div>
  );
}
