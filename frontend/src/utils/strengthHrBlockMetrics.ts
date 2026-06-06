import type { HeartRatePoint } from "../types";
import type { StrengthHrEditableBlock } from "../types/strengthHrEditor";

export const MIN_BLOCK_DURATION_SEC = 10;
export const MIN_RECOVERY_DROP_BPM = 10;

export interface BlockBoundary {
  start_sec: number;
  end_sec: number;
}

export interface BlockMetrics {
  peak_hr: number | null;
  avg_hr: number | null;
  min_hr: number | null;
  hr_rise: number | null;
  recovery_drop: number | null;
  recovery_time: number | null;
  duration_sec: number;
}

export function normalizeHrSeries(points: HeartRatePoint[]): Array<[number, number]> {
  const bySec = new Map<number, number>();
  for (const p of points) {
    const sec = Math.max(0, Math.floor(p.seconds ?? 0));
    const hr = Math.floor(p.heart_rate);
    if (hr > 0) bySec.set(sec, hr);
  }
  return [...bySec.entries()].sort((a, b) => a[0] - b[0]);
}

function normalizePoints(points: HeartRatePoint[]): Array<[number, number]> {
  return normalizeHrSeries(points);
}

function sliceWindow(series: Array<[number, number]>, start: number, end: number) {
  return series.filter(([s]) => s >= start && s < end);
}

function recoveryTimeSec(
  series: Array<[number, number]>,
  peakSec: number,
  peakHr: number,
  capSec: number,
): number | null {
  const target = peakHr - MIN_RECOVERY_DROP_BPM;
  for (const [sec, hr] of series) {
    if (sec <= peakSec) continue;
    if (sec > capSec) break;
    if (hr <= target) return sec - peakSec;
  }
  return null;
}

export function computeBlockMetricsFromPoints(
  points: HeartRatePoint[],
  block: BlockBoundary,
  nextBlockStart?: number | null,
): BlockMetrics {
  const duration_sec = Math.max(0, block.end_sec - block.start_sec);
  const series = normalizePoints(points);
  const window = sliceWindow(series, block.start_sec, block.end_sec);
  if (!window.length) {
    return {
      peak_hr: null,
      avg_hr: null,
      min_hr: null,
      hr_rise: null,
      recovery_drop: null,
      recovery_time: null,
      duration_sec,
    };
  }

  const hrs = window.map(([, h]) => h);
  const min_hr = Math.min(...hrs);
  const peakEntry = window.reduce((best, cur) => (cur[1] >= best[1] ? cur : best));
  const peak_hr = peakEntry[1];
  const peak_sec = peakEntry[0];
  const avg_hr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);

  const cap = (nextBlockStart ?? block.end_sec) - 1;
  const postPeak = series.filter(([s]) => s >= peak_sec && s <= cap);
  const recovery_drop =
    postPeak.length > 0 ? peak_hr - Math.min(...postPeak.map(([, h]) => h)) : null;
  const recovery_time = recoveryTimeSec(series, peak_sec, peak_hr, cap);

  return {
    peak_hr,
    avg_hr,
    min_hr,
    hr_rise: peak_hr - min_hr,
    recovery_drop,
    recovery_time,
    duration_sec,
  };
}

export function reindexBlocks(blocks: StrengthHrEditableBlock[]): StrengthHrEditableBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start_sec - b.start_sec);
  return sorted.map((b, i) => ({
    ...b,
    block_index: i + 1,
    block_id: i + 1,
  }));
}

export interface BlockLayoutIssue {
  blockId: number;
  message: string;
}

export function validateBlockLayout(
  blocks: StrengthHrEditableBlock[],
  sessionDurationSec?: number,
): BlockLayoutIssue[] {
  const issues: BlockLayoutIssue[] = [];
  const sorted = [...blocks].sort((a, b) => a.start_sec - b.start_sec);
  let prevEnd: number | null = null;

  for (const b of sorted) {
    if (b.start_sec >= b.end_sec) {
      issues.push({ blockId: b.block_id, message: "start должен быть меньше end" });
    }
    if (b.end_sec - b.start_sec < MIN_BLOCK_DURATION_SEC) {
      issues.push({
        blockId: b.block_id,
        message: `минимум ${MIN_BLOCK_DURATION_SEC} сек`,
      });
    }
    if (prevEnd != null && b.start_sec < prevEnd) {
      issues.push({ blockId: b.block_id, message: "пересечение с соседним блоком" });
    }
    if (sessionDurationSec != null && b.end_sec > sessionDurationSec + 1) {
      issues.push({ blockId: b.block_id, message: "выходит за длительность сессии" });
    }
    prevEnd = b.end_sec;
  }
  return issues;
}

export function recalcAllBlockMetrics(
  points: HeartRatePoint[],
  blocks: StrengthHrEditableBlock[],
): StrengthHrEditableBlock[] {
  const sorted = reindexBlocks(blocks);
  return sorted.map((b, i) => {
    const nextStart = sorted[i + 1]?.start_sec ?? null;
    const metrics = computeBlockMetricsFromPoints(points, b, nextStart);
    return { ...b, ...metrics };
  });
}

export function defaultSplitSec(block: BlockBoundary): number {
  return Math.floor((block.start_sec + block.end_sec) / 2);
}

export function findBlockAtSec(
  blocks: StrengthHrEditableBlock[],
  sec: number,
): StrengthHrEditableBlock | null {
  for (const b of blocks) {
    if (sec >= b.start_sec && sec < b.end_sec) return b;
  }
  return null;
}

export function getBlockNeighbors(
  blocks: StrengthHrEditableBlock[],
  blockId: number,
): SnapNeighbors {
  const sorted = [...blocks].sort((a, b) => a.start_sec - b.start_sec);
  const idx = sorted.findIndex((b) => b.block_id === blockId);
  if (idx < 0) return {};
  return {
    prevEnd: idx > 0 ? sorted[idx - 1].end_sec : undefined,
    nextStart: idx < sorted.length - 1 ? sorted[idx + 1].start_sec : undefined,
  };
}

export interface SnapNeighbors {
  prevEnd?: number;
  nextStart?: number;
}

export function clampBoundarySec(
  sec: number,
  edge: "start" | "end",
  block: StrengthHrEditableBlock,
  blocks: StrengthHrEditableBlock[],
): number {
  const neighbors = getBlockNeighbors(blocks, block.block_id);
  if (edge === "start") {
    const minStart = neighbors.prevEnd ?? 0;
    const maxStart = block.end_sec - MIN_BLOCK_DURATION_SEC;
    return Math.max(minStart, Math.min(Math.round(sec), maxStart));
  }
  const minEnd = block.start_sec + MIN_BLOCK_DURATION_SEC;
  const maxEnd = neighbors.nextStart ?? block.end_sec + 3600;
  return Math.max(minEnd, Math.min(Math.round(sec), maxEnd));
}

export function findDuplicateSetAssignments(
  blocks: StrengthHrEditableBlock[],
): number[] {
  const seen = new Map<number, number>();
  const dupes: number[] = [];
  for (const b of blocks) {
    if (b.kind !== "set" || b.assigned_order_index == null) continue;
    const key = b.assigned_order_index;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [orderIdx, count] of seen) {
    if (count > 1) dupes.push(orderIdx);
  }
  return dupes;
}
