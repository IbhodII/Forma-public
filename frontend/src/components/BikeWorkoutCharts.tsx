import type { ReactNode } from "react";
import { useMemo } from "react";
import type { Layout } from "plotly.js";
import type { PlotData, PlotMouseEvent } from "plotly.js";
import { PlotChart } from "./Plot";
import type { WorkoutSensors } from "../api/cardio";
import { useUnits } from "../hooks/useUnits";
import { timeChartXAxis, timeHoverLabels } from "../utils/bikeChartLayout";
import { downsampleElevationByDistance } from "../utils/bikeTrack";
import type { TrackPoint } from "../utils/bikeTrack";
import type { HrChartAxis } from "../utils/hrChart";
import {
  convertArrayCelsiusToRj,
  convertArrayKmhToSol,
  convertArrayKmToSol,
  convertArrayMetersToRushmores,
  ELEVATION_AXIS_AMERICAN,
  ELEVATION_AXIS_METRIC,
  convertKmSeries,
  DISTANCE_AXIS_AMERICAN,
  DISTANCE_AXIS_METRIC,
  SPEED_AXIS_AMERICAN,
  SPEED_AXIS_METRIC,
  type ChartUnitsSystem,
} from "../utils/units";

function distanceKmAt(sensors: WorkoutSensors, index: number): number | null {
  const m = sensors.distance_m[index];
  if (m != null && m >= 0) return m / 1000;
  return null;
}

function lineTrace(
  x: number[] | (number | null)[] | string[],
  y: (number | null)[],
  elapsedSec: number[],
  opts: {
    name: string;
    color: string;
    yUnit: string;
    connectgaps?: boolean;
    byDistance?: boolean;
    xDistanceUnit?: string;
  },
): PlotData {
  const labels = timeHoverLabels(elapsedSec);
  const distUnit = opts.xDistanceUnit ?? DISTANCE_AXIS_METRIC;
  const hovertemplate = opts.byDistance
    ? `%{y:.1f} ${opts.yUnit}<br>Дистанция: %{x:.2f} ${distUnit}<br>Время: %{customdata}<extra></extra>`
    : `%{y:.1f} ${opts.yUnit}<br>Время: %{customdata}<extra></extra>`;
  return {
    x,
    y,
    type: "scatter",
    mode: "lines",
    name: opts.name,
    line: { width: 1.5, color: opts.color, shape: "linear" },
    connectgaps: opts.connectgaps ?? false,
    customdata: labels,
    hovertemplate,
  } as PlotData;
}

function resolveAxis(
  sensors: WorkoutSensors,
  axis: HrChartAxis,
  system: ChartUnitsSystem,
): {
  x: (number | null)[];
  elapsed: number[];
  byDistance: boolean;
  xLayout: Partial<Layout["xaxis"]>;
  xDistanceUnit: string;
} {
  const elapsed = sensors.elapsed_sec;
  const distX = elapsed.map((_, i) => distanceKmAt(sensors, i));
  const hasDist = distX.some((v) => v != null);
  if (axis === "distance" && hasDist) {
    const x =
      system === "american" ? convertArrayKmToSol(distX) : distX;
    const xDistanceUnit =
      system === "american" ? DISTANCE_AXIS_AMERICAN : DISTANCE_AXIS_METRIC;
    return {
      x,
      elapsed,
      byDistance: true,
      xLayout: { title: { text: `Дистанция, ${xDistanceUnit}` } },
      xDistanceUnit,
    };
  }
  return {
    x: elapsed,
    elapsed,
    byDistance: false,
    xLayout: timeChartXAxis(elapsed),
    xDistanceUnit: DISTANCE_AXIS_METRIC,
  };
}

function seriesLayout(title: string, yTitle: string, xLayout: Partial<Layout["xaxis"]>): Partial<Layout> {
  return {
    title: { text: title, font: { size: 13 } },
    xaxis: xLayout,
    yaxis: { title: { text: yTitle } },
    margin: { t: 36, r: 12, b: 40, l: 48 },
  };
}

