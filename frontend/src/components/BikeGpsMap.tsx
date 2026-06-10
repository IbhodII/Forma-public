import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker as LCircleMarker } from "leaflet";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import {
  getScaleMaxKmh,
  getSpeedLegendTicks,
  isRunningSpeedProfile,
  resolveSpeedColorProfile,
  speedScaleGradientCss,
  type SpeedColorProfile,
} from "../config/speedColorScale";
import { MapAttributionSetup, OSM_TILE_ATTRIBUTION } from "./MapOsmAttribution";
import { useUnits } from "../hooks/useUnits";
import { RoutePointTelemetry } from "./RoutePointTelemetry";
import {
  buildSpeedSegments,
  buildWorkoutSpeedStats,
  enrichTrackPoints,
  findNearestPoint,
  parseTrackGeojson,
  type TrackPoint,
} from "../utils/bikeTrack";
import { speedKmhToPaceMinPerKm } from "../utils/format";
import {
  formatPaceLegendTickLabel,
  formatSpeedLegendTickLabel,
  PACE_AXIS_AMERICAN,
  PACE_AXIS_METRIC,
  SPEED_AXIS_AMERICAN,
  SPEED_AXIS_METRIC,
} from "../utils/units";

const HIT_RADIUS = 8;
const MAX_POINT_MARKERS = 1200;
const HOVER_HIT_DEG = 0.00018;

const canvasRenderer = L.canvas({ padding: 0.5 });

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    const lats = positions.map((p) => (Array.isArray(p) ? p[0] : 0));
    const lngs = positions.map((p) => (Array.isArray(p) ? p[1] : 0));
    const bounds: LatLngBoundsExpression = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, positions]);
  return null;
}

function MapRouteClick({
  points,
  onPin,
  onClear,
}: {
  points: TrackPoint[];
  onPin: (p: TrackPoint) => void;
  onClear: () => void;
}) {
  useMapEvents({
    click(e) {
      const hit = findNearestPoint(points, e.latlng.lat, e.latlng.lng, HOVER_HIT_DEG);
      if (hit) onPin(hit);
      else onClear();
    },
  });
  return null;
}

function MapHoverProbe({
  points,
  startTime,
  speedProfile,
}: {
  points: TrackPoint[];
  startTime?: string | null;
  speedProfile: SpeedColorProfile;
}) {
  const [hover, setHover] = useState<TrackPoint | null>(null);

  useMapEvents({
    mousemove(e) {
      const hit = findNearestPoint(points, e.latlng.lat, e.latlng.lng, HOVER_HIT_DEG);
      setHover(hit);
    },
    mouseout() {
      setHover(null);
    },
  });

  if (!hover) return null;

  return (
    <CircleMarker
      center={[hover.lat, hover.lon]}
      radius={6}
      pathOptions={{
        color: "#0f172a",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 0.95,
      }}
      interactive={false}
    >
      <Tooltip direction="top" offset={[0, -6]} opacity={0.98} permanent>
        <RoutePointTelemetry point={hover} startTime={startTime} speedProfile={speedProfile} compact />
      </Tooltip>
    </CircleMarker>
  );
}

function PinnedPopup({
  point,
  startTime,
  speedProfile,
  onClose,
}: {
  point: TrackPoint;
  startTime?: string | null;
  speedProfile: SpeedColorProfile;
  onClose: () => void;
}) {
  const map = useMap();
  const ref = useRef<LCircleMarker>(null);
  useEffect(() => {
    map.panTo([point.lat, point.lon], { animate: true });
    ref.current?.openPopup();
  }, [map, point.lat, point.lon, point.elapsedSec]);

  return (
    <CircleMarker
      ref={ref}
      center={[point.lat, point.lon]}
      radius={HIT_RADIUS}
      pathOptions={{ color: "#1e293b", weight: 2, fillColor: "#fbbf24", fillOpacity: 1 }}
    >
      <Popup eventHandlers={{ remove: () => onClose() }}>
        <RoutePointTelemetry point={point} startTime={startTime} speedProfile={speedProfile} />
      </Popup>
    </CircleMarker>
  );
}

function FocusPoint({ point }: { point: TrackPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    map.setView([point.lat, point.lon], Math.max(map.getZoom(), 14), { animate: true });
  }, [map, point?.lat, point?.lon]);
  return null;
}

