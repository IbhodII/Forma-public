import type {BodyMetricCreatePayload, BodyMetricRow, BodyMetricsResponse} from '../types/body';
import {markRowPendingOnInsert} from '../sync/changeTracker';
import {executeSql, nowIso} from './index';

export async function enqueueBodyMetric(payload: BodyMetricCreatePayload): Promise<number> {
  const rs = await executeSql(
    `INSERT INTO body_metrics (date, payload_json, synced, deleted, updated_at)
     VALUES (?, ?, 0, 0, ?)`,
    [payload.date.slice(0, 10), JSON.stringify(payload), nowIso()],
  );
  const id = rs.insertId ?? 0;
  await markRowPendingOnInsert('body_metrics', 'id', id);
  await upsertBodyMetricCacheRow(payload);
  return id;
}

async function upsertBodyMetricCacheRow(payload: BodyMetricCreatePayload): Promise<void> {
  const date = payload.date.slice(0, 10);
  const row: BodyMetricRow = {
    date,
    weight_kg: payload.weight_kg ?? null,
    body_fat_percent: payload.body_fat_percent ?? null,
    muscle_mass_kg: payload.muscle_mass_kg ?? null,
  };
  await cacheBodyMetricRow(row);
}

export async function cacheBodyMetricRow(row: BodyMetricRow): Promise<void> {
  await executeSql(
    'INSERT OR REPLACE INTO body_metrics_cache (date, row_json, updated_at) VALUES (?, ?, ?)',
    [row.date, JSON.stringify(row), nowIso()],
  );
}

export async function listPendingBodyMetrics(): Promise<
  Array<{id: number; payload: BodyMetricCreatePayload}>
> {
  const rs = await executeSql(
    'SELECT id, payload_json FROM body_metrics WHERE synced = 0 AND deleted = 0',
  );
  const out: Array<{id: number; payload: BodyMetricCreatePayload}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({id: row.id as number, payload: JSON.parse(row.payload_json as string)});
  }
  return out;
}

export async function markBodyMetricSynced(localId: number): Promise<void> {
  const {markSyncedRow} = await import('../sync/changeTracker');
  await markSyncedRow('body_metrics', 'id', localId);
}

export async function enqueueBodyMetricDelete(date: string): Promise<number> {
  const d = date.slice(0, 10);
  const rs = await executeSql(
    `INSERT INTO body_metrics (date, payload_json, synced, deleted, updated_at)
     VALUES (?, ?, 0, 1, ?)`,
    [d, JSON.stringify({date: d, deleted: true}), nowIso()],
  );
  const id = rs.insertId ?? 0;
  if (id) {
    await markRowPendingOnInsert('body_metrics', 'id', id);
  }
  await executeSql('DELETE FROM body_metrics_cache WHERE date = ?', [d]);
  return id;
}

export async function cacheBodyMetricsResponse(data: BodyMetricsResponse): Promise<void> {
  for (const item of data.items) {
    await executeSql(
      'INSERT OR REPLACE INTO body_metrics_cache (date, row_json, updated_at) VALUES (?, ?, ?)',
      [item.date, JSON.stringify(item), nowIso()],
    );
  }
}

export async function getCachedBodyMetrics(): Promise<BodyMetricRow[]> {
  const rs = await executeSql(
    'SELECT row_json FROM body_metrics_cache ORDER BY date DESC',
  );
  const items: BodyMetricRow[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    items.push(JSON.parse(rs.rows.item(i).row_json as string));
  }
  return items;
}

export async function getCachedBodyLatest(): Promise<BodyMetricRow | null> {
  const rs = await executeSql(
    'SELECT row_json FROM body_metrics_cache ORDER BY date DESC LIMIT 1',
  );
  if (!rs.rows?.length) {
    return null;
  }
  return JSON.parse(rs.rows.item(0).row_json as string) as BodyMetricRow;
}