export function BikeWorkoutCharts({
  sensors,
  axis,
  onFocusPoint,
}: {
  sensors: WorkoutSensors;
  axis: HrChartAxis;
  onFocusPoint?: (point: TrackPoint | null) => void;
}) {
  const { system } = useUnits();
  const useAmerican = system === "american";
  const elevationUnit = useAmerican ? ELEVATION_AXIS_AMERICAN : ELEVATION_AXIS_METRIC;
  const temperatureUnit = useAmerican ? "°Rj" : "°C";
  const elevationTitle = useAmerican ? "рашмор" : "м";
  const elevationHoverFmt = useAmerican ? ".3f" : ".0f";
  const speedUnit = useAmerican ? SPEED_AXIS_AMERICAN : SPEED_AXIS_METRIC;

  const { x, elapsed, byDistance, xLayout, xDistanceUnit } = useMemo(
    () => resolveAxis(sensors, axis, system),
    [sensors, axis, system],
  );
  const axisSuffix = byDistance ? "по дистанции" : "по времени";

  const focusElapsed = (elapsedSec: number) => {
    onFocusPoint?.({ lat: 0, lon: 0, elapsedSec });
  };

  const makeClickHandler =
    (elapsedList: number[]) =>
    (ev: Readonly<PlotMouseEvent>): void => {
      const pt = ev.points?.[0];
      if (pt?.pointIndex == null) return;
      focusElapsed(elapsedList[pt.pointIndex as number]);
    };

  const charts: { key: string; node: ReactNode }[] = [];

  if (sensors.has_cadence) {
    const y = sensors.cadence.map((v) => (v != null && v > 0 ? v : null));
    charts.push({
      key: "cadence",
      node: (
        <PlotChart
          compact
          data={[
            lineTrace(x, y, elapsed, {
              name: "Каденс",
              color: "#3b82f6",
              yUnit: "об/мин",
              connectgaps: true,
              byDistance,
              xDistanceUnit,
            }),
          ]}
          layout={seriesLayout(`Каденс, об/мин (${axisSuffix})`, "об/мин", xLayout)}
          onClick={makeClickHandler(elapsed)}
        />
      ),
    });
  } else {
    charts.push({
      key: "cadence-missing",
      node: <p className="text-sm text-slate-500">Нет данных по каденсу</p>,
    });
  }

  if (sensors.has_elevation) {
    const elevationByDist =
      byDistance && sensors.distance_m.some((d) => d != null)
        ? downsampleElevationByDistance(elapsed, sensors.distance_m, sensors.elevation_m)
        : null;
    const yRaw = (elevationByDist?.y ?? sensors.elevation_m) as (number | null)[];
    const y = useAmerican ? convertArrayMetersToRushmores(yRaw) : yRaw;
    const chartXKm = elevationByDist ? elevationByDist.xKm : null;
    const chartX = chartXKm
      ? useAmerican
        ? convertKmSeries(chartXKm)
        : chartXKm
      : x;
    const elapsedSubset = elevationByDist?.elapsedSec ?? elapsed;
    const hoverSubset = timeHoverLabels(elapsedSubset);
    const elevHover = byDistance
      ? `%{y:${elevationHoverFmt}} ${elevationUnit}<br>Дистанция: %{x:.2f} ${xDistanceUnit}<br>Время: %{customdata}<extra></extra>`
      : `%{y:${elevationHoverFmt}} ${elevationUnit}<br>Время: %{customdata}<extra></extra>`;
    const elevXLayout =
      byDistance && elevationByDist
        ? { title: { text: `Дистанция, ${xDistanceUnit}` } }
        : xLayout;
    charts.push({
      key: "elevation",
      node: (
        <PlotChart
          compact
          data={
            [
              {
                x: chartX,
                y,
                type: "scatter",
                mode: "lines",
                name: "Высота",
                line: { width: 1.5, color: "#10b981", shape: "spline" },
                connectgaps: true,
                customdata: hoverSubset,
                hovertemplate: elevHover,
              },
            ] as PlotData[]
          }
          layout={seriesLayout(
            byDistance
              ? `Высота, ${elevationTitle} (по дистанции)`
              : `Высота, ${elevationTitle} (по времени)`,
            elevationUnit,
            elevXLayout,
          )}
          onClick={makeClickHandler(elapsedSubset)}
        />
      ),
    });
  } else {
    charts.push({
      key: "elevation-missing",
      node: <p className="text-sm text-slate-500">Нет данных по высоте (GPS)</p>,
    });
  }

  if (sensors.has_temperature) {
    const yRaw = sensors.temperature_c.map((v) => (v != null ? v : null));
    const y = useAmerican ? convertArrayCelsiusToRj(yRaw) : yRaw;
    charts.push({
      key: "temperature",
      node: (
        <PlotChart
          compact
          data={[
            lineTrace(x, y, elapsed, {
              name: "Температура",
              color: "#f97316",
              yUnit: temperatureUnit,
              connectgaps: true,
              byDistance,
              xDistanceUnit,
            }),
          ]}
          layout={seriesLayout(
            `Температура, ${temperatureUnit} (${axisSuffix})`,
            temperatureUnit,
            xLayout,
          )}
          onClick={makeClickHandler(elapsed)}
        />
      ),
    });
  } else {
    charts.push({
      key: "temperature-missing",
      node: <p className="text-sm text-slate-500">Нет данных по температуре</p>,
    });
  }

  if (sensors.has_speed) {
    const yRaw = sensors.speed_kmh.map((v) => (v != null && v > 0 ? v : null));
    const y = useAmerican ? convertArrayKmhToSol(yRaw) : yRaw;
    charts.push({
      key: "speed",
      node: (
        <PlotChart
          compact
          data={[
            lineTrace(x, y, elapsed, {
              name: "Скорость",
              color: "#8b5cf6",
              yUnit: speedUnit,
              connectgaps: true,
              byDistance,
              xDistanceUnit,
            }),
          ]}
          layout={seriesLayout(`Скорость, ${speedUnit} (${axisSuffix})`, speedUnit, xLayout)}
          onClick={makeClickHandler(elapsed)}
        />
      ),
    });
  }

  return (
    <div className="space-y-3 border-t border-[rgb(var(--app-border)/0.5)] pt-3">
      <p className="text-[10px] text-[rgb(var(--app-text-muted))]">
        Наведение — значение и время; клик подсвечивает точку на карте
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.map((c) => (
          <div
            key={c.key}
            className="min-w-0 rounded-lg border border-[rgb(var(--app-border))] p-2 bg-[rgb(var(--app-surface-subtle)/0.5)]"
          >
            {c.node}
          </div>
        ))}
      </div>
    </div>
  );
}
