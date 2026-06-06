import type {HealthConnectDayPayload} from '../services/HealthConnectService';
import {markRowPendingOnInsert} from '../sync/changeTracker';
import {getStaleProviders} from './hcRecordStore';
import {executeSql, initDB, nowIso} from './index';

export type HealthConnectDayProviders = {
  steps?: string;
  active_calories?: string;
  total_calories?: string;
  weight?: string;
  sleep?: string;
  heart_rate?: string;
  workouts?: string;
};

export type HcStaleFlags = Partial<Record<keyof HealthConnectDayProviders, boolean>>;

export type HcSyncRunStatus = 'ok' | 'error' | 'partial';

export type HcSyncTrigger = 'manual' | 'background' | 'initial';

export type HcSyncRunRecord = {
  id: number;
  started_at: string;
  finished_at: string | null;
  range_from: string;
  range_to: string;
  status: HcSyncRunStatus;
  records_by_type_json: string;
  error_text: string | null;
  snapshot_json: string | null;
  trigger_type: HcSyncTrigger;
};

export type HcDebugSummary = {
  moduleEnabled: boolean;
  lastLocalReadAt: string | null;
  dayCount: number;
  dateMin: string | null;
  dateMax: string | null;
  recordsByType: Record<string, number>;
  providers: HealthConnectDayProviders;
  staleFields: string[];
  staleProviders: string[];
  manualSyncRequired: boolean;
  lastRun: {
    status: HcSyncRunStatus;
    started_at: string;
    finished_at: string | null;
    records_by_type: Record<string, number>;
    error_text: string | null;
  } | null;
};

const STALE_MS = 48 * 60 * 60 * 1000;

const TRACKED_FIELDS: Array<keyof HealthConnectDayPayload> = [
  'steps',
  'active_calories',
  'total_calories',
  'weight_kg',
  'sleep',
  'workouts',
  'heart_rate_samples',
];

function fieldsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function computeStaleFlags(
  existing: HealthConnectDayPayload | null,
  incoming: HealthConnectDayPayload,
  previousLastReadAt: string | null,
  now: Date,
): HcStaleFlags {
  const stale: HcStaleFlags = {};
  if (!existing || !previousLastReadAt) {
    return stale;
  }
  const age = now.getTime() - new Date(previousLastReadAt).getTime();
  if (age < STALE_MS) {
    return stale;
  }
  for (const field of TRACKED_FIELDS) {
    const oldVal = existing[field];
    const newVal = incoming[field];
    if (oldVal !== undefined && fieldsEqual(oldVal, newVal)) {
      stale[field as keyof HcStaleFlags] = true;
    }
  }
  return stale;
}

function mergeProviders(
  existing: HealthConnectDayProviders,
  incoming: HealthConnectDayProviders,
): HealthConnectDayProviders {
  return {...existing, ...incoming};
}

function mergeStaleFlags(existing: HcStaleFlags, incoming: HcStaleFlags): HcStaleFlags {
  const merged: HcStaleFlags = {...existing};
  for (const [field, flagged] of Object.entries(incoming)) {
    if (flagged) {
      merged[field as keyof HcStaleFlags] = true;
    } else if (merged[field as keyof HcStaleFlags] && !flagged) {
      delete merged[field as keyof HcStaleFlags];
    }
  }
  return merged;
}

export type HcDayMetricsRow = {
  date: string;
  payload: HealthConnectDayPayload;
  providers: HealthConnectDayProviders;
  last_read_at: string;
};

export async function listDayMetricsInRange(
  from: string,
  to: string,
): Promise<HcDayMetricsRow[]> {
  await initDB();
  const rs = await executeSql(
    `SELECT date, payload_json, providers_json, last_read_at FROM hc_day_metrics
     WHERE date >= ? AND date <= ? ORDER BY date ASC`,
    [from, to],
  );
  const out: HcDayMetricsRow[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      date: row.date as string,
      payload: JSON.parse(row.payload_json as string) as HealthConnectDayPayload,
      providers: JSON.parse(row.providers_json as string) as HealthConnectDayProviders,
      last_read_at: row.last_read_at as string,
    });
  }
  return out;
}

