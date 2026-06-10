import { useUnits } from "../hooks/useUnits";
import { speedKmhToPaceMinPerKm } from "../utils/format";
import {
  formatClockFromStart,
  formatElapsed,
  speedToColor,
  type SpeedColorProfile,
  type TrackPoint,
} from "../utils/bikeTrack";
import { isRunningSpeedProfile } from "../config/speedColorScale";

function hasPositiveNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function hasFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

/** Shared map tooltip / popup for cardio route points (running and cycling). */
export function RoutePointTelemetry({
  point,
  startTime,
  speedProfile,
  compact = false,
}: {
  point: TrackPoint;
  startTime?: string | null;
  speedProfile: SpeedColorProfile;
  compact?: boolean;
}) {
  const { formatElevation, formatTemperature, formatSpeed, formatDistance, formatPace } = useUnits();
  const isRunning = isRunningSpeedProfile(speedProfile);
  const distanceLabel =
    hasFiniteNumber(point.distanceM) ? formatDistance(point.distanceM / 1000) : null;

  return (
    <div className={`space-y-0.5 min-w-[11rem] ${compact ? "text-[10px]" : "text-xs"}`}>
      <p className="font-medium text-slate-800 dark:text-slate-100">
        {formatClockFromStart(startTime, point.elapsedSec)}
        {!compact && (
          <span className="font-normal text-slate-400 dark:text-slate-500">
            {" "}
            (+{formatElapsed(point.elapsedSec)})
          </span>
        )}
      </p>
      {hasPositiveNumber(point.speedKmh) && (
        <p>
          <span className="text-slate-500">{isRunning ? "Темп: " : "Скорость: "}</span>
          <span className="font-semibold tabular-nums inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ backgroundColor: speedToColor(point.speedKmh, speedProfile) }}
            />
            {isRunning
              ? (() => {
                  const pace = speedKmhToPaceMinPerKm(point.speedKmh);
                  return pace != null ? formatPace(pace) : formatSpeed(point.speedKmh);
                })()
              : formatSpeed(point.speedKmh)}
          </span>
          {isRunning ? (
            <span className="text-slate-400 dark:text-slate-500 ml-1">
              ({formatSpeed(point.speedKmh)})
            </span>
          ) : null}
        </p>
      )}
      {distanceLabel != null && (
        <p>
          <span className="text-slate-500">Дистанция: </span>
          {distanceLabel}
        </p>
      )}
      {hasFiniteNumber(point.elevationM) && (
        <p>
          <span className="text-slate-500">Высота: </span>
          {formatElevation(point.elevationM)}
        </p>
      )}
      {hasPositiveNumber(point.cadence) && (
        <p>
          <span className="text-slate-500">Каденс: </span>
          {Math.round(point.cadence)} об/мин
        </p>
      )}
      {hasPositiveNumber(point.powerWatts) && (
        <p>
          <span className="text-slate-500">Мощность: </span>
          {Math.round(point.powerWatts)} Вт
        </p>
      )}
      {hasFiniteNumber(point.temperatureC) && (
        <p>
          <span className="text-slate-500">Темп.: </span>
          {formatTemperature(point.temperatureC)}
        </p>
      )}
      {hasPositiveNumber(point.heartRate) && (
        <p>
          <span className="text-slate-500">Пульс: </span>
          {Math.round(point.heartRate)} уд/мин
        </p>
      )}
    </div>
  );
}
