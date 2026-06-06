import type { HeartRatePoint } from "../types";
import type { BlockBoundary, SnapNeighbors } from "./strengthHrBlockMetrics";
import { normalizeHrSeries } from "./strengthHrBlockMetrics";

export const SNAP_THRESHOLD_SEC = 8;
export const GRID_SEC = 5;
export const VALLEY_RADIUS_SEC = 15;

export type { SnapNeighbors };

function snapCandidates(
  rawSec: number,
  edge: "start" | "end",
  neighbors: SnapNeighbors,
  hrSeries: Array<[number, number]>,
  gridSec: number,
  valleyRadiusSec: number,
): number[] {
  const grid = Math.round(rawSec / gridSec) * gridSec;
  const candidates: number[] = [grid];

  if (edge === "start" && neighbors.prevEnd != null) {
    candidates.push(neighbors.prevEnd);
  }
  if (edge === "end" && neighbors.nextStart != null) {
    candidates.push(neighbors.nextStart);
  }

  const valley = findNearestValleySec(rawSec, hrSeries, valleyRadiusSec);
  if (valley != null) candidates.push(valley);

  return candidates;
}

/** Local minimum HR within radius of rawSec. */
export function findNearestValleySec(
  rawSec: number,
  hrSeries: Array<[number, number]>,
  radiusSec: number,
): number | null {
  if (!hrSeries.length) return null;
  const window = hrSeries.filter(([s]) => s >= rawSec - radiusSec && s <= rawSec + radiusSec);
  if (window.length < 3) return null;

  let bestSec: number | null = null;
  let bestHr = Infinity;
  for (let i = 1; i < window.length - 1; i += 1) {
    const [sec, hr] = window[i];
    const prevHr = window[i - 1][1];
    const nextHr = window[i + 1][1];
    if (hr <= prevHr && hr <= nextHr && hr < bestHr) {
      bestHr = hr;
      bestSec = sec;
    }
  }
  return bestSec;
}

/** Pick closest snap candidate within threshold; otherwise return rounded raw. */
export function snapBoundarySec(
  rawSec: number,
  edge: "start" | "end",
  _block: BlockBoundary,
  neighbors: SnapNeighbors,
  points: HeartRatePoint[],
  opts?: { gridSec?: number; valleyRadiusSec?: number; thresholdSec?: number },
): number {
  const gridSec = opts?.gridSec ?? GRID_SEC;
  const valleyRadiusSec = opts?.valleyRadiusSec ?? VALLEY_RADIUS_SEC;
  const threshold = opts?.thresholdSec ?? SNAP_THRESHOLD_SEC;
  const hrSeries = normalizeHrSeries(points);
  const candidates = snapCandidates(rawSec, edge, neighbors, hrSeries, gridSec, valleyRadiusSec);

  let best = Math.round(rawSec);
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c - rawSec);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function snapSplitSec(
  rawSec: number,
  block: BlockBoundary,
  points: HeartRatePoint[],
): number {
  const snapped = snapBoundarySec(rawSec, "end", block, {}, points);
  return Math.max(block.start_sec + 10, Math.min(snapped, block.end_sec - 10));
}
