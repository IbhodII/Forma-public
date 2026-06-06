import {executeSql, initDB} from '../database/index';
import type {FormaSyncManifest} from './manifest';
import {getLastSeenRevision, getLastUploadAt} from './syncMeta';

export async function localHasSyncableData(): Promise<boolean> {
  await initDB();
  const tables = [
    'food_entries',
    'body_metrics',
    'workouts',
    'stretching_log',
    'bracelet_calories_queue',
    'cardio_workouts_cache',
    'food_products_local',
    'strength_presets_cache',
  ];
  for (const table of tables) {
    const rs = await executeSql(
      `SELECT 1 FROM ${table} WHERE (deleted_at IS NULL OR deleted_at = '') LIMIT 1`,
    );
    if (rs.rows.length > 0) {
      return true;
    }
  }
  const prefs = await executeSql('SELECT 1 FROM forma_sync_preferences LIMIT 1');
  return prefs.rows.length > 0;
}

export async function needsBaselineUpload(
  remoteManifest: FormaSyncManifest | null,
): Promise<boolean> {
  if (remoteManifest != null) {
    return false;
  }
  const hasData = await localHasSyncableData();
  if (!hasData) {
    return false;
  }
  const localRevision = await getLastSeenRevision();
  if (localRevision > 0) {
    return false;
  }
  const lastUpload = await getLastUploadAt();
  if (lastUpload) {
    return false;
  }
  return true;
}
