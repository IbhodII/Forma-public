import type {StretchingLogEntry} from '../types/stretching';
import {markRowPendingOnInsert} from '../sync/changeTracker';
import {executeSql, nowIso} from './index';

export type StretchingLogPayload = {
  date: string;
  preset_id: number;
  duration_minutes?: number | null;
  notes?: string | null;
};

export async function enqueueStretchingLog(payload: StretchingLogPayload): Promise<number> {
  const rs = await executeSql(
    `INSERT INTO stretching_log (payload_json, synced, updated_at) VALUES (?, 0, ?)`,
    [JSON.stringify(payload), nowIso()],
  );
  const id = rs.insertId ?? 0;
  await markRowPendingOnInsert('stretching_log', 'id', id);
  await appendStretchingLogCache(payload, id);
  return id;
}

async function appendStretchingLogCache(
  payload: StretchingLogPayload,
  localId: number,
): Promise<void> {
  const key = 'log:30';
  const rs = await executeSql('SELECT data_json FROM stretching_log_cache WHERE cache_key = ?', [
    key,
  ]);
  const list: StretchingLogEntry[] =
    rs.rows.length > 0
      ? (JSON.parse(rs.rows.item(0).data_json as string) as StretchingLogEntry[])
      : [];
  list.unshift({
    id: -localId,
    date: payload.date,
    preset_id: payload.preset_id,
    preset_name: 'Офлайн',
    duration_minutes: payload.duration_minutes ?? null,
    notes: payload.notes ?? '',
  });
  await executeSql(
    'INSERT OR REPLACE INTO stretching_log_cache (cache_key, data_json, updated_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(list), nowIso()],
  );
}

export async function listPendingStretchingLogs(): Promise<
  Array<{id: number; payload: StretchingLogPayload}>
> {
  const rs = await executeSql('SELECT id, payload_json FROM stretching_log WHERE synced = 0');
  const out: Array<{id: number; payload: StretchingLogPayload}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({id: row.id as number, payload: JSON.parse(row.payload_json as string)});
  }
  return out;
}

export async function markStretchingLogSynced(
  localId: number,
  serverEntry: StretchingLogEntry,
): Promise<void> {
  await executeSql('UPDATE stretching_log SET synced = 1, server_id = ? WHERE id = ?', [
    serverEntry.id,
    localId,
  ]);
}

export async function cacheStretchingLog(entries: StretchingLogEntry[], days = 30): Promise<void> {
  await executeSql(
    'INSERT OR REPLACE INTO stretching_log_cache (cache_key, data_json, updated_at) VALUES (?, ?, ?)',
    [`log:${days}`, JSON.stringify(entries), nowIso()],
  );
}

export async function getCachedStretchingLog(days = 30): Promise<StretchingLogEntry[]> {
  const rs = await executeSql('SELECT data_json FROM stretching_log_cache WHERE cache_key = ?', [
    `log:${days}`,
  ]);
  if (rs.rows.length < 1) {
    return [];
  }
  return JSON.parse(rs.rows.item(0).data_json as string) as StretchingLogEntry[];
}
