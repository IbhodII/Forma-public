export type HeartRatePoint = {
  timestamp: string;
  bpm: number;
  source: 'health_connect';
};

export type RawHrPoint = {timeMs: number; bpm: number};

export type HeartRateNormalizeStats = {
  records: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  first: string | null;
  last: string | null;
};

export const HR_BPM_MIN = 25;
export const HR_BPM_MAX = 240;

export function isValidBpm(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= HR_BPM_MIN && bpm <= HR_BPM_MAX;
}

export function normalizeHeartRatePoints(raw: RawHrPoint[]): {
  points: HeartRatePoint[];
  stats: HeartRateNormalizeStats;
} {
  const sorted = [...raw].sort((a, b) => a.timeMs - b.timeMs);
  const seen = new Set<string>();
  const points: HeartRatePoint[] = [];
  let rejected = 0;
  let duplicates = 0;

  for (const row of sorted) {
    const bpm = Math.round(row.bpm);
    if (!isValidBpm(bpm)) {
      rejected += 1;
      continue;
    }
    const timestamp = new Date(row.timeMs).toISOString();
    if (seen.has(timestamp)) {
      duplicates += 1;
      continue;
    }
    seen.add(timestamp);
    points.push({timestamp, bpm, source: 'health_connect'});
  }

  return {
    points,
    stats: {
      records: raw.length,
      accepted: points.length,
      rejected,
      duplicates,
      first: points[0]?.timestamp ?? null,
      last: points.length ? points[points.length - 1]!.timestamp : null,
    },
  };
}

/** Bucket normalized points into local calendar days for sync payload. */
export function bucketHeartRateByLocalDay(
  points: HeartRatePoint[],
  localDateKey: (iso: string) => string,
): Map<string, Array<{time: string; bpm: number}>> {
  const byDay = new Map<string, Array<{time: string; bpm: number}>>();
  for (const p of points) {
    const day = localDateKey(p.timestamp);
    const row = byDay.get(day) ?? [];
    row.push({time: p.timestamp, bpm: p.bpm});
    byDay.set(day, row);
  }
  return byDay;
}
