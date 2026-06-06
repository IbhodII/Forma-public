import {isHealthConnectModuleEnabled} from '../services/hcModuleSettings';
import type {FoodPhase} from '../types/food';
import {
  loadPendingRows,
  type ExportedEntityRef,
  type SyncableTable,
} from './changeTracker';
import {buildEntityId, type FormaSyncEntityType, type FormaSyncJsonlRow} from './entityTypes';
import {getOrCreateDeviceId} from './deviceId';

export type ExportChangesResult = {
  jsonl: Record<FormaSyncEntityType, FormaSyncJsonlRow[]>;
  exportedRefs: ExportedEntityRef[];
  rowCount: number;
};

const SOURCE = 'mobile' as const;

function ref(table: SyncableTable, keyColumn: string, keyValue: string | number): ExportedEntityRef {
  return {table, keyColumn, keyValue};
}

export async function exportPendingChanges(): Promise<ExportChangesResult> {
  const deviceId = await getOrCreateDeviceId();
  const exportedRefs: ExportedEntityRef[] = [];
  const jsonl: Record<FormaSyncEntityType, FormaSyncJsonlRow[]> = {
    food_entries: [],
    body_metrics: [],
    strength_workouts: [],
    stretching_log: [],
    bracelet_calories: [],
    hc_days: [],
    cardio_workouts: [],
    food_products: [],
    strength_presets: [],
    user_preferences: [],
  };

  const foodRows = await loadPendingRows('food_entries');
  for (const row of foodRows) {
    const id = row.id as number;
    const deletedAt = (row.deleted_at as string | null) ?? ((row.deleted as number) === 1 ? (row.updated_at as string) : null);
    const payload = deletedAt ? null : JSON.parse(row.payload_json as string);
    jsonl.food_entries.push({
      id: buildEntityId('food_entries', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : {...payload, phase: row.phase as FoodPhase},
    });
    exportedRefs.push(ref('food_entries', 'id', id));
  }

  const bodyRows = await loadPendingRows('body_metrics');
  for (const row of bodyRows) {
    const id = row.id as number;
    const deletedAt = (row.deleted_at as string | null) ?? ((row.deleted as number) === 1 ? (row.updated_at as string) : null);
    jsonl.body_metrics.push({
      id: buildEntityId('body_metrics', SOURCE, id),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('body_metrics', 'id', id));
  }

  const workoutRows = await loadPendingRows('workouts');
  for (const row of workoutRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    jsonl.strength_workouts.push({
      id: buildEntityId('strength_workouts', SOURCE, id),
      server_id: (row.server_workout_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.sets_json as string),
    });
    exportedRefs.push(ref('workouts', 'id', id));
  }

  const stretchRows = await loadPendingRows('stretching_log');
  for (const row of stretchRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    jsonl.stretching_log.push({
      id: buildEntityId('stretching_log', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('stretching_log', 'id', id));
  }

  const braceletRows = await loadPendingRows('bracelet_calories_queue');
  for (const row of braceletRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    jsonl.bracelet_calories.push({
      id: buildEntityId('bracelet_calories', SOURCE, row.date as string),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt
        ? null
        : {date: row.date, total_calories: row.total_calories},
    });
    exportedRefs.push(ref('bracelet_calories_queue', 'id', id));
  }

  if (await isHealthConnectModuleEnabled()) {
    const hcRows = await loadPendingRows('hc_day_metrics');
    for (const row of hcRows) {
      const date = row.date as string;
      const dayPayload = JSON.parse(row.payload_json as string);
      const providers = JSON.parse(row.providers_json as string) as Record<string, string | undefined>;
      const primaryProvider =
        providers.steps ??
        providers.sleep ??
        providers.heart_rate ??
        providers.workouts ??
        Object.values(providers).find(Boolean);
      jsonl.hc_days.push({
        id: buildEntityId('hc_days', SOURCE, date),
        server_id: null,
        updated_at: row.updated_at as string,
        deleted_at: (row.deleted_at as string | null) ?? null,
        source: SOURCE,
        device_id: deviceId,
        payload: {
          source: 'health_connect',
          provider: primaryProvider,
          providers,
          ...dayPayload,
        },
      });
      exportedRefs.push(ref('hc_day_metrics', 'date', date));
    }
  }

  const cardioRows = await loadPendingRows('cardio_workouts_cache');
  for (const row of cardioRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    jsonl.cardio_workouts.push({
      id: buildEntityId('cardio_workouts', SOURCE, id),
      server_id: id > 0 ? id : null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.workout_json as string),
    });
    exportedRefs.push(ref('cardio_workouts_cache', 'id', id));
  }

  const productRows = await loadPendingRows('food_products_local');
  for (const row of productRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    jsonl.food_products.push({
      id: buildEntityId('food_products', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('food_products_local', 'id', id));
  }

  const presetRows = await loadPendingRows('strength_presets_cache');
  for (const row of presetRows) {
    const id = row.id as number;
    const deletedAt = row.deleted_at as string | null;
    const payloadRaw = row.payload_json as string | undefined;
    const payload = payloadRaw && payloadRaw !== '{}'
      ? JSON.parse(payloadRaw)
      : {id, name: row.name};
    jsonl.strength_presets.push({
      id: buildEntityId('strength_presets', SOURCE, id),
      server_id: id > 0 ? id : null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : payload,
    });
    exportedRefs.push(ref('strength_presets_cache', 'id', id));
  }

  const prefRows = await loadPendingRows('forma_sync_preferences');
  for (const row of prefRows) {
    const key = row.pref_key as string;
    const deletedAt = row.deleted_at as string | null;
    jsonl.user_preferences.push({
      id: buildEntityId('user_preferences', SOURCE, key),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: deletedAt,
      source: SOURCE,
      device_id: deviceId,
      payload: deletedAt ? null : JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('forma_sync_preferences', 'pref_key', key));
  }

  const rowCount = Object.values(jsonl).reduce((sum, arr) => sum + arr.length, 0);
  return {jsonl, exportedRefs, rowCount};
}
