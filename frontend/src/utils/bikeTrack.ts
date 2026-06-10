import {
  resolveSpeedColorProfile,
  speedToColor,
  type SpeedColorProfile,
} from "../config/speedColorScale";

export type { SpeedColorProfile };
/** @deprecated use SpeedColorProfile */
export type CyclingWorkoutProfile = SpeedColorProfile;

export interface TrackPoint {
  lat: number;
  lon: number;
  elapsedSec: number;
  speedKmh?: number | null;
  cadence?: number | null;
  elevationM?: number | null;
  temperatureC?: number | null;
  heartRate?: number | null;
  distanceM?: number | null;
  powerWatts?: number | null;
}

export interface ParsedTrack {
  points: TrackPoint[];
  startTime?: string | null;
}

export interface SpeedSegment {
  positions: [number, number][];
  color: string;
}

function numAt(arr: unknown, i: number): number | null {
  if (!Array.isArray(arr) || i >= arr.length) return null;
  const v = arr[i];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Статистика скоростей тренировки (для UI, не для раскраски). */
export interface WorkoutSpeedStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export function buildWorkoutSpeedStats(points: TrackPoint[]): WorkoutSpeedStats | null {
  const speeds = points
    .map((p) => p.speedKmh)
    .filter((s): s is number => s != null && s > 0);
  if (speeds.length === 0) return null;
  const sum = speeds.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...speeds),
    max: Math.max(...speeds),
    avg: sum / speeds.length,
    count: speeds.length,
  };
}

/** GeoJSON FeatureCollection с properties-массивами или legacy LineString. */
export function parseTrackGeojson(geo: Record<string, unknown>): ParsedTrack {
  let feature: Record<string, unknown> | null = null;
  if (geo.type === "FeatureCollection" && Array.isArray(geo.features) && geo.features[0]) {
    feature = geo.features[0] as Record<string, unknown>;
  } else if (geo.type === "Feature") {
    feature = geo;
  } else if (geo.type === "LineString") {
    feature = { geometry: geo, properties: {} };
  }

  const geometry = (feature?.geometry ?? geo.geometry) as Record<string, unknown> | undefined;
  const props = (feature?.properties ?? {}) as Record<string, unknown>;
  const coords = (geometry?.coordinates ?? geo.coordinates) as unknown;

  const lines: number[][][] = [];
  if (geometry?.type === "LineString" && Array.isArray(coords)) {
    lines.push(coords as number[][]);
  } else if (geometry?.type === "MultiLineString" && Array.isArray(coords)) {
    for (const line of coords as number[][][]) {
      lines.push(line);
    }
  }

  const flat: number[][] = lines.flat();
  const elapsed = props.elapsed_sec as unknown;
  const hasProps = Array.isArray(elapsed) && elapsed.length > 0;

  const points: TrackPoint[] = [];
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    points.push({
      lon,
      lat,
      elapsedSec: hasProps ? (numAt(elapsed, i) ?? i) : i,
      speedKmh: numAt(props.speed_kmh, i),
      cadence: numAt(props.cadence, i),
      elevationM: numAt(props.elevation_m, i),
      temperatureC: numAt(props.temperature_c, i),
      heartRate: numAt(props.heart_rate, i) != null ? Math.round(numAt(props.heart_rate, i)!) : null,
      distanceM: numAt(props.distance_m, i),
      powerWatts: numAt(props.power_watts, i),
    });
  }

  return { points, startTime: (props.start_time as string) ?? null };
}

/** Fill missing speed from GPS segments; idempotent when telemetry already present. */
export function enrichTrackPoints(points: TrackPoint[]): TrackPoint[] {
  if (points.length < 2) return points;
  const out = points.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i += 1) {
    const point = out[i];
    if (point.speedKmh != null && point.speedKmh > 0) continue;
    for (const neighbor of [i + 1, i - 1]) {
      if (neighbor < 0 || neighbor >= out.length) continue;
      const a = out[Math.min(i, neighbor)];
      const b = out[Math.max(i, neighbor)];
      const spd = segmentSpeedKmh(a, b);
      if (spd > 0) {
        point.speedKmh = spd;
        break;
      }
    }
  }
  return out;
}

export function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatClockFromStart(startIso: string | null | undefined, elapsedSec: number): string {
  if (!startIso) return formatElapsed(elapsedSec);
  const base = new Date(startIso.replace(" ", "T"));
  if (Number.isNaN(base.getTime())) return formatElapsed(elapsedSec);
  const t = new Date(base.getTime() + elapsedSec * 1000);
  return t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m >= 1000) return `${(m / 1000).toFixed(2)} км`;
  return `${Math.round(m)} м`;
}

const EARTH_R = 6371000;

