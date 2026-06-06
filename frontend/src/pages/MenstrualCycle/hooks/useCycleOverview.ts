import { useMemo } from "react";
import type { MenstrualCycleSettings } from "../../../api/menstrualCycle";
import type { CyclePhase } from "../../../shared/menstrualCyclePhases";
import { CYCLE_WELLNESS_PHASE } from "../cycleWellnessTheme";

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useCycleOverview(
  settings: MenstrualCycleSettings | undefined,
  phaseByDate: Map<string, CyclePhase>,
  today: string,
) {
  return useMemo(() => {
    const cycleLen = settings?.cycle_length_days ?? 28;
    const periodLen = settings?.period_length_days ?? 5;
    const lastStart = settings?.last_period_start ?? settings?.last_menstruation ?? null;

    const todayPhase = phaseByDate.get(today) ?? null;
    const phaseMeta = todayPhase ? CYCLE_WELLNESS_PHASE[todayPhase] : null;

    let cycleDay: number | null = null;
    let progressPercent = 0;
    let daysUntilPeriod: number | null = null;
    let predictedNext: string | null = null;
    let predictedOvulation: string | null = null;

    if (lastStart) {
      const rawDay = daysBetween(lastStart, today) + 1;
      cycleDay = ((rawDay - 1) % cycleLen) + 1;
      progressPercent = Math.min(100, Math.round((cycleDay / cycleLen) * 100));
      predictedNext = addDays(lastStart, cycleLen);
      daysUntilPeriod = daysBetween(today, predictedNext);
      if (daysUntilPeriod < 0) daysUntilPeriod = 0;
      predictedOvulation = addDays(lastStart, Math.round(cycleLen / 2) - 2);
    }

    const nextEvent =
      daysUntilPeriod != null && daysUntilPeriod <= 14
        ? { label: "Следующая менструация", date: predictedNext, days: daysUntilPeriod }
        : predictedOvulation && daysBetween(today, predictedOvulation) >= -2 && daysBetween(today, predictedOvulation) <= 5
          ? { label: "Овуляция (ориентир)", date: predictedOvulation, days: daysBetween(today, predictedOvulation) }
          : null;

    return {
      cycleLen,
      periodLen,
      lastStart,
      todayPhase,
      phaseMeta,
      cycleDay,
      progressPercent,
      daysUntilPeriod,
      predictedNext,
      nextEvent,
      phaseInsight: phaseMeta?.insight ?? "Отмечайте самочувствие — так прогнозы станут точнее.",
    };
  }, [settings, phaseByDate, today]);
}
