export interface TrackPoint {
  lat: number;
  lon: number;
  elapsedSec: number;
  speedKmh?: number | null;
  cadence?: number | null;
  elevationM?: number | null;
  heartRate?: number | null;
}

export interface ParsedTrack {
  points: TrackPoint[];
  startTime?: string | null;
}

function numAt(arr: unknown, i: number): number | null {
  if (!Array.isArray(arr) || i >= arr.length) {
    return null;
  }
  const v = arr[i];
  if (v == null || v === '') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GeoJSON FeatureCollection с properties-массивами или legacy LineString. */
export function parseTrackGeojson(geo: Record<string, unknown>): ParsedTrack {
  let feature: Record<string, unknown> | null = null;
  if (geo.type === 'FeatureCollection' && Array.isArray(geo.features) && geo.features[0]) {
    feature = geo.features[0] as Record<string, unknown>;
  } else if (geo.type === 'Feature') {
    feature = geo;
  } else if (geo.type === 'LineString') {
    feature = {geometry: geo, properties: {}};
  }

  const geometry = (feature?.geometry ?? geo.geometry) as Record<string, unknown> | undefined;
  const props = (feature?.properties ?? {}) as Record<string, unknown>;
  const coords = (geometry?.coordinates ?? geo.coordinates) as unknown;

  const lines: number[][][] = [];
  if (geometry?.type === 'LineString' && Array.isArray(coords)) {
    lines.push(coords as number[][]);
  } else if (geometry?.type === 'MultiLineString' && Array.isArray(coords)) {
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
    if (!Array.isArray(c) || c.length < 2) {
      continue;
    }
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    points.push({
      lon,
      lat,
      elapsedSec: hasProps ? (numAt(elapsed, i) ?? i) : i,
      speedKmh: numAt(props.speed_kmh, i),
      cadence: numAt(props.cadence, i),
      elevationM: numAt(props.elevation_m, i),
      heartRate:
        numAt(props.heart_rate, i) != null
          ? Math.round(numAt(props.heart_rate, i)!)
          : null,
    });
  }

  return {points, startTime: (props.start_time as string) ?? null};
}

/** Нормализованные координаты для SVG polyline (0..1). */
export function normalizeTrackForSvg(
  points: TrackPoint[],
): {xs: number[]; ys: number[]} | null {
  if (points.length < 2) {
    return null;
  }
  const lats = points.map(p => p.lat);
  const lons = points.map(p => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 0.0001;
  const lonRange = maxLon - minLon || 0.0001;
  const pad = 0.05;
  return {
    xs: points.map(p => pad + ((p.lon - minLon) / lonRange) * (1 - 2 * pad)),
    ys: points.map(p => 1 - pad - ((p.lat - minLat) / latRange) * (1 - 2 * pad)),
  };
}
