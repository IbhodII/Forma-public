import {executeSql, initDB, nowIso} from '../database/index';
import {isHealthConnectModuleEnabled} from '../services/hcModuleSettings';
import {getOrCreateDeviceId} from './deviceId';

export type SyncStatus = 'pending' | 'synced' | 'conflict';

export type SyncableTable =
  | 'food_entries'
  | 'body_metrics'
  | 'workouts'
  | 'stretching_log'
  | 'bracelet_calories_queue'
  | 'hc_day_metrics'
  | 'cardio_workouts_cache'
  | 'food_products_local'
  | 'strength_presets_cache'
  | 'forma_sync_preferences';

export const PENDING_WHERE = `(
  sync_status IN ('pending', 'conflict')
  OR (deleted_at IS NOT NULL AND (last_synced_revision IS NULL OR sync_status != 'synced'))
)`;

export type ExportedEntityRef = {
  table: SyncableTable;
  keyColumn: string;
  keyValue: string | number;
};

export async function markLocalChange(
  table: SyncableTable,
  keyColumn: string,
  keyValue: string | number,
  options?: {deletedAt?: string | null},
): Promise<void> {
  await initDB();
  const deviceId = await getOrCreateDeviceId();
  const ts = nowIso();
  if (options?.deletedAt) {
    await executeSql(
      `UPDATE ${table}
       SET sync_status = 'pending', device_id = ?, updated_at = ?, deleted_at = ?
       WHERE ${keyColumn} = ?`,
      [deviceId, ts, options.deletedAt, keyValue],
    );
    return;
  }
  await executeSql(
    `UPDATE ${table}
     SET sync_status = 'pending', device_id = ?, updated_at = ?
     WHERE ${keyColumn} = ?`,
    [deviceId, ts, keyValue],
  );
}

export async function markRowPendingOnInsert(
  table: SyncableTable,
  keyColumn: string,
  keyValue: string | number,
): Promise<void> {
  await initDB();
  const deviceId = await getOrCreateDeviceId();
  const ts = nowIso();
  await executeSql(
    `UPDATE ${table} SET sync_status = 'pending', synced = 0, device_id = ?, updated_at = ? WHERE ${keyColumn} = ?`,
    [deviceId, ts, keyValue],
  );
}

export async function markSyncedRow(
  table: SyncableTable,
  keyColumn: string,
  keyValue: string | number,
  revision?: number,
): Promise<void> {
  await initDB();
  const ts = nowIso();
  if (revision != null) {
    await executeSql(
      `UPDATE ${table}
       SET sync_status = 'synced', synced = 1, last_synced_revision = ?, last_sync_attempt_at = ?
       WHERE ${keyColumn} = ?`,
      [revision, ts, keyValue],
    );
    return;
  }
  await executeSql(
    `UPDATE ${table} SET sync_status = 'synced', synced = 1, last_sync_attempt_at = ? WHERE ${keyColumn} = ?`,
    [ts, keyValue],
  );
}

export async function markSyncAttempt(table: SyncableTable): Promise<void> {
  await initDB();
  const ts = nowIso();
  await executeSql(
    `UPDATE ${table} SET last_sync_attempt_at = ? WHERE ${PENDING_WHERE}`,
    [ts],
  );
}

export async function markExported(refs: ExportedEntityRef[], revision: number): Promise<void> {
  await initDB();
  for (const ref of refs) {
    await executeSql(
      `UPDATE ${ref.table}
       SET sync_status = 'synced', synced = 1, last_synced_revision = ?
       WHERE ${ref.keyColumn} = ?`,
      [revision, ref.keyValue],
    );
  }
}

export async function markImported(
  table: SyncableTable,
  keyColumn: string,
  keyValue: string | number,
  revision: number,
): Promise<void> {
  await executeSql(
    `UPDATE ${table}
     SET sync_status = 'synced', synced = 1, last_synced_revision = ?
     WHERE ${keyColumn} = ?`,
    [revision, keyValue],
  );
}

export async function markEntityConflict(
  table: SyncableTable,
  keyColumn: string,
  keyValue: string | number,
): Promise<void> {
  await executeSql(
    `UPDATE ${table} SET sync_status = 'conflict' WHERE ${keyColumn} = ?`,
    [keyValue],
  );
}

async function countPendingInTable(table: SyncableTable): Promise<number> {
  const rs = await executeSql(
    `SELECT COUNT(*) as cnt FROM ${table} WHERE ${PENDING_WHERE}`,
  );
  return (rs.rows.item(0).cnt as number) || 0;
}

export async function countPendingSyncChanges(): Promise<number> {
  await initDB();
  const tables: SyncableTable[] = [
    'food_entries',
    'body_metrics',
    'workouts',
    'stretching_log',
    'bracelet_calories_queue',
    'cardio_workouts_cache',
    'food_products_local',
    'strength_presets_cache',
    'forma_sync_preferences',
  ];
  let total = 0;
  for (const table of tables) {
    total += await countPendingInTable(table);
  }
  if (await isHealthConnectModuleEnabled()) {
    total += await countPendingInTable('hc_day_metrics');
  }
  return total;
}

const ACTIVE_NOT_DELETED = `(deleted_at IS NULL OR deleted_at = '')`;

export async function loadActiveRows(
  table: SyncableTable,
  columns = '*',
): Promise<Array<Record<string, unknown>>> {
  const rs = await executeSql(
    `SELECT ${columns} FROM ${table} WHERE ${ACTIVE_NOT_DELETED} ORDER BY updated_at`,
  );
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(rs.rows.item(i) as Record<string, unknown>);
  }
  return out;
}

export async function loadPendingRows(
  table: SyncableTable,
  columns = '*',
): Promise<Array<Record<string, unknown>>> {
  const rs = await executeSql(
    `SELECT ${columns} FROM ${table} WHERE ${PENDING_WHERE} ORDER BY updated_at`,
  );
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(rs.rows.item(i) as Record<string, unknown>);
  }
  return out;
}
