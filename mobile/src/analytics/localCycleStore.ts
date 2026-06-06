import AsyncStorage from '@react-native-async-storage/async-storage';

import type {CycleLogItem, CycleSettings} from '../analytics-engine';

const SETTINGS_KEY = 'cycle:settings:v1';
const LOG_KEY = 'cycle:log:v1';

const DEFAULT_SETTINGS: CycleSettings = {
  cycleLengthDays: 28,
  periodLengthDays: 5,
  lastPeriodStart: null,
  cycleEnabled: true,
};

export async function getCycleSettings(): Promise<CycleSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CycleSettings>;
    return {
      cycleLengthDays: clamp(Math.round(parsed.cycleLengthDays ?? 28), 15, 60),
      periodLengthDays: clamp(Math.round(parsed.periodLengthDays ?? 5), 1, 14),
      lastPeriodStart: parsed.lastPeriodStart ?? null,
      cycleEnabled: parsed.cycleEnabled ?? true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveCycleSettings(settings: Partial<CycleSettings>): Promise<CycleSettings> {
  const prev = await getCycleSettings();
  const next: CycleSettings = {
    cycleLengthDays: clamp(Math.round(settings.cycleLengthDays ?? prev.cycleLengthDays), 15, 60),
    periodLengthDays: clamp(Math.round(settings.periodLengthDays ?? prev.periodLengthDays), 1, 14),
    lastPeriodStart: settings.lastPeriodStart ?? prev.lastPeriodStart,
    cycleEnabled: settings.cycleEnabled ?? prev.cycleEnabled,
  };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function getCycleLog(from?: string, to?: string): Promise<CycleLogItem[]> {
  const raw = await AsyncStorage.getItem(LOG_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as CycleLogItem[];
    return parsed
      .filter(x => (!from || x.date >= from) && (!to || x.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export async function upsertCycleLog(item: CycleLogItem): Promise<CycleLogItem> {
  const all = await getCycleLog();
  const idx = all.findIndex(x => x.date === item.date);
  if (idx >= 0) {
    all[idx] = {...all[idx], ...item};
  } else {
    all.push(item);
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(all));
  return item;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
