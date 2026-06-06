import RNFS from 'react-native-fs';
import {unzip} from 'react-native-zip-archive';

import {enqueueConflict} from '../database/conflictStore';
import {
  applyIncomingHcDay,
  getLocalHcDayState,
  type HealthConnectDayProviders,
} from '../database/hcStore';
import {executeSql, initDB, nowIso} from '../database/index';
import {upsertBraceletCaloriesCache} from '../database/foodStore';
import type {FoodPhase} from '../types/food';
import {markEntityConflict, markImported} from './changeTracker';
import {getOrCreateDeviceId} from './deviceId';
import {
  isCrossOrigin,
  parseEntityId,
  type FormaSyncEntityType,
  type FormaSyncJsonlRow,
} from './entityTypes';
import type {PackageMeta} from './packageBuilder';
import {sha256HexFile} from './sha256File';
import {getLastSeenRevision} from './syncMeta';

export type ApplyPackageResult = {
  applied: number;
  conflicts: number;
  skipped: boolean;
  error?: string;
  corruptLines?: number;
};

type LocalEntityState = {
  updated_at: string;
  deleted_at?: string | null;
  payload: unknown;
  localKey: string;
  dbId?: number;
};

function parseJsonlSafe(content: string): {rows: FormaSyncJsonlRow[]; corruptLines: number} {
  const rows: FormaSyncJsonlRow[] = [];
  let corruptLines = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      rows.push(JSON.parse(trimmed) as FormaSyncJsonlRow);
    } catch {
      corruptLines += 1;
    }
  }
  return {rows, corruptLines};
}

function payloadEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isNewer(incoming: string, local: string): boolean {
  return new Date(incoming).getTime() > new Date(local).getTime();
}

async function recordConflict(params: {
  entityType: string;
  entityLabel: string;
  localPayload: unknown;
  serverPayload?: unknown;
  remoteUpdatedAt: string;
  table: Parameters<typeof markEntityConflict>[0];
  keyColumn: string;
  keyValue: string | number;
}): Promise<void> {
  await enqueueConflict({
    entityType: params.entityType,
    entityLabel: params.entityLabel,
    localPayload: params.localPayload,
    serverPayload: params.serverPayload,
    previousPayload: params.localPayload,
    remoteUpdatedAt: params.remoteUpdatedAt,
    winner: 'remote',
  });
  await markEntityConflict(params.table, params.keyColumn, params.keyValue);
}

async function getLocalFoodState(
  localKey: string,
  crossOrigin: boolean,
  serverId?: number | null,
): Promise<LocalEntityState | null> {
  if (crossOrigin && serverId) {
    const byServer = await executeSql('SELECT * FROM food_entries WHERE server_id = ?', [serverId]);
    if (byServer.rows.length > 0) {
      const row = byServer.rows.item(0);
      const deleted = (row.deleted as number) === 1 || row.deleted_at;
      return {
        updated_at: row.updated_at as string,
        deleted_at: deleted ? ((row.deleted_at as string) ?? (row.updated_at as string)) : null,
        payload: JSON.parse(row.payload_json as string),
        localKey: String(row.id),
        dbId: row.id as number,
      };
    }
    return null;
  }
  const rs = await executeSql('SELECT * FROM food_entries WHERE id = ?', [Number(localKey)]);
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  const deleted = (row.deleted as number) === 1 || row.deleted_at;
  return {
    updated_at: row.updated_at as string,
    deleted_at: deleted ? ((row.deleted_at as string) ?? (row.updated_at as string)) : null,
    payload: JSON.parse(row.payload_json as string),
    localKey,
    dbId: row.id as number,
  };
}

