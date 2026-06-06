import type {CycleLogItem, CyclePhase, CycleSettings} from './contracts';

const VALID_PHASES = new Set<CyclePhase>(['menstrual', 'follicular', 'ovulatory', 'luteal']);

export function normalizePhase(raw: string | null | undefined): CyclePhase | null {
  if (!raw) {
    return null;
  }
  const v = String(raw).trim().toLowerCase() as CyclePhase;
  return VALID_PHASES.has(v) ? v : null;
}

export function phaseLabelRu(phase: CyclePhase | null | undefined): string {
  switch (phase) {
    case 'menstrual':
      return 'Менструальная';
    case 'follicular':
      return 'Фолликулярная';
    case 'ovulatory':
      return 'Овуляторная';
    case 'luteal':
      return 'Лютеиновая';
    default:
      return '—';
  }
}

export function bmrMultiplier(phase: CyclePhase | null | undefined): number {
  return phase === 'luteal' ? 1.05 : 1.0;
}

export function recoveryMultiplier(phase: CyclePhase | null | undefined): number {
  if (phase === 'follicular') {
    return 1.1;
  }
  if (phase === 'luteal') {
    return 0.9;
  }
  return 1.0;
}

export function predictPhase(targetIso: string, settings: CycleSettings): CyclePhase | null {
  if (!settings.cycleEnabled || !settings.lastPeriodStart) {
    return null;
  }
  const target = asDate(targetIso);
  const start = asDate(settings.lastPeriodStart);
  const cycleLen = clamp(Math.round(settings.cycleLengthDays || 28), 15, 60);
  const periodLen = clamp(Math.round(settings.periodLengthDays || 5), 1, 14);
  let delta = Math.floor((target.getTime() - start.getTime()) / 86400000);
  while (delta < 0) {
    delta += cycleLen;
  }
  const idx = delta % cycleLen;
  if (idx < periodLen) {
    return 'menstrual';
  }
  const ovulationDay = Math.max(periodLen + 1, Math.floor(cycleLen / 2));
  if (Math.abs(idx - ovulationDay) <= 1) {
    return 'ovulatory';
  }
  if (idx < ovulationDay - 1) {
    return 'follicular';
  }
  return 'luteal';
}

export function resolveCycleImpact(
  dayIso: string,
  settings: CycleSettings,
  logs: CycleLogItem[],
): {
  tracking: boolean;
  date?: string;
  phase?: CyclePhase;
  phase_label?: string;
  source?: 'manual' | 'predicted';
  bmr_multiplier?: number;
  recovery_multiplier?: number;
  bmr_note?: string | null;
  recovery_note?: string | null;
  message?: string;
} {
  if (!settings.cycleEnabled) {
    return {tracking: false, message: 'Учёт фазы цикла отключён в настройках'};
  }
  if (!settings.lastPeriodStart) {
    return {tracking: false, message: 'Добавьте дату последней менструации'};
  }
  const manual = logs.find(x => x.date === dayIso)?.phase;
  const phase = normalizePhase(manual) ?? predictPhase(dayIso, settings);
  if (!phase) {
    return {tracking: false, message: 'Недостаточно данных для фазы цикла'};
  }
  const bmr = bmrMultiplier(phase);
  const rec = recoveryMultiplier(phase);
  return {
    tracking: true,
    date: dayIso,
    phase,
    phase_label: phaseLabelRu(phase),
    source: normalizePhase(manual) ? 'manual' : 'predicted',
    bmr_multiplier: bmr,
    recovery_multiplier: rec,
    bmr_note: bmr !== 1 ? 'Скорректировано с учётом фазы цикла (+5% в лютеиновой)' : null,
    recovery_note: rec !== 1 ? `TRIMP учитывается с коэффициентом ${rec}` : null,
  };
}

export function buildPhasesForRange(fromIso: string, toIso: string, settings: CycleSettings, logs: CycleLogItem[]) {
  const byDate = new Map(logs.map(x => [x.date, normalizePhase(x.phase)]));
  const out: Array<{date: string; phase: CyclePhase; source: 'manual' | 'predicted'; bmr_multiplier: number; recovery_multiplier: number}> = [];
  let cur = asDate(fromIso);
  const end = asDate(toIso);
  while (cur <= end) {
    const day = iso(cur);
    const manual = byDate.get(day);
    const phase = manual ?? predictPhase(day, settings);
    if (phase) {
      out.push({
        date: day,
        phase,
        source: manual ? 'manual' : 'predicted',
        bmr_multiplier: bmrMultiplier(phase),
        recovery_multiplier: recoveryMultiplier(phase),
      });
    }
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

function asDate(isoString: string): Date {
  return new Date(`${isoString.slice(0, 10)}T00:00:00`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
