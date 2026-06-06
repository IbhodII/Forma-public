import {
  buildPhasesForRange,
  resolveCycleImpact,
  type CyclePhase,
} from '../analytics-engine';
import {
  getCycleLog,
  getCycleSettings as getLocalCycleSettings,
  saveCycleSettings as saveLocalCycleSettings,
  upsertCycleLog as upsertLocalCycleLog,
} from '../analytics/localCycleStore';

export type CycleLogItem = {
  date: string;
  flow_intensity?: 'light' | 'medium' | 'heavy' | null;
  symptoms?: string | null;
  notes?: string | null;
  phase?: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
};

export type CyclePhaseItem = {
  date: string;
  phase: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
  source?: string;
};

export type CycleImpact = {
  tracking: boolean;
  date?: string;
  phase?: string;
  phase_label?: string;
  bmr_multiplier?: number;
  recovery_multiplier?: number;
  bmr_note?: string | null;
  recovery_note?: string | null;
  message?: string;
};

export async function fetchCycleLog(from: string, to: string) {
  return getCycleLog(from, to);
}

export async function upsertCycleLog(body: CycleLogItem) {
  const normalized: CycleLogItem = {
    ...body,
    phase: (body.phase ?? null) as CyclePhase | null,
  };
  return upsertLocalCycleLog(normalized);
}

export async function fetchCyclePhases(from: string, to: string) {
  const [settings, logs] = await Promise.all([getLocalCycleSettings(), getCycleLog(from, to)]);
  return buildPhasesForRange(from, to, settings, logs);
}

export async function fetchCycleImpact(day?: string) {
  const targetDay = day ?? new Date().toISOString().slice(0, 10);
  const [settings, logs] = await Promise.all([
    getLocalCycleSettings(),
    getCycleLog(targetDay, targetDay),
  ]);
  return resolveCycleImpact(targetDay, settings, logs);
}

export type CycleSettings = {
  cycle_length_days: number;
  period_length_days: number;
  last_period_start?: string | null;
  last_menstruation?: string | null;
  cycle_enabled?: boolean;
};

export async function fetchCycleSettings() {
  const settings = await getLocalCycleSettings();
  return {
    cycle_length_days: settings.cycleLengthDays,
    period_length_days: settings.periodLengthDays,
    last_period_start: settings.lastPeriodStart,
    last_menstruation: settings.lastPeriodStart,
    cycle_enabled: settings.cycleEnabled,
  } satisfies CycleSettings;
}

export async function saveCycleSettings(body: Partial<CycleSettings>) {
  const next = await saveLocalCycleSettings({
    cycleLengthDays: body.cycle_length_days,
    periodLengthDays: body.period_length_days,
    lastPeriodStart: body.last_period_start ?? body.last_menstruation ?? null,
    cycleEnabled: body.cycle_enabled,
  });
  return {
    cycle_length_days: next.cycleLengthDays,
    period_length_days: next.periodLengthDays,
    last_period_start: next.lastPeriodStart,
    last_menstruation: next.lastPeriodStart,
    cycle_enabled: next.cycleEnabled,
  } satisfies CycleSettings;
}