async function getLocalBodyState(
  localKey: string,
  crossOrigin: boolean,
): Promise<LocalEntityState | null> {
  if (crossOrigin) {
    const rs = await executeSql(
      'SELECT * FROM body_metrics WHERE date = ? ORDER BY id DESC LIMIT 1',
      [localKey.slice(0, 10)],
    );
    if (rs.rows.length > 0) {
      const row = rs.rows.item(0);
      return {
        updated_at: row.updated_at as string,
        deleted_at: (row.deleted_at as string | null) ?? null,
        payload: JSON.parse(row.payload_json as string),
        localKey: String(row.id),
        dbId: row.id as number,
      };
    }
    return null;
  }
  const rs = await executeSql('SELECT * FROM body_metrics WHERE id = ?', [Number(localKey)]);
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  const deleted = (row.deleted as number) === 1 || row.deleted_at;
  return {
    updated_at: row.updated_at as string,
    deleted_at: deleted ? ((row.deleted_at as string) ?? (row.updated_at as string)) : null,
    payload: JSON.parse(row.payload_json as string),
    localKey,
    dbId: row.id as number,
  };
}

async function getLocalWorkoutState(
  localKey: string,
  crossOrigin: boolean,
  serverId?: number | null,
): Promise<LocalEntityState | null> {
  if (crossOrigin && serverId) {
    const rs = await executeSql('SELECT * FROM workouts WHERE server_workout_id = ?', [serverId]);
    if (rs.rows.length > 0) {
      const row = rs.rows.item(0);
      return {
        updated_at: row.updated_at as string,
        deleted_at: (row.deleted_at as string | null) ?? null,
        payload: JSON.parse(row.sets_json as string),
        localKey: String(row.id),
        dbId: row.id as number,
      };
    }
    return null;
  }
  const rs = await executeSql('SELECT * FROM workouts WHERE id = ?', [Number(localKey)]);
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  return {
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    payload: JSON.parse(row.sets_json as string),
    localKey,
    dbId: row.id as number,
  };
}

async function getLocalStretchState(
  localKey: string,
  crossOrigin: boolean,
  serverId?: number | null,
): Promise<LocalEntityState | null> {
  if (crossOrigin && serverId) {
    const rs = await executeSql('SELECT * FROM stretching_log WHERE server_id = ?', [serverId]);
    if (rs.rows.length > 0) {
      const row = rs.rows.item(0);
      return {
        updated_at: row.updated_at as string,
        deleted_at: (row.deleted_at as string | null) ?? null,
        payload: JSON.parse(row.payload_json as string),
        localKey: String(row.id),
        dbId: row.id as number,
      };
    }
    return null;
  }
  const rs = await executeSql('SELECT * FROM stretching_log WHERE id = ?', [Number(localKey)]);
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  return {
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    payload: JSON.parse(row.payload_json as string),
    localKey,
    dbId: row.id as number,
  };
}

async function getLocalBraceletState(localKey: string): Promise<LocalEntityState | null> {
  const rs = await executeSql(
    'SELECT * FROM bracelet_calories_queue WHERE date = ? ORDER BY id DESC LIMIT 1',
    [localKey],
  );
  if (rs.rows.length < 1) {
    return null;
  }
  const row = rs.rows.item(0);
  return {
    updated_at: row.updated_at as string,
    payload: {date: row.date, total_calories: row.total_calories},
    localKey,
    dbId: row.id as number,
  };
}

