export const INCREMENTAL_WINDOW_H = 36;
export const INCREMENTAL_OVERLAP_H = 4;
export const BACKGROUND_INTERVAL_MIN = 60;

export type InitialSyncDays = 7 | 14 | 30;

export function resolveIncrementalWindow(
  lastReadAt: string | null,
  now: Date = new Date(),
): {from: Date; to: Date} {
  const floor = new Date(now.getTime() - INCREMENTAL_WINDOW_H * 60 * 60 * 1000);
  const overlap = lastReadAt
    ? new Date(new Date(lastReadAt).getTime() - INCREMENTAL_OVERLAP_H * 60 * 60 * 1000)
    : floor;
  const from = new Date(Math.max(floor.getTime(), overlap.getTime()));
  return {from, to: now};
}

export function resolveInitialWindow(
  days: InitialSyncDays,
  now: Date = new Date(),
): {from: Date; to: Date} {
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
  };
}

export function estimateNextBackgroundRun(lastRunAt: string | null): string | null {
  if (!lastRunAt) {
    return null;
  }
  const d = new Date(lastRunAt);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return new Date(d.getTime() + BACKGROUND_INTERVAL_MIN * 60 * 1000).toISOString();
}
