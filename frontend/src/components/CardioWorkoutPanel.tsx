import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchGps,
  fetchHeartRate,
  fetchWorkoutPoints,
  fetchWorkoutPower,
  fetchWorkoutSensors,
  fetchWorkoutSources,
} from "../api/cardio";
import { CardioDataIntervalSelect } from "./CardioDataIntervalSelect";
import { ChartAxisToggle } from "./ChartAxisToggle";
import {
  isAllPointsInterval,
  loadCardioDataInterval,
  saveCardioDataInterval,
  type CardioDataInterval,
} from "../utils/cardioDataInterval";
import { queryKeys } from "../hooks/queryKeys";
import { useUnits, type UnitsFormatters } from "../hooks/useUnits";
import type { CardioWorkout } from "../types";
import {
  CARDIO_BIKE,
  CARDIO_POOL,
  CARDIO_RUN,
  CARDIO_SOURCE_POLAR,
  cardioTypeLabel,
} from "../utils/constants";
import {
  chestStrapKcal,
  formatDateRu,
  formatDuration,
  formatPace100m,
  paceMinPerKm,
  paceSecPer100m,
  speedKmh,
} from "../utils/format";
import { enrichTrackPoints, parseTrackGeojson, type TrackPoint } from "../utils/bikeTrack";
import type { HrChartAxis } from "../utils/hrChart";
import { parseApiError } from "../utils/validation";
import { legacyDataSourceToType } from "../utils/workoutSources";
import { BikeGpsMap } from "./BikeGpsMap";
import { BikePowerChart } from "./BikePowerChart";
import { BikeWorkoutCharts } from "./BikeWorkoutCharts";
import { ErrorAlert } from "./ErrorAlert";
import { HeartRateChart } from "./HeartRateChart";
import { Loader } from "./Loader";
import { MetricSourceLine } from "./sources/MetricSourceLine";
import { SourceConflictBanner } from "./sources/SourceConflictBanner";
import { WorkoutSourceBadge } from "./sources/WorkoutSourceBadge";
import "./cardio-workout-panel.css";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[rgb(var(--app-surface-subtle))] border border-[rgb(var(--app-border))] px-2 py-1.5 min-w-0">
      <p className="text-[10px] sm:text-xs text-[rgb(var(--app-text-muted))] truncate">{label}</p>
      <p className="text-xs sm:text-sm font-semibold text-[rgb(var(--app-text))] truncate">{value}</p>
    </div>
  );
}

function isPoolCardioType(type: string): boolean {
  return type === CARDIO_POOL || type === "swim";
}

function bikeWorkoutHasPower(workout: CardioWorkout): boolean {
  if (workout.has_power_data) return true;
  if (workout.power_source === "real") return true;
  if (
    workout.power_source === "estimated" &&
    workout.estimated_avg_power_watts != null &&
    workout.estimated_avg_power_watts > 0
  ) {
    return true;
  }
  if (workout.avg_power_watts != null && workout.avg_power_watts > 0) return true;
  return false;
}