async function applyFoodRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  const local = await getLocalFoodState(parsed.localKey, crossOrigin, row.server_id);
  const incomingPayload = row.payload as Record<string, unknown> | null;
  const phase = (incomingPayload?.phase as FoodPhase) ?? 'cut';
  const targetId = local?.dbId;

  if (local && targetId != null) {
    if (row.deleted_at && isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE food_entries SET deleted = 1, deleted_at = ?, updated_at = ?,
         synced = 0, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, targetId],
      );
      return 'applied';
    }
    if (row.deleted_at) {
      return 'skipped';
    }
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE food_entries SET payload_json = ?, updated_at = ?, synced = 0, server_id = ?,
         deleted = 0, deleted_at = NULL, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, row.server_id ?? null, revision, targetId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'food_entries',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'food_entries',
        keyColumn: 'id',
        keyValue: targetId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (row.deleted_at || !incomingPayload) {
    return 'skipped';
  }

  const rs = await executeSql(
    `INSERT INTO food_entries (date, phase, payload_json, synced, deleted, updated_at, server_id, sync_status, last_synced_revision)
     VALUES (?, ?, ?, 0, 0, ?, ?, 'synced', ?)`,
    [
      (incomingPayload.date as string) ?? nowIso().slice(0, 10),
      phase,
      JSON.stringify(incomingPayload),
      row.updated_at,
      row.server_id ?? null,
      revision,
    ],
  );
  await markImported('food_entries', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyBodyRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  const local = await getLocalBodyState(parsed.localKey, crossOrigin);
  const incomingPayload = row.payload as Record<string, unknown> | null;
  const targetId = local?.dbId;

  if (local && targetId != null) {
    if (row.deleted_at && isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE body_metrics SET deleted = 1, deleted_at = ?, updated_at = ?, synced = 0,
         sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, targetId],
      );
      return 'applied';
    }
    if (row.deleted_at) {
      return 'skipped';
    }
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE body_metrics SET payload_json = ?, updated_at = ?, synced = 0, deleted = 0, deleted_at = NULL,
         sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, revision, targetId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'body_metrics',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'body_metrics',
        keyColumn: 'id',
        keyValue: targetId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (row.deleted_at || !incomingPayload) {
    return 'skipped';
  }

  const rs = await executeSql(
    `INSERT INTO body_metrics (date, payload_json, synced, deleted, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, 0, 0, ?, 'synced', ?)`,
    [
      ((incomingPayload.date as string) ?? nowIso()).slice(0, 10),
      JSON.stringify(incomingPayload),
      row.updated_at,
      revision,
    ],
  );
  await markImported('body_metrics', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyWorkoutRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  const local = await getLocalWorkoutState(parsed.localKey, crossOrigin, row.server_id);
  const incomingPayload = row.payload as Record<string, unknown> | null;
  const targetId = local?.dbId;

  if (row.deleted_at && local && targetId != null) {
    if (isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE workouts SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, targetId],
      );
      return 'applied';
    }
    return 'skipped';
  }

  if (local && targetId != null) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE workouts SET sets_json = ?, updated_at = ?, synced = 0, server_workout_id = ?,
         deleted_at = NULL, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, row.server_id ?? null, revision, targetId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'strength_workouts',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'workouts',
        keyColumn: 'id',
        keyValue: targetId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload) {
    return 'skipped';
  }

  const {getUserId} = await import('../auth/session');
  const userId = (await getUserId()) ?? '1';
  const rs = await executeSql(
    `INSERT INTO workouts (date, workout_title, sets_json, is_circuit, user_id, synced, server_workout_id, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'synced', ?)`,
    [
      incomingPayload.date as string,
      incomingPayload.workout_title as string,
      JSON.stringify(incomingPayload),
      incomingPayload.is_circuit ? 1 : 0,
      userId,
      row.server_id ?? null,
      row.updated_at,
      revision,
    ],
  );
  await markImported('workouts', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyStretchRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  const local = await getLocalStretchState(parsed.localKey, crossOrigin, row.server_id);
  const incomingPayload = row.payload as Record<string, unknown> | null;
  const targetId = local?.dbId;

  if (row.deleted_at && local && targetId != null) {
    if (isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE stretching_log SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, targetId],
      );
      return 'applied';
    }
    return 'skipped';
  }

  if (local && targetId != null) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE stretching_log SET payload_json = ?, updated_at = ?, synced = 0, server_id = ?,
         deleted_at = NULL, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, row.server_id ?? null, revision, targetId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'stretching_log',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'stretching_log',
        keyColumn: 'id',
        keyValue: targetId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload) {
    return 'skipped';
  }

  const rs = await executeSql(
    `INSERT INTO stretching_log (payload_json, synced, server_id, updated_at, sync_status, last_synced_revision)
     VALUES (?, 0, ?, ?, 'synced', ?)`,
    [JSON.stringify(incomingPayload), row.server_id ?? null, row.updated_at, revision],
  );
  await markImported('stretching_log', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyBraceletRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const local = await getLocalBraceletState(parsed.localKey);
  const incomingPayload = row.payload as {date: string; total_calories: number} | null;

  if (row.deleted_at && local?.dbId != null) {
    if (isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE bracelet_calories_queue SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, local.dbId],
      );
      return 'applied';
    }
    return 'skipped';
  }

  if (local?.dbId != null) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE bracelet_calories_queue SET total_calories = ?, updated_at = ?, synced = 0,
         sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [incomingPayload?.total_calories ?? 0, row.updated_at, revision, local.dbId],
      );
      if (incomingPayload) {
        await upsertBraceletCaloriesCache(incomingPayload.date, incomingPayload.total_calories);
      }
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'bracelet_calories',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'bracelet_calories_queue',
        keyColumn: 'id',
        keyValue: local.dbId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload) {
    return 'skipped';
  }

  const rs = await executeSql(
    `INSERT INTO bracelet_calories_queue (date, total_calories, synced, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, 0, ?, 'synced', ?)`,
    [incomingPayload.date, incomingPayload.total_calories, row.updated_at, revision],
  );
  await upsertBraceletCaloriesCache(incomingPayload.date, incomingPayload.total_calories);
  await markImported('bracelet_calories_queue', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyHcDayRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const local = await getLocalHcDayState(parsed.localKey);
  const incomingPayload = row.payload as Record<string, unknown> | null;

  if (!incomingPayload || incomingPayload.source !== 'health_connect') {
    return 'skipped';
  }

  const {
    source: _source,
    provider: _provider,
    providers: incomingProviders,
    ...dayFields
  } = incomingPayload;
  const providers = (incomingProviders ?? {}) as HealthConnectDayProviders;
  const dayPayload = dayFields as import('../services/HealthConnectService').HealthConnectDayPayload;

  if (local) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await applyIncomingHcDay(parsed.localKey, dayPayload, providers, row.updated_at);
      await markImported('hc_day_metrics', 'date', parsed.localKey, revision);
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(dayPayload, local.payload)) {
      await recordConflict({
        entityType: 'hc_days',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: dayPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'hc_day_metrics',
        keyColumn: 'date',
        keyValue: parsed.localKey,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  await applyIncomingHcDay(parsed.localKey, dayPayload, providers, row.updated_at);
  await markImported('hc_day_metrics', 'date', parsed.localKey, revision);
  return 'applied';
}

async function applyCardioRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  let local: LocalEntityState | null = null;
  if (!crossOrigin) {
    const rs = await executeSql('SELECT * FROM cardio_workouts_cache WHERE id = ?', [Number(parsed.localKey)]);
    if (rs.rows.length > 0) {
      const r = rs.rows.item(0);
      local = {
        updated_at: r.updated_at as string,
        deleted_at: (r.deleted_at as string | null) ?? null,
        payload: JSON.parse(r.workout_json as string),
        localKey: parsed.localKey,
        dbId: r.id as number,
      };
    }
  } else if (row.server_id) {
    const rs = await executeSql('SELECT * FROM cardio_workouts_cache WHERE id = ?', [row.server_id]);
    if (rs.rows.length > 0) {
      const r = rs.rows.item(0);
      local = {
        updated_at: r.updated_at as string,
        deleted_at: (r.deleted_at as string | null) ?? null,
        payload: JSON.parse(r.workout_json as string),
        localKey: String(r.id),
        dbId: r.id as number,
      };
    }
  }

  const incomingPayload = row.payload as Record<string, unknown> | null;
  const workoutId = (incomingPayload?.id as number) ?? row.server_id ?? Number(parsed.localKey);

  if (row.deleted_at && local?.dbId != null) {
    if (isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE cardio_workouts_cache SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, local.dbId],
      );
      return 'applied';
    }
    return 'skipped';
  }

  if (local?.dbId != null) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE cardio_workouts_cache SET workout_json = ?, updated_at = ?, deleted_at = NULL,
         sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, revision, local.dbId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'cardio_workouts',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'cardio_workouts_cache',
        keyColumn: 'id',
        keyValue: local.dbId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload) {
    return 'skipped';
  }

  await executeSql(
    `INSERT OR REPLACE INTO cardio_workouts_cache
      (id, workout_json, updated_at, deleted_at, sync_status, last_synced_revision)
     VALUES (?, ?, ?, NULL, 'synced', ?)`,
    [workoutId, JSON.stringify(incomingPayload), row.updated_at, revision],
  );
  await markImported('cardio_workouts_cache', 'id', workoutId, revision);
  return 'applied';
}

