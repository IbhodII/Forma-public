import {isHealthConnectModuleEnabled} from '../services/hcModuleSettings';
import type {FoodPhase} from '../types/food';
import {loadActiveRows, type ExportedEntityRef, type SyncableTable} from './changeTracker';
import {buildEntityId, type FormaSyncEntityType, type FormaSyncJsonlRow} from './entityTypes';
import {getOrCreateDeviceId} from './deviceId';
import type {ExportChangesResult} from './exportChanges';

const SOURCE = 'mobile' as const;

function ref(table: SyncableTable, keyColumn: string, keyValue: string | number): ExportedEntityRef {
  return {table, keyColumn, keyValue};
}

/** Export all active local rows for first cloud baseline. */
export async function exportBaselineChanges(): Promise<ExportChangesResult> {
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

  for (const row of await loadActiveRows('food_entries')) {
    const id = row.id as number;
    const payload = JSON.parse(row.payload_json as string);
    jsonl.food_entries.push({
      id: buildEntityId('food_entries', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: {...payload, phase: row.phase as FoodPhase},
    });
    exportedRefs.push(ref('food_entries', 'id', id));
  }

  for (const row of await loadActiveRows('body_metrics')) {
    const id = row.id as number;
    jsonl.body_metrics.push({
      id: buildEntityId('body_metrics', SOURCE, id),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('body_metrics', 'id', id));
  }

  for (const row of await loadActiveRows('workouts')) {
    const id = row.id as number;
    jsonl.strength_workouts.push({
      id: buildEntityId('strength_workouts', SOURCE, id),
      server_id: (row.server_workout_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.sets_json as string),
    });
    exportedRefs.push(ref('workouts', 'id', id));
  }

  for (const row of await loadActiveRows('stretching_log')) {
    const id = row.id as number;
    jsonl.stretching_log.push({
      id: buildEntityId('stretching_log', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('stretching_log', 'id', id));
  }

  for (const row of await loadActiveRows('bracelet_calories_queue')) {
    const id = row.id as number;
    jsonl.bracelet_calories.push({
      id: buildEntityId('bracelet_calories', SOURCE, row.date as string),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: {date: row.date, total_calories: row.total_calories},
    });
    exportedRefs.push(ref('bracelet_calories_queue', 'id', id));
  }

  if (await isHealthConnectModuleEnabled()) {
    for (const row of await loadActiveRows('hc_day_metrics')) {
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
        deleted_at: null,
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

  for (const row of await loadActiveRows('cardio_workouts_cache')) {
    const id = row.id as number;
    jsonl.cardio_workouts.push({
      id: buildEntityId('cardio_workouts', SOURCE, id),
      server_id: id > 0 ? id : null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.workout_json as string),
    });
    exportedRefs.push(ref('cardio_workouts_cache', 'id', id));
  }

  for (const row of await loadActiveRows('food_products_local')) {
    const id = row.id as number;
    jsonl.food_products.push({
      id: buildEntityId('food_products', SOURCE, id),
      server_id: (row.server_id as number | null) ?? null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('food_products_local', 'id', id));
  }

  for (const row of await loadActiveRows('strength_presets_cache')) {
    const id = row.id as number;
    const payloadRaw = row.payload_json as string | undefined;
    const payload =
      payloadRaw && payloadRaw !== '{}' ? JSON.parse(payloadRaw) : {id, name: row.name};
    jsonl.strength_presets.push({
      id: buildEntityId('strength_presets', SOURCE, id),
      server_id: id > 0 ? id : null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload,
    });
    exportedRefs.push(ref('strength_presets_cache', 'id', id));
  }

  for (const row of await loadActiveRows('forma_sync_preferences')) {
    const key = row.pref_key as string;
    jsonl.user_preferences.push({
      id: buildEntityId('user_preferences', SOURCE, key),
      server_id: null,
      updated_at: row.updated_at as string,
      deleted_at: null,
      source: SOURCE,
      device_id: deviceId,
      payload: JSON.parse(row.payload_json as string),
    });
    exportedRefs.push(ref('forma_sync_preferences', 'pref_key', key));
  }

  const rowCount = Object.values(jsonl).reduce((sum, arr) => sum + arr.length, 0);
  return {jsonl, exportedRefs, rowCount};
}