export async function getDayMetrics(date: string): Promise<{
  payload: HealthConnectDayPayload;
  providers: HealthConnectDayProviders;
  stale_flags: HcStaleFlags;
  last_read_at: string;
  updated_at: string;
} | null> {
  await initDB();
  const rs = await executeSql('SELECT * FROM hc_day_metrics WHERE date = ?', [date]);
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  return {
    payload: JSON.parse(row.payload_json as string) as HealthConnectDayPayload,
    providers: JSON.parse(row.providers_json as string) as HealthConnectDayProviders,
    stale_flags: JSON.parse(row.stale_flags_json as string) as HcStaleFlags,
    last_read_at: row.last_read_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function upsertDayMetrics(
  date: string,
  payload: HealthConnectDayPayload,
  providers: HealthConnectDayProviders = {},
): Promise<void> {
  await initDB();
  const readAt = nowIso();
  const existing = await getDayMetrics(date);
  const staleFlags = computeStaleFlags(
    existing?.payload ?? null,
    payload,
    existing?.last_read_at ?? null,
    new Date(readAt),
  );
  const mergedProviders = mergeProviders(existing?.providers ?? {}, providers);
  const mergedStale = mergeStaleFlags(existing?.stale_flags ?? {}, staleFlags);
  const changed =
    !existing ||
    !fieldsEqual(existing.payload, payload) ||
    !fieldsEqual(existing.providers, mergedProviders) ||
    !fieldsEqual(existing.stale_flags, mergedStale);

  await executeSql(
    `INSERT OR REPLACE INTO hc_day_metrics
      (date, payload_json, providers_json, stale_flags_json, last_read_at, updated_at, forma_sync_synced, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      date,
      JSON.stringify(payload),
      JSON.stringify(mergedProviders),
      JSON.stringify(mergedStale),
      readAt,
      changed ? readAt : existing!.updated_at,
      changed ? 0 : (existing ? 1 : 0),
      changed ? 'pending' : (existing?.updated_at ? 'synced' : 'pending'),
    ],
  );
  if (changed) {
    await markRowPendingOnInsert('hc_day_metrics', 'date', date);
  }
}

export async function upsertDayMetricsBatch(
  days: HealthConnectDayPayload[],
  providersByDay: Map<string, HealthConnectDayProviders>,
): Promise<number> {
  let saved = 0;
  for (const day of days) {
    await upsertDayMetrics(day.date, day, providersByDay.get(day.date) ?? {});
    saved += 1;
  }
  return saved;
}

export async function startSyncRun(
  rangeFrom: string,
  rangeTo: string,
  trigger: HcSyncTrigger = 'manual',
): Promise<number> {
  await initDB();
  const rs = await executeSql(
    `INSERT INTO hc_sync_runs (started_at, range_from, range_to, status, records_by_type_json, trigger_type)
     VALUES (?, ?, ?, 'partial', '{}', ?)`,
    [nowIso(), rangeFrom, rangeTo, trigger],
  );
  return rs.insertId as number;
}

export async function finishSyncRun(
  runId: number,
  status: HcSyncRunStatus,
  recordsByType: Record<string, number>,
  errorText?: string,
  snapshotJson?: string,
): Promise<void> {
  await executeSql(
    `UPDATE hc_sync_runs
     SET finished_at = ?, status = ?, records_by_type_json = ?, error_text = ?, snapshot_json = ?
     WHERE id = ?`,
    [
      nowIso(),
      status,
      JSON.stringify(recordsByType),
      errorText ?? null,
      snapshotJson ?? null,
      runId,
    ],
  );
}

export async function getLatestSyncRun(trigger?: HcSyncTrigger): Promise<HcSyncRunRecord | null> {
  await initDB();
  const rs = trigger
    ? await executeSql(
        'SELECT * FROM hc_sync_runs WHERE trigger_type = ? ORDER BY id DESC LIMIT 1',
        [trigger],
      )
    : await executeSql('SELECT * FROM hc_sync_runs ORDER BY id DESC LIMIT 1');
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  return {
    id: row.id as number,
    started_at: row.started_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
    range_from: row.range_from as string,
    range_to: row.range_to as string,
    status: row.status as HcSyncRunStatus,
    records_by_type_json: row.records_by_type_json as string,
    error_text: (row.error_text as string | null) ?? null,
    snapshot_json: (row.snapshot_json as string | null) ?? null,
    trigger_type: (row.trigger_type as HcSyncTrigger) ?? 'manual',
  };
}

export async function aggregateRecordsByType(): Promise<Record<string, number>> {
  await initDB();
  const rs = await executeSql('SELECT payload_json FROM hc_day_metrics');
  const totals: Record<string, number> = {
    days: rs.rows.length,
    steps: 0,
    sleep: 0,
    workouts: 0,
    hr_samples: 0,
  };
  for (let i = 0; i < rs.rows.length; i++) {
    const payload = JSON.parse(rs.rows.item(i).payload_json as string) as HealthConnectDayPayload;
    if (payload.steps != null) totals.steps += 1;
    if (payload.sleep) totals.sleep += 1;
    if (payload.workouts?.length) totals.workouts += payload.workouts.length;
    totals.hr_samples += payload.heart_rate_samples?.length ?? 0;
  }
  return totals;
}

export async function aggregateProviders(): Promise<HealthConnectDayProviders> {
  await initDB();
  const rs = await executeSql('SELECT providers_json FROM hc_day_metrics');
  const merged: HealthConnectDayProviders = {};
  for (let i = 0; i < rs.rows.length; i++) {
    const row = JSON.parse(rs.rows.item(i).providers_json as string) as HealthConnectDayProviders;
    for (const [key, value] of Object.entries(row)) {
      if (value && !merged[key as keyof HealthConnectDayProviders]) {
        merged[key as keyof HealthConnectDayProviders] = value;
      }
    }
  }
  return merged;
}

export async function aggregateStaleFields(): Promise<string[]> {
  await initDB();
  const rs = await executeSql('SELECT stale_flags_json FROM hc_day_metrics');
  const fields = new Set<string>();
  for (let i = 0; i < rs.rows.length; i++) {
    const flags = JSON.parse(rs.rows.item(i).stale_flags_json as string) as HcStaleFlags;
    for (const [field, flagged] of Object.entries(flags)) {
      if (flagged) {
        fields.add(field);
      }
    }
  }
  return [...fields];
}

export async function getDateRange(): Promise<{min: string | null; max: string | null; count: number}> {
  await initDB();
  const rs = await executeSql(
    'SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as cnt FROM hc_day_metrics',
  );
  if (rs.rows.length < 1) {
    return {min: null, max: null, count: 0};
  }
  const row = rs.rows.item(0);
  return {
    min: (row.min_date as string | null) ?? null,
    max: (row.max_date as string | null) ?? null,
    count: (row.cnt as number) || 0,
  };
}

export async function getDebugSummary(options: {
  moduleEnabled: boolean;
  lastLocalReadAt: string | null;
  permissionsMissing?: boolean;
}): Promise<HcDebugSummary> {
  const [range, recordsByType, providers, staleFields, staleProviders, lastRun] = await Promise.all([
    getDateRange(),
    aggregateRecordsByType(),
    aggregateProviders(),
    aggregateStaleFields(),
    getStaleProviders(),
    getLatestSyncRun(),
  ]);

  const lastRunRecords = lastRun
    ? (JSON.parse(lastRun.records_by_type_json) as Record<string, number>)
    : {};

  return {
    moduleEnabled: options.moduleEnabled,
    lastLocalReadAt: options.lastLocalReadAt,
    dayCount: range.count,
    dateMin: range.min,
    dateMax: range.max,
    recordsByType,
    providers,
    staleFields,
    staleProviders,
    manualSyncRequired:
      options.moduleEnabled &&
      (options.permissionsMissing === true ||
        staleProviders.length > 0 ||
        lastRun?.status === 'error' ||
        !options.lastLocalReadAt),
    lastRun: lastRun
      ? {
          status: lastRun.status,
          started_at: lastRun.started_at,
          finished_at: lastRun.finished_at,
          records_by_type: lastRunRecords,
          error_text: lastRun.error_text,
        }
      : null,
  };
}

export async function loadChangedHcDays(watermark: string): Promise<
  Array<{
    date: string;
    payload_json: string;
    providers_json: string;
    updated_at: string;
  }>
> {
  await initDB();
  const rs = await executeSql(
    `SELECT date, payload_json, providers_json, updated_at FROM hc_day_metrics
     WHERE updated_at > ? OR forma_sync_synced = 0
     ORDER BY date`,
    [watermark],
  );
  const out: Array<{
    date: string;
    payload_json: string;
    providers_json: string;
    updated_at: string;
  }> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      date: row.date as string,
      payload_json: row.payload_json as string,
      providers_json: row.providers_json as string,
      updated_at: row.updated_at as string,
    });
  }
  return out;
}

export async function getLocalHcDayState(date: string): Promise<{
  updated_at: string;
  payload: HealthConnectDayPayload;
  providers: HealthConnectDayProviders;
} | null> {
  const row = await getDayMetrics(date);
  if (!row) {
    return null;
  }
  return {
    updated_at: row.updated_at,
    payload: row.payload,
    providers: row.providers,
  };
}

export async function applyIncomingHcDay(
  date: string,
  payload: HealthConnectDayPayload,
  providers: HealthConnectDayProviders,
  updatedAt: string,
): Promise<void> {
  await initDB();
  const existing = await getDayMetrics(date);
  if (existing && new Date(existing.updated_at).getTime() >= new Date(updatedAt).getTime()) {
    return;
  }
  await executeSql(
    `INSERT OR REPLACE INTO hc_day_metrics
      (date, payload_json, providers_json, stale_flags_json, last_read_at, updated_at, forma_sync_synced)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [
      date,
      JSON.stringify(payload),
      JSON.stringify(providers),
      existing ? JSON.stringify(existing.stale_flags) : '{}',
      existing?.last_read_at ?? updatedAt,
      updatedAt,
    ],
  );
}