function BikePowerSection({
  workout,
  onFocus,
}: {
  workout: CardioWorkout;
  onFocus?: (elapsedSec: number | null) => void;
}) {
  const { formatPower } = useUnits();
  const qc = useQueryClient();
  const [showChart, setShowChart] = useState(false);

  const storedSource =
    workout.power_source ?? (workout.has_power_data ? "real" : null);
  const hasStoredValue = bikeWorkoutHasPower(workout);

  const ensureQuery = useQuery({
    queryKey: queryKeys.cardioPower(workout.id),
    queryFn: async () => {
      const data = await fetchWorkoutPower(workout.id);
      if (data.avg_power != null && data.avg_power > 0) {
        void qc.invalidateQueries({ queryKey: ["cardio"] });
      }
      return data;
    },
    enabled: !hasStoredValue,
    staleTime: Infinity,
    retry: false,
  });

  const source = ensureQuery.data?.source ?? storedSource;
  const avgPower =
    ensureQuery.data?.avg_power ??
    (storedSource === "estimated"
      ? workout.estimated_avg_power_watts
      : workout.avg_power_watts ?? workout.avg_power);
  const isReal =
    source === "real" ||
    Boolean(workout.has_power_data) ||
    Boolean(ensureQuery.data?.has_real);
  const isEstimated = source === "estimated" || Boolean(ensureQuery.data?.has_estimated);
  const hasValue = avgPower != null && avgPower > 0;

  const chartQuery = useQuery({
    queryKey: [...queryKeys.cardioPower(workout.id), "series"],
    queryFn: () => fetchWorkoutPower(workout.id),
    enabled: showChart && isReal,
    staleTime: 5 * 60_000,
  });

  const isLoading = !hasStoredValue && ensureQuery.isLoading;
  if (isLoading) {
    return (
      <div className="col-span-full pt-1">
        <Loader label="Расчёт мощности…" />
      </div>
    );
  }

  if (!hasValue) {
    return null;
  }

  const estimatedTooltip =
    "Оценочная мощность по упрощённой модели (качение + подъём, без аэродинамики). " +
    "Для точных данных используйте датчик мощности.";

  return (
    <div className="col-span-full space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[rgb(var(--app-text-muted))] font-medium">Средняя мощность:</span>
        <span className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
          {formatPower(avgPower!)}
          {isEstimated && (
            <span
              className="ml-1.5 inline-flex items-center text-amber-600 cursor-help"
              title={estimatedTooltip}
            >
              ?
            </span>
          )}
        </span>
        {isReal && (
          <button
            type="button"
            className="btn-secondary text-xs py-1"
            onClick={() => setShowChart((v) => !v)}
          >
            {showChart ? "Скрыть график мощности" : "Показать график мощности"}
          </button>
        )}
      </div>
      {isEstimated && (
        <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed max-w-2xl">{estimatedTooltip}</p>
      )}
      {showChart && isReal && (
        <div className="min-w-0">
          {chartQuery.isLoading && <Loader label="Мощность…" />}
          {chartQuery.isError && <ErrorAlert message={parseApiError(chartQuery.error)} />}
          {chartQuery.data && chartQuery.data.series.length > 0 && (
            <BikePowerChart
              data={chartQuery.data}
              onFocus={(sec) => onFocus?.(sec)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InfoTab({
  workout,
  onPowerFocus,
}: {
  workout: CardioWorkout;
  onPowerFocus?: (elapsedSec: number | null) => void;
}) {
  const { formatSpeed, formatSwimSpeed, formatPace, formatEnergy, formatDistance } = useUnits();
  const isPool = isPoolCardioType(workout.type);
  const isRun = workout.type === CARDIO_RUN;
  const isBike = workout.type === CARDIO_BIKE;

  const spd = speedKmh(workout.distance_km, workout.duration_sec, workout.avg_speed_kmh);
  const maxSpd =
    workout.max_speed_kmh != null && workout.max_speed_kmh > 0
      ? workout.max_speed_kmh
      : null;
  const paceKm = paceMinPerKm(workout.distance_km, workout.duration_sec);
  const pace100 = paceSecPer100m(
    workout.distance_km,
    workout.duration_sec,
    workout.pace_sec_100m,
  );
  const cadence =
    workout.avg_cadence != null && workout.avg_cadence > 0
      ? `${Math.round(workout.avg_cadence)} об/мин`
      : "—";

  const metrics: { label: string; value: string }[] = [
    { label: "Дистанция", value: formatDistance(workout.distance_km) },
    { label: "Время", value: formatDuration(workout.duration_sec) },
  ];

  if (isPool) {
    metrics.push({ label: "Темп", value: formatPace100m(pace100) });
    if (spd != null) {
      metrics.push({ label: "Средняя скорость", value: formatSwimSpeed(spd) });
    }
    if (workout.swolf != null) metrics.push({ label: "SWOLF", value: String(workout.swolf) });
    if (workout.calories_watch != null) {
      metrics.push({ label: "Ккал (часы)", value: formatEnergy(workout.calories_watch) });
    }
  } else if (isRun) {
    metrics.push({
      label: "Темп",
      value: paceKm != null ? formatPace(paceKm) : "—",
    });
    if (spd != null) {
      metrics.push({ label: "Средняя скорость", value: formatSpeed(spd) });
    }
    if (maxSpd != null) {
      metrics.push({ label: "Макс. скорость", value: formatSpeed(maxSpd) });
    }
    metrics.push({
      label: "Средний пульс",
      value: workout.avg_hr ? `${workout.avg_hr} уд/мин` : "—",
    });
    metrics.push({
      label: "Макс. пульс",
      value: workout.max_hr ? `${workout.max_hr} уд/мин` : "—",
    });
    if (workout.calories_watch != null) {
      metrics.push({ label: "Ккал (часы)", value: formatEnergy(workout.calories_watch) });
    }
    if (workout.calories_chest != null) {
      metrics.push({ label: "Ккал (пульсометр)", value: formatEnergy(workout.calories_chest) });
    }
  } else {
    metrics.push({
      label: "Средний пульс",
      value: workout.avg_hr ? `${workout.avg_hr} уд/мин` : "—",
    });
    metrics.push({
      label: "Макс. пульс",
      value: workout.max_hr ? `${workout.max_hr} уд/мин` : "—",
    });
    metrics.push({
      label: "Средняя скорость",
      value: spd != null ? formatSpeed(spd) : "—",
    });
    if (maxSpd != null) {
      metrics.push({ label: "Макс. скорость", value: formatSpeed(maxSpd) });
    }
    if (isBike) metrics.push({ label: "Каденс", value: cadence });
    if (workout.calories_chest != null) {
      metrics.push({ label: "Ккал (пульсометр)", value: formatEnergy(workout.calories_chest) });
    }
    if (workout.calories_watch != null) {
      metrics.push({ label: "Ккал (часы)", value: formatEnergy(workout.calories_watch) });
    }
  }

  if (workout.start_time) {
    metrics.push({ label: "Старт", value: workout.start_time.slice(0, 16) });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5 pt-2">
        {metrics.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} />
        ))}
      </div>
      {isBike && <BikePowerSection workout={workout} onFocus={onPowerFocus} />}
    </div>
  );
}

function resolveFocusPoint(points: TrackPoint[], elapsedSec: number): TrackPoint | null {
  let best: TrackPoint | null = null;
  let bestDiff = Infinity;
  for (const p of points) {
    const d = Math.abs(p.elapsedSec - elapsedSec);
    if (d < bestDiff) {
      bestDiff = d;
      best = p;
    }
  }
  return best;
}

export function CardioWorkoutPanel({
  workout,
  hasHr,
  hasGps,
  hasSensors = false,
}: {
  workout: CardioWorkout;
  hasHr: boolean;
  hasGps: boolean;
  hasSensors?: boolean;
}) {
  const isPool = workout.type === CARDIO_POOL;
  const isBike = workout.type === CARDIO_BIKE;
  const isRun = workout.type === CARDIO_RUN;
  const isPolar = workout.data_source === CARDIO_SOURCE_POLAR;

  const showHrButton = hasHr && !isPool;
  const showMapButton = hasGps && (isBike || isRun);
  const showSensorsButton = hasSensors && (isBike || isRun);

  const [hrOpen, setHrOpen] = useState(showHrButton);
  const [mapOpen, setMapOpen] = useState(false);
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const [chartAxis, setChartAxis] = useState<HrChartAxis>("time");
  const [focusElapsed, setFocusElapsed] = useState<number | null>(null);
  const [dataInterval, setDataInterval] = useState<CardioDataInterval>(() => loadCardioDataInterval());
  const allPointsMode = isAllPointsInterval(dataInterval);
  const qc = useQueryClient();

  const handleIntervalChange = (next: CardioDataInterval) => {
    setDataInterval(next);
    saveCardioDataInterval(next);
    setFocusElapsed(null);
    void qc.invalidateQueries({ queryKey: queryKeys.cardioPoints(workout.id, next) });
    void qc.invalidateQueries({ queryKey: queryKeys.cardioSensors(workout.id, next) });
  };

  const hrQuery = useQuery({
    queryKey: queryKeys.cardioHr(workout.id),
    queryFn: () => fetchHeartRate(workout.id),
    enabled: showHrButton && hrOpen,
    staleTime: 5 * 60_000,
  });

  const gpsQuery = useQuery({
    queryKey: queryKeys.cardioGps(workout.id),
    queryFn: () => fetchGps(workout.id),
    enabled: showMapButton && mapOpen,
    staleTime: 5 * 60_000,
  });

  const sensorsQuery = useQuery({
    queryKey: queryKeys.cardioSensors(workout.id, dataInterval),
    queryFn: () => fetchWorkoutSensors(workout.id, dataInterval),
    enabled: showSensorsButton && sensorsOpen,
    staleTime: 5 * 60_000,
  });

  /** Детальные точки для hover — вело/бег с GPS (FIT или обогащённый GeoJSON). */
  const usePointsQuery = mapOpen && showMapButton && (isBike || isRun);
  const pointsQuery = useQuery({
    queryKey: queryKeys.cardioPoints(workout.id, dataInterval),
    queryFn: () => fetchWorkoutPoints(workout.id, dataInterval),
    enabled: usePointsQuery,
    staleTime: 5 * 60_000,
  });

  const sourcesQuery = useQuery({
    queryKey: queryKeys.cardioSources(workout.id),
    queryFn: () => fetchWorkoutSources(workout.id),
    staleTime: 5 * 60_000,
  });

  const canDistance = useMemo(() => {
    if (hrQuery.data?.points.some((p) => p.distance_m != null && (p.distance_m ?? 0) > 0)) {
      return true;
    }
    if (sensorsQuery.data?.distance_m.some((d) => d != null && d > 0)) {
      return true;
    }
    return false;
  }, [hrQuery.data, sensorsQuery.data]);

  useEffect(() => {
    if (!canDistance && chartAxis === "distance") {
      setChartAxis("time");
    }
  }, [canDistance, chartAxis]);
  const track = useMemo(
    () => (gpsQuery.data ? parseTrackGeojson(gpsQuery.data) : null),
    [gpsQuery.data],
  );

  const mapPoints: TrackPoint[] = useMemo(() => {
    let points: TrackPoint[];
    if (pointsQuery.data?.points.length) {
      points = pointsQuery.data.points.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        elapsedSec: p.elapsed_sec,
        speedKmh: p.speed_kmh ?? null,
        cadence: p.cadence ?? null,
        elevationM: p.elevation_m ?? null,
        temperatureC: p.temperature_c ?? null,
        heartRate: p.heart_rate ?? null,
        distanceM: p.distance_m ?? null,
        powerWatts: p.power_watts ?? null,
      }));
    } else {
      points = track?.points ?? [];
    }
    return enrichTrackPoints(points);
  }, [pointsQuery.data, track]);

  const mapPointsPayload = useMemo(
    () =>
      mapPoints.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        elapsed_sec: p.elapsedSec,
        speed_kmh: p.speedKmh,
        cadence: p.cadence,
        elevation_m: p.elevationM,
        temperature_c: p.temperatureC,
        heart_rate: p.heartRate,
        distance_m: p.distanceM,
        power_watts: p.powerWatts,
      })),
    [mapPoints],
  );

  const hrSmoothWindow = isPolar ? 5 : 0;
  const mapReady =
    Boolean(gpsQuery.data) &&
    !gpsQuery.isLoading &&
    (!usePointsQuery || pointsQuery.isSuccess || pointsQuery.isError);

  const focusPoint = useMemo(() => {
    if (focusElapsed == null) return null;
    const pts = mapPoints.length ? mapPoints : track?.points ?? [];
    if (!pts.length) return null;
    return resolveFocusPoint(pts, focusElapsed);
  }, [focusElapsed, mapPoints, track]);

  const handleChartFocus = (partial: TrackPoint | null) => {
    if (!partial) {
      setFocusElapsed(null);
      return;
    }
    setFocusElapsed(partial.elapsedSec);
  };

  return (
    <div className="border-t border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-4 py-3 space-y-3">
      <InfoTab workout={workout} onPowerFocus={setFocusElapsed} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Источник:</span>
          <WorkoutSourceBadge
            sourceType={
              sourcesQuery.data?.primary_source_type ??
              workout.source_summary?.primary_source_type ??
              legacyDataSourceToType(workout.data_source)
            }
            label={
              sourcesQuery.data?.primary_label ??
              workout.source_summary?.primary_label ??
              workout.data_source
            }
          />
        </div>
        {sourcesQuery.isLoading ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Загрузка источников…</p>
        ) : null}
        {sourcesQuery.isError ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">{parseApiError(sourcesQuery.error)}</p>
        ) : null}
        {sourcesQuery.data?.conflicts?.length ? (
          <SourceConflictBanner conflicts={sourcesQuery.data.conflicts} />
        ) : workout.source_summary?.has_conflicts ? (
          <p className="text-xs text-amber-700 dark:text-amber-200">Есть расхождения между источниками</p>
        ) : null}
        {sourcesQuery.data?.metrics?.length ? (
          <details className="rounded-lg border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface))] px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--app-text))]">
              Источники данных по метрикам
            </summary>
            <div className="mt-2 space-y-1.5">
              {sourcesQuery.data.metrics.map((m) => (
                <MetricSourceLine
                  key={m.metric}
                  metric={m.metric}
                  effectiveLabel={m.effective_label}
                  effectiveSource={m.effective_source}
                  isFallback={m.is_fallback}
                  fallbackLabels={m.fallback_labels}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {workout.avg_hr != null &&
        workout.avg_hr > 0 &&
        !hasHr &&
        !isPool && (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Сводка пульса есть, график недоступен — нет посекундных данных Polar.
          </p>
        )}

      {(showHrButton || showMapButton || showSensorsButton) && (
        <div className="flex flex-wrap gap-2">
          {showHrButton && (
            <button
              type="button"
              className={hrOpen ? "btn-secondary text-xs py-1" : "btn-primary text-xs py-1"}
              onClick={() => {
                setHrOpen((v) => !v);
                if (hrOpen) setFocusElapsed(null);
              }}
            >
              {hrOpen ? "Скрыть пульс" : "📈 Показать пульс"}
            </button>
          )}
          {showMapButton && (
            <button
              type="button"
              className={mapOpen ? "btn-secondary text-xs py-1" : "btn-primary text-xs py-1"}
              onClick={() => {
                setMapOpen((v) => !v);
                if (mapOpen) setFocusElapsed(null);
              }}
            >
              {mapOpen ? "Скрыть карту" : "🗺 Показать карту"}
            </button>
          )}
          {showSensorsButton && (
            <button
              type="button"
              className={sensorsOpen ? "btn-secondary text-xs py-1" : "btn-primary text-xs py-1"}
              onClick={() => setSensorsOpen((v) => !v)}
            >
              {sensorsOpen
                ? isRun
                  ? "Скрыть графики"
                  : "Скрыть датчики (FIT)"
                : isRun
                  ? "Графики темпа и датчиков"
                  : "Датчики (FIT)"}
            </button>
          )}
        </div>
      )}

      {hrOpen && showHrButton && (
        <div className="cardio-analytics-charts-stack min-w-0">
          <ChartAxisToggle axis={chartAxis} onChange={setChartAxis} canDistance={canDistance} />
          {hrQuery.isLoading && <Loader label="Пульс…" />}
          {hrQuery.isError && <ErrorAlert message={parseApiError(hrQuery.error)} />}
          {hrQuery.data && hrQuery.data.points.length > 0 && (
            <div className="cardio-analytics-chart-panel desktop-chart-panel rounded-lg border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface))] p-2 sm:p-2.5 shadow-[var(--app-shadow-sm)]">
              <HeartRateChart
                analytics
                points={hrQuery.data.points}
                axis={chartAxis}
                smoothWindow={hrSmoothWindow}
                timeAxisSeconds={isPolar}
                onPlotClick={
                  mapOpen && showMapButton
                    ? (ev) => {
                        const idx = ev.points?.[0]?.pointIndex;
                        if (idx == null) return;
                        const pt = hrQuery.data?.points[idx];
                        const sec = pt?.elapsed_sec ?? pt?.seconds;
                        if (sec != null) setFocusElapsed(sec);
                      }
                    : undefined
                }
              />
            </div>
          )}
          {hrQuery.isSuccess && (!hrQuery.data || hrQuery.data.points.length === 0) && (
            <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет данных пульса</p>
          )}
        </div>
      )}

      {mapOpen && showMapButton && (
        <div className="min-w-0 space-y-2 pt-1 border-t border-[rgb(var(--app-border)/0.5)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Карта маршрута</p>
            {usePointsQuery && (
              <CardioDataIntervalSelect value={dataInterval} onChange={handleIntervalChange} />
            )}
          </div>
          {gpsQuery.isLoading && <Loader label="Карта…" />}
          {gpsQuery.isError && <ErrorAlert message={parseApiError(gpsQuery.error)} />}
          {usePointsQuery && pointsQuery.isLoading && (
            <Loader
              label={
                allPointsMode ? "Загрузка всех точек из FIT…" : "Загрузка точек маршрута…"
              }
            />
          )}
          {usePointsQuery && pointsQuery.isError && (
            <ErrorAlert message={parseApiError(pointsQuery.error)} />
          )}
          {mapReady && (
            <BikeGpsMap
              geojson={gpsQuery.data!}
              pointsData={mapPointsPayload}
              startTime={workout.start_time}
              workoutType={workout.type}
              focusPoint={focusPoint}
              allPointsMode={allPointsMode}
              onMapPointSelect={(p) => setFocusElapsed(p.elapsedSec)}
              onPopupClose={() => setFocusElapsed(null)}
            />
          )}
          {gpsQuery.isSuccess && !gpsQuery.data && (
            <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет GPS-трека</p>
          )}
        </div>
      )}

      {sensorsOpen && showSensorsButton && (
        <div className="min-w-0 space-y-2 pt-1 border-t border-[rgb(var(--app-border)/0.5)]">
          <ChartAxisToggle axis={chartAxis} onChange={setChartAxis} canDistance={canDistance} />
          {sensorsQuery.isLoading && <Loader label="Датчики…" />}
          {sensorsQuery.isError && (
            <ErrorAlert message={parseApiError(sensorsQuery.error)} />
          )}
          {sensorsQuery.data && sensorsQuery.data.elapsed_sec.length > 0 && (
            <BikeWorkoutCharts
              sensors={sensorsQuery.data}
              axis={chartAxis}
              onFocusPoint={handleChartFocus}
              workoutType={workout.type}
            />
          )}
          {sensorsQuery.data && sensorsQuery.data.elapsed_sec.length === 0 && (
            <p className="text-sm text-[rgb(var(--app-text-muted))]">
              Для графиков нужен повторный импорт FIT (каденс, высота, температура).
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        {formatDateRu(workout.date)} · {cardioTypeLabel(workout.type)} · id {workout.id}
      </p>
    </div>
  );
}

export type CardioUnitsFormat = Pick<
  UnitsFormatters,
  "formatSpeed" | "formatSwimSpeed" | "formatPace" | "formatEnergy" | "formatDistance"
>;

/** Компактные ячейки для свёрнутой строки (велосипед) */
export function bikeRowMetrics(w: CardioWorkout, units: CardioUnitsFormat) {
  const spd = speedKmh(w.distance_km, w.duration_sec, w.avg_speed_kmh);
  const chestKcal = chestStrapKcal(w);
  return {
    hr: w.avg_hr ? `${w.avg_hr} уд/мин` : "—",
    speed: spd != null ? units.formatSpeed(spd) : "—",
    cadence:
      w.avg_cadence != null && w.avg_cadence > 0
        ? `${Math.round(w.avg_cadence)} об/мин`
        : "—",
    watch: w.calories_watch != null ? units.formatEnergy(w.calories_watch) : "—",
    chest: chestKcal != null ? units.formatEnergy(chestKcal) : "—",
  };
}

export function cardioSecondarySummary(workout: CardioWorkout, units: CardioUnitsFormat): string {
  const isPool = isPoolCardioType(workout.type);
  if (isPool) {
    const parts: string[] = [
      formatPace100m(
        paceSecPer100m(workout.distance_km, workout.duration_sec, workout.pace_sec_100m),
      ),
    ];
    const spd = speedKmh(workout.distance_km, workout.duration_sec, workout.avg_speed_kmh);
    if (spd != null) parts.push(units.formatSwimSpeed(spd));
    return parts.join(" · ");
  }
  const parts: string[] = [];
  const pace = paceMinPerKm(workout.distance_km, workout.duration_sec);
  if (pace != null) parts.push(units.formatPace(pace));
  const spd = speedKmh(workout.distance_km, workout.duration_sec, workout.avg_speed_kmh);
  if (spd != null) parts.push(units.formatSpeed(spd));
  if (workout.swolf != null && workout.swolf > 0) {
    parts.push(`SWOLF ${workout.swolf}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function cardioListSummary(workout: CardioWorkout, units: CardioUnitsFormat): string {
  const isPool = isPoolCardioType(workout.type);
  const isBike = workout.type === CARDIO_BIKE;

  if (isPool) {
    const parts: string[] = [
      formatPace100m(
        paceSecPer100m(workout.distance_km, workout.duration_sec, workout.pace_sec_100m),
      ),
    ];
    const spd = speedKmh(workout.distance_km, workout.duration_sec, workout.avg_speed_kmh);
    if (spd != null) parts.push(units.formatSwimSpeed(spd));
    return parts.join(" · ");
  }

  const parts: string[] = [];
  if (workout.avg_hr) parts.push(`пульс ${workout.avg_hr} уд/мин`);

  if (isBike) {
    const m = bikeRowMetrics(workout, units);
    if (m.speed !== "—") parts.push(m.speed);
    if (m.cadence !== "—") parts.push(m.cadence);
    if (workout.calories_watch != null) {
      parts.push(`часы ${units.formatEnergy(workout.calories_watch)}`);
    }
    const chest = chestStrapKcal(workout);
    if (chest != null) {
      parts.push(`пульсометр ${units.formatEnergy(chest)}`);
    }
  } else {
    const pace = paceMinPerKm(workout.distance_km, workout.duration_sec);
    if (pace != null) parts.push(units.formatPace(pace));
    const spd = speedKmh(workout.distance_km, workout.duration_sec, workout.avg_speed_kmh);
    if (spd != null) parts.push(units.formatSpeed(spd));
    if (workout.calories_watch != null) {
      parts.push(`часы ${units.formatEnergy(workout.calories_watch)}`);
    }
    const chest = chestStrapKcal(workout);
    if (chest != null) {
      parts.push(`пульсометр ${units.formatEnergy(chest)}`);
    }
  }

  return parts.length ? parts.join(" · ") : "—";
}