async function applyProductRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const crossOrigin = isCrossOrigin(parsed.origin);
  let localId: number | null = null;
  let local: LocalEntityState | null = null;

  if (!crossOrigin) {
    const rs = await executeSql('SELECT * FROM food_products_local WHERE id = ?', [Number(parsed.localKey)]);
    if (rs.rows.length > 0) {
      const r = rs.rows.item(0);
      localId = r.id as number;
      local = {
        updated_at: r.updated_at as string,
        deleted_at: (r.deleted_at as string | null) ?? null,
        payload: JSON.parse(r.payload_json as string),
        localKey: parsed.localKey,
      };
    }
  } else if (row.server_id) {
    const rs = await executeSql('SELECT * FROM food_products_local WHERE server_id = ?', [row.server_id]);
    if (rs.rows.length > 0) {
      const r = rs.rows.item(0);
      localId = r.id as number;
      local = {
        updated_at: r.updated_at as string,
        deleted_at: (r.deleted_at as string | null) ?? null,
        payload: JSON.parse(r.payload_json as string),
        localKey: String(localId),
      };
    }
  }

  const incomingPayload = row.payload as Record<string, unknown> | null;
  const name = (incomingPayload?.name as string) ?? 'Product';

  if (row.deleted_at && localId != null && local) {
    if (isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE food_products_local SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, localId],
      );
      return 'applied';
    }
    return 'skipped';
  }

  if (localId != null && local) {
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE food_products_local SET name = ?, payload_json = ?, server_id = ?, updated_at = ?,
         deleted_at = NULL, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [name, JSON.stringify(incomingPayload), row.server_id ?? null, row.updated_at, revision, localId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'food_products',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'food_products_local',
        keyColumn: 'id',
        keyValue: localId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload || row.deleted_at) {
    return 'skipped';
  }

  const rs = await executeSql(
    `INSERT INTO food_products_local (name, payload_json, server_id, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, ?, ?, 'synced', ?)`,
    [name, JSON.stringify(incomingPayload), row.server_id ?? null, row.updated_at, revision],
  );
  await markImported('food_products_local', 'id', rs.insertId ?? 0, revision);
  return 'applied';
}

