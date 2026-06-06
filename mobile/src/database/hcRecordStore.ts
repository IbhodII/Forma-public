import type {
  HealthConnectDayPayload,
  HealthConnectDayProviders,
  HealthConnectSleepPayload,
  HealthConnectWorkoutPayload,
} from '../services/HealthConnectService';
import {localDateKey} from '../services/HealthConnectService';
import {executeSql, initDB, nowIso} from './index';
import {upsertDayMetrics} from './hcStore';

export type HcRecordType =
  | 'steps'
  | 'sleep'
  | 'heart_rate'
  | 'calories_active'
  | 'calories_total'
  | 'workout';

export type HcRecordInput = {
  recordType: HcRecordType;
  provider?: string;
  startTime: string;
  endTime: string;
  metadataId?: string;
  payload: unknown;
};

function hashKey(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function buildHcRecordKey(record: HcRecordInput): string {
  if (record.metadataId) {
    return `hc:${record.recordType}:${record.metadataId}`;
  }
  const raw = `hc:${record.recordType}:${record.startTime}:${record.endTime}:${record.provider ?? ''}`;
  if (raw.length > 200) {
    return `hc:${record.recordType}:${hashKey(raw)}`;
  }
  return raw;
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function upsertHcRecord(record: HcRecordInput): Promise<'inserted' | 'updated' | 'unchanged'> {
  await initDB();
  const key = buildHcRecordKey(record);
  const capturedAt = nowIso();
  const rs = await executeSql('SELECT payload_json, updated_at FROM hc_records WHERE record_key = ?', [
    key,
  ]);
  const payloadJson = JSON.stringify(record.payload);

  if (rs.rows.length < 1) {
    await executeSql(
      `INSERT INTO hc_records
        (record_key, record_type, provider, start_time, end_time, payload_json, captured_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        key,
        record.recordType,
        record.provider ?? null,
        record.startTime,
        record.endTime,
        payloadJson,
        capturedAt,
        capturedAt,
      ],
    );
    return 'inserted';
  }

  const existing = rs.rows.item(0);
  if (fieldsEqual(JSON.parse(existing.payload_json as string), record.payload)) {
    return 'unchanged';
  }

  await executeSql(
    `UPDATE hc_records
     SET payload_json = ?, provider = ?, updated_at = ?, sync_status = 'pending'
     WHERE record_key = ?`,
    [payloadJson, record.provider ?? null, capturedAt, key],
  );
  return 'updated';
}

export async function upsertHcRecords(records: HcRecordInput[]): Promise<{
  found: number;
  saved: number;
}> {
  let saved = 0;
  for (const record of records) {
    const result = await upsertHcRecord(record);
    if (result !== 'unchanged') {
      saved += 1;
    }
  }
  return {found: records.length, saved};
}

function mergeWorkouts(
  existing: HealthConnectWorkoutPayload[] | undefined,
  incoming: HealthConnectWorkoutPayload[],
): HealthConnectWorkoutPayload[] {
  const map = new Map<string, HealthConnectWorkoutPayload>();
  for (const w of existing ?? []) {
    const key = w.external_id ?? `${w.start_time}:${w.end_time}`;
    map.set(key, w);
  }
  for (const w of incoming) {
    const key = w.external_id ?? `${w.start_time}:${w.end_time}`;
    map.set(key, w);
  }
  return [...map.values()];
}

export async function rebuildDayRollupsForDates(dates: string[]): Promise<number> {
  if (!dates.length) {
    return 0;
  }

  let rebuilt = 0;
  for (const date of dates) {
    const rs = await executeSql(
      `SELECT record_type, provider, payload_json, start_time, end_time FROM hc_records
       WHERE start_time <= ? AND end_time >= ?
       OR substr(start_time, 1, 10) = ?
       OR substr(end_time, 1, 10) = ?`,
      [`${date}T23:59:59.999Z`, `${date}T00:00:00.000Z`, date, date],
    );

    const payload: HealthConnectDayPayload = {date};
    const providers: HealthConnectDayProviders = {};
    const workouts: HealthConnectWorkoutPayload[] = [];
    const hrSamples: Array<{time: string; bpm: number}> = [];
    let stepsTotal = 0;
    let activeCal = 0;
    let totalCal = 0;

    for (let i = 0; i < rs.rows.length; i++) {
      const row = rs.rows.item(i);
      const type = row.record_type as HcRecordType;
      const provider = row.provider as string | null;
      const data = JSON.parse(row.payload_json as string);

      if (provider) {
        if (type === 'steps') providers.steps = provider;
        if (type === 'sleep') providers.sleep = provider;
        if (type === 'heart_rate') providers.heart_rate = provider;
        if (type === 'calories_active') providers.active_calories = provider;
        if (type === 'calories_total') providers.total_calories = provider;
        if (type === 'workout') providers.workouts = provider;
      }

      if (type === 'steps' && localDateKey(row.start_time as string) === date) {
        stepsTotal += Number(data.count) || 0;
      }
      if (type === 'calories_active' && localDateKey(row.start_time as string) === date) {
        activeCal += Number(data.kcal) || 0;
      }
      if (type === 'calories_total' && localDateKey(row.start_time as string) === date) {
        totalCal += Number(data.kcal) || 0;
      }
      if (type === 'sleep' && localDateKey(data.end_time ?? row.end_time) === date) {
        payload.sleep = data as HealthConnectSleepPayload;
      }
      if (type === 'workout') {
        const w = data as HealthConnectWorkoutPayload;
        if ((w.date ?? localDateKey(w.end_time)) === date) {
          workouts.push(w);
        }
      }
      if (type === 'heart_rate' && Array.isArray(data.samples)) {
        for (const s of data.samples as Array<{time: string; bpm: number}>) {
          if (localDateKey(s.time) === date) {
            hrSamples.push(s);
          }
        }
      }
    }

    if (stepsTotal > 0) payload.steps = stepsTotal;
    if (activeCal > 0) payload.active_calories = Math.round(activeCal);
    if (totalCal > 0) payload.total_calories = Math.round(totalCal);
    if (workouts.length) payload.workouts = mergeWorkouts(undefined, workouts);
    if (hrSamples.length) payload.heart_rate_samples = hrSamples;

    const hasData = Object.keys(payload).length > 1;
    if (hasData) {
      await upsertDayMetrics(date, payload, providers);
      rebuilt += 1;
    }
  }

  return rebuilt;
}

export async function aggregateProviderLastSeen(): Promise<Record<string, string>> {
  await initDB();
  const rs = await executeSql(
    `SELECT provider, MAX(updated_at) as last_seen FROM hc_records
     WHERE provider IS NOT NULL GROUP BY provider`,
  );
  const out: Record<string, string> = {};
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out[row.provider as string] = row.last_seen as string;
  }
  return out;
}

export async function getStaleProviders(staleMs = 48 * 60 * 60 * 1000): Promise<string[]> {
  const lastSeen = await aggregateProviderLastSeen();
  const now = Date.now();
  return Object.entries(lastSeen)
    .filter(([, iso]) => now - new Date(iso).getTime() > staleMs)
    .map(([provider]) => provider);
}
