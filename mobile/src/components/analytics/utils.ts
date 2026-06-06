import {buildInsightContext} from '../../insights/buildContext';
import {generateInsights} from '../../insights/generate';
import type {InsightTone} from '../../insights/types';

export type PeriodDays = 7 | 14 | 30 | 42 | 90;

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function periodRange(days: PeriodDays): {from: string; to: string} {
  return {from: addDaysIso(-days + 1), to: addDaysIso(0)};
}

/** Date window for analytics API (any day count). */
export function toDateRange(days: number): {from: string; to: string} {
  const clamped = Math.max(1, Math.min(365, Math.round(days)));
  return {from: addDaysIso(-clamped + 1), to: addDaysIso(0)};
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}

export function formatAxisDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'numeric'});
}

/** Evenly sample series for readable mobile x-axis */
export function sampleByIndex<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) {
    return items;
  }
  if (maxPoints <= 1) {
    return items.slice(-1);
  }
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * (items.length - 1));
    out.push(items[idx]!);
  }
  return out;
}

export function pickTickIndices(length: number, maxTicks = 4): number[] {
  if (length <= 1) {
    return [0];
  }
  if (length <= maxTicks) {
    return Array.from({length}, (_, i) => i);
  }
  const out: number[] = [];
  for (let i = 0; i < maxTicks; i++) {
    out.push(Math.round((i / (maxTicks - 1)) * (length - 1)));
  }
  return out;
}

export function sumField<T>(items: T[], pick: (row: T) => number): number {
  return items.reduce((acc, row) => acc + pick(row), 0);
}

export function trendDelta(values: number[]): number | null {
  const clean = values.filter(v => Number.isFinite(v));
  if (clean.length < 4) {
    return null;
  }
  const half = Math.floor(clean.length / 2);
  const first = clean.slice(0, half);
  const second = clean.slice(half);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return avg(second) - avg(first);
}

export type WorkloadInsight = {
  status: 'fresh' | 'balanced' | 'loaded' | 'fatigued' | 'unknown';
  title: string;
  body: string;
};

function toneToStatus(tone: InsightTone, tsb: number | null | undefined): WorkloadInsight['status'] {
  if (tsb != null && tsb < -18) return 'fatigued';
  if (tone === 'alert') return 'fatigued';
  if (tone === 'warm' && tsb != null && tsb < 0) return 'loaded';
  if (tone === 'positive' && tsb != null && tsb > 5) return 'fresh';
  if (tsb != null && tsb > 8) return 'fresh';
  if (tsb != null && tsb < -8) return 'loaded';
  return 'balanced';
}

export function interpretWorkload(
  tsb: number | null | undefined,
  ctl: number | null | undefined,
  atl?: number | null | undefined,
): WorkloadInsight {
  const ctx = buildInsightContext({
    ctlPoints: [],
    current: {tsb: tsb ?? null, ctl: ctl ?? null, atl: atl ?? null},
    activityDates: [],
    stretchRecent: false,
    streak: 0,
    kcalToday: 0,
    proteinToday: 0,
    isFemale: false,
  });

  const primary = generateInsights(ctx, 'analytics', 1)[0];
  if (primary) {
    return {
      status: toneToStatus(primary.tone, tsb ?? null),
      title: primary.title,
      body: primary.body,
    };
  }

  if (tsb == null || !Number.isFinite(tsb)) {
    return {
      status: 'unknown',
      title: 'Недостаточно данных',
      body: 'Запишите кардио или силовую тренировку, чтобы увидеть форму и восстановление.',
    };
  }

  return {
    status: 'balanced',
    title: 'Сбалансированное состояние',
    body: 'Нагрузка и восстановление в равновесии. Ориентируйтесь на самочувствие.',
  };
}