function apiPointToTrack(p: {
  lat: number;
  lon: number;
  elapsed_sec: number;
  speed_kmh?: number | null;
  cadence?: number | null;
  elevation_m?: number | null;
  temperature_c?: number | null;
  heart_rate?: number | null;
  distance_m?: number | null;
  power_watts?: number | null;
}): TrackPoint {
  return {
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
  };
}

function SpeedLegendBar({
  profile,
  system,
  compact = false,
}: {
  profile: SpeedColorProfile;
  system: "metric" | "american";
  compact?: boolean;
}) {
  const isRunning = isRunningSpeedProfile(profile);
  const scaleMax = getScaleMaxKmh(profile);
  const gradient = speedScaleGradientCss(profile);
  const ticks = getSpeedLegendTicks(profile).map((tick) => ({
    ...tick,
    label: isRunning
      ? formatPaceLegendTickLabel(tick.speedKmh, tick.label, system)
      : formatSpeedLegendTickLabel(tick.speedKmh, tick.label, system),
  }));

  return (
    <div className={`relative ${compact ? "pb-2" : "pb-2.5"}`}>
      <div
        className={`w-full rounded-full shadow-inner ${compact ? "h-2" : "h-2.5"}`}
        style={{ background: gradient }}
      />
      <div className="absolute left-0 right-0 top-full leading-none flex justify-between">
        {ticks.map((tick) => (
          <span
            key={tick.speedKmh}
            className="text-[9px] text-slate-500 tabular-nums -translate-x-1/2 first:translate-x-0 last:translate-x-0"
            style={
              tick.speedKmh === 0
                ? { position: "absolute", left: "0" }
                : tick.speedKmh >= scaleMax - 0.5
                  ? { position: "absolute", right: "0" }
                  : { position: "absolute", left: `${tick.positionPct}%` }
            }
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpeedLegend({
  profile,
  workoutStats,
}: {
  profile: SpeedColorProfile;
  workoutStats?: ReturnType<typeof buildWorkoutSpeedStats> | null;
}) {
  const { system, formatSpeed, formatPace } = useUnits();
  const isRunning = isRunningSpeedProfile(profile);
  const axisUnit = isRunning
    ? system === "american"
      ? PACE_AXIS_AMERICAN
      : PACE_AXIS_METRIC
    : system === "american"
      ? SPEED_AXIS_AMERICAN
      : SPEED_AXIS_METRIC;

  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 space-y-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold text-[rgb(var(--app-text))] uppercase tracking-wide">
          {isRunning ? "Темп" : "Скорость"} · {axisUnit}
        </p>
        <p className="text-[10px] text-[rgb(var(--app-text-muted))]">
          {isRunning
            ? "Фиксированная шкала · сравнимо между пробежками"
            : "Фиксированная шкала · сравнимо между поездками"}
        </p>
      </div>

      <SpeedLegendBar profile={profile} system={system} />

      {workoutStats && (
        <p className="text-[10px] text-[rgb(var(--app-text-muted))] tabular-nums border-t border-[rgb(var(--app-border)/0.5)] pt-1.5">
          {isRunning ? (
            <>
              Эта пробежка: ср.{" "}
              {formatPace(speedKmhToPaceMinPerKm(workoutStats.avg) ?? 0)} · макс.{" "}
              {formatPace(speedKmhToPaceMinPerKm(workoutStats.max) ?? 0)}
            </>
          ) : (
            <>
              Эта поездка: ср. {formatSpeed(workoutStats.avg)} · макс. {formatSpeed(workoutStats.max)}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function BikeGpsMap({
  geojson,
  pointsData,
  focusPoint,
  onMapPointSelect,
  onPopupClose,
  startTime: startTimeProp,
  allPointsMode = false,
  workoutType,
}: {
  geojson: Record<string, unknown>;
  pointsData?: Array<{
    lat: number;
    lon: number;
    elapsed_sec: number;
    speed_kmh?: number | null;
    cadence?: number | null;
    elevation_m?: number | null;
    temperature_c?: number | null;
    heart_rate?: number | null;
    distance_m?: number | null;
    power_watts?: number | null;
  }>;
  focusPoint?: TrackPoint | null;
  onMapPointSelect?: (p: TrackPoint) => void;
  onPopupClose?: () => void;
  startTime?: string | null;
  allPointsMode?: boolean;
  workoutType?: string | null;
}) {
  const parsed = useMemo(() => parseTrackGeojson(geojson), [geojson]);
  const speedProfile = useMemo(() => resolveSpeedColorProfile(workoutType), [workoutType]);

  const points = useMemo(() => {
    const raw = pointsData?.length
      ? pointsData.map(apiPointToTrack)
      : parsed.points;
    return enrichTrackPoints(raw);
  }, [pointsData, parsed.points]);

  const startTime = startTimeProp ?? parsed.startTime;
  const [pinned, setPinned] = useState<TrackPoint | null>(null);
  const popupPoint = focusPoint ?? pinned;

  const workoutStats = useMemo(() => buildWorkoutSpeedStats(points), [points]);
  const segments = useMemo(
    () => buildSpeedSegments(points, { speedProfile, workoutType }),
    [points, speedProfile, workoutType],
  );
  const hasSpeedColors = segments.length > 1 || (segments.length === 1 && segments[0].color !== "#059669");

  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lon] as LatLngExpression),
    [points],
  );

  const showPointMarkers = points.length > 0 && points.length <= MAX_POINT_MARKERS;

  useEffect(() => {
    if (focusPoint) setPinned(focusPoint);
  }, [focusPoint]);

  if (allPointsMode && pointsData === undefined) {
    return <p className="text-sm text-slate-500">Загрузка точек маршрута…</p>;
  }

  if (points.length < 2) {
    return <p className="text-sm text-slate-500">Недостаточно точек для карты</p>;
  }

  const center = positions[Math.floor(positions.length / 2)] as LatLngExpression;

  const pinPoint = (p: TrackPoint) => {
    setPinned(p);
    onMapPointSelect?.(p);
  };

  const closePopup = () => {
    setPinned(null);
    onPopupClose?.();
  };

  return (
    <div className="space-y-2">
      <SpeedLegend profile={speedProfile} workoutStats={workoutStats} />
      <div className="relative">
        <MapContainer
          center={center}
          zoom={13}
          scrollWheelZoom
          preferCanvas
          className="shadow-inner rounded-lg overflow-hidden"
          style={{ height: "min(420px, 55vh)", minHeight: 280 }}
        >
          <MapAttributionSetup />
          <TileLayer attribution={OSM_TILE_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {hasSpeedColors
            ? segments.map((seg, i) => (
                <Polyline
                  key={`seg-${i}-${seg.color}`}
                  positions={seg.positions}
                  pathOptions={{
                    color: seg.color,
                    weight: 5,
                    opacity: 0.92,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                  renderer={canvasRenderer}
                />
              ))
            : (
              <Polyline
                positions={positions}
                pathOptions={{ color: "#059669", weight: 5, lineCap: "round", lineJoin: "round" }}
                renderer={canvasRenderer}
              />
            )}
          <MapRouteClick points={points} onPin={pinPoint} onClear={closePopup} />
          <MapHoverProbe points={points} startTime={startTime} speedProfile={speedProfile} />
          {showPointMarkers &&
            points.map((p) => (
              <CircleMarker
                key={`hit-${p.elapsedSec}-${p.lat}-${p.lon}`}
                center={[p.lat, p.lon]}
                radius={HIT_RADIUS}
                pathOptions={{
                  color: "transparent",
                  weight: 0,
                  fillColor: "transparent",
                  fillOpacity: 0,
                }}
                eventHandlers={{
                  click: (e) => {
                    e.originalEvent.stopPropagation();
                    pinPoint(p);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                  <RoutePointTelemetry
                    point={p}
                    startTime={startTime}
                    speedProfile={speedProfile}
                    compact
                  />
                </Tooltip>
              </CircleMarker>
            ))}
          {popupPoint && (
            <PinnedPopup
              point={popupPoint}
              startTime={startTime}
              speedProfile={speedProfile}
              onClose={closePopup}
            />
          )}
          <FocusPoint point={focusPoint ?? null} />
          <FitBounds positions={positions} />
        </MapContainer>
      </div>
      <p className="text-[10px] text-slate-500">
        {points.length.toLocaleString("ru-RU")} точек
        {allPointsMode ? " (все GPS-фиксации FIT)" : " (после прореживания)"}
        {showPointMarkers
          ? " · наведение и клик по точкам"
          : " · наведение на линию — подсказка; клик — закрепить"}
      </p>
    </div>
  );
}
