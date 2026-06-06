import type { MenstrualCycleSettings } from "../../api/menstrualCycle";

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const dt = parseIsoDate(iso);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function computeMenstrualStats(
  settings: MenstrualCycleSettings,
  logDates: string[],
  year: number,
  month: number,
): {
  markedDaysThisMonth: number;
  predictedNextPeriod: string | null;
  averageCycleLengthDays: number | null;
} {
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const markedDaysThisMonth = logDates.filter((d) => d.startsWith(monthPrefix)).length;

  let predictedNextPeriod: string | null = null;
  if (settings.last_period_start) {
    predictedNextPeriod = addDays(
      settings.last_period_start,
      settings.cycle_length_days,
    );
  }

  const sorted = [...new Set(logDates.map((d) => d.slice(0, 10)))].sort();
  let averageCycleLengthDays: number | null = null;
  if (sorted.length >= 2) {
    const periodStarts: string[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      if (daysBetween(periodStarts[periodStarts.length - 1], sorted[i]) > 2) {
        periodStarts.push(sorted[i]);
      }
    }
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    const recent = periodStarts.filter((s) => s >= cutoffIso);
    if (recent.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < recent.length; i += 1) {
        gaps.push(daysBetween(recent[i - 1], recent[i]));
      }
      averageCycleLengthDays = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
    }
  }

  return {
    markedDaysThisMonth,
    predictedNextPeriod,
    averageCycleLengthDays,
  };
}
