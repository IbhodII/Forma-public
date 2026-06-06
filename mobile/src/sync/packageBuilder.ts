import RNFS from 'react-native-fs';

import {zip} from 'react-native-zip-archive';



import {initDB, nowIso} from '../database/index';

import {getOrCreateDeviceId} from './deviceId';

import {exportBaselineChanges} from './exportBaselineChanges';
import {exportPendingChanges} from './exportChanges';

import type {FormaSyncEntityType, FormaSyncJsonlRow} from './entityTypes';

import type {FormaSyncEntitiesSummary} from './manifest';

import {sha256HexFile} from './sha256File';



export type PackageMeta = {

  schema_version: 1;

  device_id: string;

  source: 'mobile';

  created_at: string;

  base_revision: number;

};



export type BuildPackageResult = {

  zipPath: string;

  sha256: string;

  entitiesSummary: FormaSyncEntitiesSummary;

  rowCount: number;

  exportedRefs: import('./changeTracker').ExportedEntityRef[];

};



function rowsToJsonl(rows: FormaSyncJsonlRow[]): string {

  if (rows.length === 0) {

    return '';

  }

  return rows.map(r => JSON.stringify(r)).join('\n') + '\n';

}



export async function buildFormaSyncPackage(
  baseRevision: number,
  options?: {baseline?: boolean},
): Promise<BuildPackageResult | null> {
  await initDB();

  const exported = options?.baseline
    ? await exportBaselineChanges()
    : await exportPendingChanges();

  if (exported.rowCount === 0) {
    return null;
  }



  const deviceId = await getOrCreateDeviceId();

  const entitiesSummary: FormaSyncEntitiesSummary = {

    food_entries: exported.jsonl.food_entries.length,

    body_metrics: exported.jsonl.body_metrics.length,

    strength_workouts: exported.jsonl.strength_workouts.length,

    stretching_log: exported.jsonl.stretching_log.length,

    bracelet_calories: exported.jsonl.bracelet_calories.length,

    hc_days: exported.jsonl.hc_days.length,

    cardio_workouts: exported.jsonl.cardio_workouts.length,

    food_products: exported.jsonl.food_products.length,

    strength_presets: exported.jsonl.strength_presets.length,

    user_preferences: exported.jsonl.user_preferences.length,

  };



  const dir = `${RNFS.CachesDirectoryPath}/forma-sync-build-${Date.now()}`;

  const changesDir = `${dir}/changes`;

  await RNFS.mkdir(dir);

  await RNFS.mkdir(changesDir);



  const meta: PackageMeta = {

    schema_version: 1,

    device_id: deviceId,

    source: 'mobile',

    created_at: nowIso(),

    base_revision: baseRevision,

  };

  await RNFS.writeFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2), 'utf8');



  for (const [entity, rows] of Object.entries(exported.jsonl) as [FormaSyncEntityType, FormaSyncJsonlRow[]][]) {

    if (rows.length > 0) {

      await RNFS.writeFile(`${changesDir}/${entity}.jsonl`, rowsToJsonl(rows), 'utf8');

    }

  }



  const zipPath = `${RNFS.CachesDirectoryPath}/forma-sync-pkg-${Date.now()}.zip`;

  await zip(dir, zipPath);

  const sha256 = await sha256HexFile(zipPath);

  await RNFS.unlink(dir).catch(() => undefined);



  return {

    zipPath,

    sha256,

    entitiesSummary,

    rowCount: exported.rowCount,

    exportedRefs: exported.exportedRefs,

  };

}