function haversineM(a: TrackPoint, b: TrackPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/** Скорость на отрезке: из данных или GPS+время. */
export function segmentSpeedKmh(a: TrackPoint, b: TrackPoint): number {
  const fromData = a.speedKmh ?? b.speedKmh;
  if (fromData != null && fromData > 0) return fromData;

  const dt = b.elapsedSec - a.elapsedSec;
  if (dt > 0) {
    const distM = haversineM(a, b);
    if (distM > 0) return (distM / dt) * 3.6;
  }
  return 0;
}

function mergeAdjacentSegments(segments: SpeedSegment[]): SpeedSegment[] {
  if (segments.length <= 1) return segments;
  const out: SpeedSegment[] = [{ ...segments[0], positions: [...segments[0].positions] }];
  for (let i = 1; i < segments.length; i += 1) {
    const seg = segments[i];
    const last = out[out.length - 1];
    if (last.color === seg.color) {
      last.positions.push(seg.positions[seg.positions.length - 1]);
    } else {
      out.push({ color: seg.color, positions: [...seg.positions] });
    }
  }
  return out;
}

/**
 * Сегменты маршрута с абсолютной шкалой скорости (км/ч).
 * Каждое ребро сохраняется; соседние сегменты одного цвета объединяются.
 */
export function buildSpeedSegments(
  points: TrackPoint[],
  options?: { mergeColors?: boolean; speedProfile?: SpeedColorProfile; workoutType?: string | null },
): SpeedSegment[] {
  if (points.length < 2) return [];

  const profile = options?.speedProfile ?? resolveSpeedColorProfile(options?.workoutType);
  let hasAnySpeed = false;

  const raw: SpeedSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const spd = segmentSpeedKmh(a, b);
    if (spd > 0) hasAnySpeed = true;
    const color = speedToColor(spd, profile);
    raw.push({
      positions: [
        [a.lat, a.lon],
        [b.lat, b.lon],
      ],
      color,
    });
  }

  if (!hasAnySpeed) {
    return [
      {
        positions: points.map((p) => [p.lat, p.lon] as [number, number]),
        color: "#059669",
      },
    ];
  }

  return options?.mergeColors === false ? raw : mergeAdjacentSegments(raw);
}

/** Re-export для centralized color mapping */
export { speedToColor, resolveSpeedColorProfile } from "../config/speedColorScale";

export function findNearestPoint(
  points: TrackPoint[],
  lat: number,
  lon: number,
  maxDistDeg = Infinity,
): TrackPoint | null {
  if (!points.length) return null;
  const maxD2 = maxDistDeg ** 2;
  let best: TrackPoint | null = null;
  let bestD = maxD2;

  const stride = points.length > 3000 ? Math.ceil(points.length / 800) : 1;
  for (let i = 0; i < points.length; i += stride) {
    const p = points[i];
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }

  if (best && stride > 1) {
    const idx = points.indexOf(best);
    const from = Math.max(0, idx - stride);
    const to = Math.min(points.length - 1, idx + stride);
    for (let i = from; i <= to; i += 1) {
      const p = points[i];
      const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }

  return bestD < maxD2 ? best : null;
}

const ELEVATION_DISTANCE_STEP_M = 25;

/** Прореживание высоты для графика «высота по дистанции»: ~1 точка на 25 м. */
export function downsampleElevationByDistance(
  elapsedSec: number[],
  distanceM: (number | null)[],
  elevationM: (number | null)[],
  stepM = ELEVATION_DISTANCE_STEP_M,
): { xKm: number[]; y: number[]; elapsedSec: number[] } {
  const samples: { distM: number; elev: number; elapsed: number }[] = [];
  for (let i = 0; i < elapsedSec.length; i++) {
    const d = distanceM[i];
    const e = elevationM[i];
    if (d == null || e == null || !Number.isFinite(d) || !Number.isFinite(e)) continue;
    samples.push({ distM: d, elev: e, elapsed: elapsedSec[i] });
  }
  if (samples.length === 0) {
    return { xKm: [], y: [], elapsedSec: [] };
  }

  samples.sort((a, b) => a.distM - b.distM);

  const smoothWindow = 5;
  const smoothed = samples.map((_, i) => {
    const start = Math.max(0, i - Math.floor(smoothWindow / 2));
    const end = Math.min(samples.length, i + Math.ceil(smoothWindow / 2));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j].elev;
      n += 1;
    }
    return { ...samples[i], elev: sum / n };
  });

  const out: typeof smoothed = [];
  let lastKeptDist = -Infinity;
  for (const s of smoothed) {
    if (out.length === 0 || s.distM - lastKeptDist >= stepM) {
      out.push(s);
      lastKeptDist = s.distM;
    }
  }
  const last = smoothed[smoothed.length - 1];
  if (out.length === 0 || Math.abs(out[out.length - 1].distM - last.distM) > 0.01) {
    out.push(last);
  }

  return {
    xKm: out.map((p) => p.distM / 1000),
    y: out.map((p) => Math.round(p.elev * 10) / 10),
    elapsedSec: out.map((p) => p.elapsed),
  };
}
