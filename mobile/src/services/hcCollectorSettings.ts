import {getMeta, setMeta} from '../database/index';
import {BACKGROUND_INTERVAL_MIN, estimateNextBackgroundRun, type InitialSyncDays} from './hcReadWindow';

export type HcDataType = 'steps' | 'sleep' | 'heart_rate' | 'calories' | 'workouts';

export type HcBackgroundStatus =
  | 'ok'
  | 'no_data'
  | 'permissions'
  | 'unavailable'
  | 'error';

export const HC_BACKGROUND_ENABLED_KEY = 'hc:background_enabled';
export const HC_BACKGROUND_LAST_RUN_AT_KEY = 'hc:background_last_run_at';
export const HC_BACKGROUND_NEXT_RUN_EST_KEY = 'hc:background_next_run_est_at';
export const HC_BACKGROUND_LAST_STATUS_KEY = 'hc:background_last_status';
export const HC_BACKGROUND_LAST_RECORDS_FOUND_KEY = 'hc:background_last_records_found';
export const HC_BACKGROUND_LAST_RECORDS_SAVED_KEY = 'hc:background_last_records_saved';
export const HC_BACKGROUND_LAST_ERROR_KEY = 'hc:background_last_error';
export const HC_INITIAL_SYNC_DAYS_KEY = 'hc:initial_sync_days';

const TYPE_KEYS: Record<HcDataType, string> = {
  steps: 'hc:type_steps',
  sleep: 'hc:type_sleep',
  heart_rate: 'hc:type_heart_rate',
  calories: 'hc:type_calories',
  workouts: 'hc:type_workouts',
};

export const ALL_HC_DATA_TYPES: HcDataType[] = [
  'steps',
  'sleep',
  'heart_rate',
  'calories',
  'workouts',
];

async function getFlag(key: string, defaultOn = true): Promise<boolean> {
  const raw = await getMeta(key);
  if (raw == null) {
    return defaultOn;
  }
  return raw === '1';
}

async function setFlag(key: string, enabled: boolean): Promise<void> {
  await setMeta(key, enabled ? '1' : '0');
}

export async function isHcBackgroundCollectorEnabled(): Promise<boolean> {
  return getFlag(HC_BACKGROUND_ENABLED_KEY, true);
}

export async function setHcBackgroundCollectorEnabled(enabled: boolean): Promise<void> {
  await setFlag(HC_BACKGROUND_ENABLED_KEY, enabled);
}

export async function isHcDataTypeEnabled(type: HcDataType): Promise<boolean> {
  return getFlag(TYPE_KEYS[type], true);
}

export async function setHcDataTypeEnabled(type: HcDataType, enabled: boolean): Promise<void> {
  await setFlag(TYPE_KEYS[type], enabled);
}

export async function getEnabledHcDataTypes(): Promise<Set<HcDataType>> {
  const enabled = new Set<HcDataType>();
  for (const type of ALL_HC_DATA_TYPES) {
    if (await isHcDataTypeEnabled(type)) {
      enabled.add(type);
    }
  }
  return enabled;
}

export async function getInitialSyncDays(): Promise<InitialSyncDays> {
  const raw = await getMeta(HC_INITIAL_SYNC_DAYS_KEY);
  if (raw === '14' || raw === '30') {
    return Number(raw) as InitialSyncDays;
  }
  return 7;
}

export async function setInitialSyncDays(days: InitialSyncDays): Promise<void> {
  await setMeta(HC_INITIAL_SYNC_DAYS_KEY, String(days));
}

export type HcBackgroundRunSummary = {
  enabled: boolean;
  lastRunAt: string | null;
  nextRunEstAt: string | null;
  lastStatus: HcBackgroundStatus | null;
  lastRecordsFound: number;
  lastRecordsSaved: number;
  lastError: string | null;
};

export async function getHcBackgroundRunSummary(): Promise<HcBackgroundRunSummary> {
  const [
    enabled,
    lastRunAt,
    nextRunEst,
    lastStatus,
    foundRaw,
    savedRaw,
    lastError,
  ] = await Promise.all([
    isHcBackgroundCollectorEnabled(),
    getMeta(HC_BACKGROUND_LAST_RUN_AT_KEY),
    getMeta(HC_BACKGROUND_NEXT_RUN_EST_KEY),
    getMeta(HC_BACKGROUND_LAST_STATUS_KEY),
    getMeta(HC_BACKGROUND_LAST_RECORDS_FOUND_KEY),
    getMeta(HC_BACKGROUND_LAST_RECORDS_SAVED_KEY),
    getMeta(HC_BACKGROUND_LAST_ERROR_KEY),
  ]);

  return {
    enabled,
    lastRunAt,
    nextRunEstAt: nextRunEst ?? estimateNextBackgroundRun(lastRunAt),
    lastStatus: (lastStatus as HcBackgroundStatus | null) ?? null,
    lastRecordsFound: Number(foundRaw) || 0,
    lastRecordsSaved: Number(savedRaw) || 0,
    lastError,
  };
}

export async function recordHcBackgroundRun(result: {
  status: HcBackgroundStatus;
  recordsFound: number;
  recordsSaved: number;
  error?: string | null;
}): Promise<void> {
  const runAt = new Date().toISOString();
  await setMeta(HC_BACKGROUND_LAST_RUN_AT_KEY, runAt);
  await setMeta(
    HC_BACKGROUND_NEXT_RUN_EST_KEY,
    estimateNextBackgroundRun(runAt) ?? '',
  );
  await setMeta(HC_BACKGROUND_LAST_STATUS_KEY, result.status);
  await setMeta(HC_BACKGROUND_LAST_RECORDS_FOUND_KEY, String(result.recordsFound));
  await setMeta(HC_BACKGROUND_LAST_RECORDS_SAVED_KEY, String(result.recordsSaved));
  if (result.error) {
    await setMeta(HC_BACKGROUND_LAST_ERROR_KEY, result.error);
  } else {
    await setMeta(HC_BACKGROUND_LAST_ERROR_KEY, '');
  }
}