async function applyPresetRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const presetId = row.server_id ?? Number(parsed.localKey);
  const rs = await executeSql('SELECT * FROM strength_presets_cache WHERE id = ?', [presetId]);
  const incomingPayload = row.payload as Record<string, unknown> | null;
  const name = (incomingPayload?.name as string) ?? 'Preset';

  if (rs.rows.length > 0) {
    const r = rs.rows.item(0);
    const local = {
      updated_at: r.updated_at as string,
      deleted_at: (r.deleted_at as string | null) ?? null,
      payload: JSON.parse((r.payload_json as string) || '{}'),
    };
    if (row.deleted_at && isNewer(row.deleted_at, local.updated_at)) {
      await executeSql(
        `UPDATE strength_presets_cache SET deleted_at = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [row.deleted_at, row.deleted_at, revision, presetId],
      );
      return 'applied';
    }
    if (isNewer(row.updated_at, local.updated_at)) {
      await executeSql(
        `UPDATE strength_presets_cache SET name = ?, payload_json = ?, updated_at = ?,
         deleted_at = NULL, sync_status = 'synced', last_synced_revision = ? WHERE id = ?`,
        [name, JSON.stringify(incomingPayload ?? {}), row.updated_at, revision, presetId],
      );
      return 'applied';
    }
    if (row.updated_at === local.updated_at && !payloadEqual(incomingPayload, local.payload)) {
      await recordConflict({
        entityType: 'strength_presets',
        entityLabel: row.id,
        localPayload: local.payload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'strength_presets_cache',
        keyColumn: 'id',
        keyValue: presetId,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload || row.deleted_at) {
    return 'skipped';
  }

  await executeSql(
    `INSERT OR REPLACE INTO strength_presets_cache
      (id, name, payload_json, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, ?, ?, 'synced', ?)`,
    [presetId, name, JSON.stringify(incomingPayload), row.updated_at, revision],
  );
  await markImported('strength_presets_cache', 'id', presetId, revision);
  return 'applied';
}

async function applyPreferencesRow(
  row: FormaSyncJsonlRow,
  parsed: NonNullable<ReturnType<typeof parseEntityId>>,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const key = parsed.localKey;
  const rs = await executeSql('SELECT * FROM forma_sync_preferences WHERE pref_key = ?', [key]);
  const incomingPayload = row.payload as Record<string, unknown> | null;

  if (rs.rows.length > 0) {
    const r = rs.rows.item(0);
    const localPayload = JSON.parse(r.payload_json as string);
    const localUpdated = r.updated_at as string;
    if (isNewer(row.updated_at, localUpdated)) {
      await executeSql(
        `UPDATE forma_sync_preferences SET payload_json = ?, updated_at = ?,
         sync_status = 'synced', last_synced_revision = ? WHERE pref_key = ?`,
        [JSON.stringify(incomingPayload), row.updated_at, revision, key],
      );
      return 'applied';
    }
    if (row.updated_at === localUpdated && !payloadEqual(incomingPayload, localPayload)) {
      await recordConflict({
        entityType: 'user_preferences',
        entityLabel: row.id,
        localPayload,
        serverPayload: incomingPayload,
        remoteUpdatedAt: row.updated_at,
        table: 'forma_sync_preferences',
        keyColumn: 'pref_key',
        keyValue: key,
      });
      return 'conflict';
    }
    return 'skipped';
  }

  if (!incomingPayload || row.deleted_at) {
    return 'skipped';
  }

  await executeSql(
    `INSERT INTO forma_sync_preferences (pref_key, payload_json, updated_at, sync_status, last_synced_revision)
     VALUES (?, ?, ?, 'synced', ?)`,
    [key, JSON.stringify(incomingPayload), row.updated_at, revision],
  );
  await markImported('forma_sync_preferences', 'pref_key', key, revision);
  return 'applied';
}

async function applyRow(
  row: FormaSyncJsonlRow,
  revision: number,
): Promise<'applied' | 'conflict' | 'skipped'> {
  const parsed = parseEntityId(row.id);
  if (!parsed) {
    return 'skipped';
  }

  switch (parsed.entity) {
    case 'food_entries':
      return applyFoodRow(row, parsed, revision);
    case 'body_metrics':
      return applyBodyRow(row, parsed, revision);
    case 'strength_workouts':
      return applyWorkoutRow(row, parsed, revision);
    case 'stretching_log':
      return applyStretchRow(row, parsed, revision);
    case 'bracelet_calories':
      return applyBraceletRow(row, parsed, revision);
    case 'hc_days':
      return applyHcDayRow(row, parsed, revision);
    case 'cardio_workouts':
      return applyCardioRow(row, parsed, revision);
    case 'food_products':
      return applyProductRow(row, parsed, revision);
    case 'strength_presets':
      return applyPresetRow(row, parsed, revision);
    case 'user_preferences':
      return applyPreferencesRow(row, parsed, revision);
    default:
      return 'skipped';
  }
}

const ENTITY_FILES: FormaSyncEntityType[] = [
  'food_entries',
  'body_metrics',
  'strength_workouts',
  'stretching_log',
  'bracelet_calories',
  'hc_days',
  'cardio_workouts',
  'food_products',
  'strength_presets',
  'user_preferences',
];

export async function applyFormaSyncPackage(
  zipPath: string,
  expectedSha256: string,
  manifestRevision: number,
): Promise<ApplyPackageResult> {
  await initDB();
  const actualSha = await sha256HexFile(zipPath);
  if (actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      applied: 0,
      conflicts: 0,
      skipped: true,
      error: 'SHA256 пакета не совпадает с manifest — загрузка отменена',
    };
  }

  const dest = `${RNFS.CachesDirectoryPath}/forma-sync-import-${Date.now()}`;
  await RNFS.mkdir(dest);
  let unzipped: string;
  try {
    unzipped = await unzip(zipPath, dest);
  } catch {
    await RNFS.unlink(dest).catch(() => undefined);
    return {
      applied: 0,
      conflicts: 0,
      skipped: true,
      error: 'Не удалось распаковать пакет синхронизации',
    };
  }

  const metaPath = `${unzipped}/meta.json`;
  const metaExists = await RNFS.exists(metaPath);
  if (!metaExists) {
    await RNFS.unlink(dest).catch(() => undefined);
    return {
      applied: 0,
      conflicts: 0,
      skipped: true,
      error: 'meta.json отсутствует в пакете',
    };
  }
  let meta: PackageMeta;
  try {
    meta = JSON.parse(await RNFS.readFile(metaPath, 'utf8')) as PackageMeta;
  } catch {
    await RNFS.unlink(dest).catch(() => undefined);
    return {
      applied: 0,
      conflicts: 0,
      skipped: true,
      error: 'meta.json повреждён',
    };
  }
  if (meta.schema_version !== 1) {
    await RNFS.unlink(dest).catch(() => undefined);
    return {
      applied: 0,
      conflicts: 0,
      skipped: true,
      error: 'Неподдерживаемая версия пакета — обновите приложение',
    };
  }

  const localDeviceId = await getOrCreateDeviceId();
  const lastSeen = await getLastSeenRevision();
  if (meta.source === 'mobile' && meta.device_id === localDeviceId && manifestRevision <= lastSeen) {
    await RNFS.unlink(dest).catch(() => undefined);
    return {applied: 0, conflicts: 0, skipped: true};
  }

  let applied = 0;
  let conflicts = 0;
  let corruptLines = 0;

  try {
    for (const entity of ENTITY_FILES) {
      const filePath = `${unzipped}/changes/${entity}.jsonl`;
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        continue;
      }
      const content = await RNFS.readFile(filePath, 'utf8');
      const parsed = parseJsonlSafe(content);
      corruptLines += parsed.corruptLines;
      for (const row of parsed.rows) {
        const result = await applyRow(row, manifestRevision);
        if (result === 'applied') {
          applied += 1;
        } else if (result === 'conflict') {
          conflicts += 1;
        }
      }
    }
  } catch (e) {
    await RNFS.unlink(dest).catch(() => undefined);
    const msg = e instanceof Error ? e.message : 'Ошибка применения пакета';
    return {applied: 0, conflicts: 0, skipped: true, error: msg, corruptLines};
  }

  await RNFS.unlink(dest).catch(() => undefined);
  if (corruptLines > 0) {
    return {
      applied,
      conflicts,
      skipped: true,
      corruptLines,
      error: `Пакет частично повреждён: пропущено ${corruptLines} строк`,
    };
  }
  return {applied, conflicts, skipped: false};
}
