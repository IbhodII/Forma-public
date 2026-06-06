import {formaSyncManifestPath, formaSyncRootPath} from './formaSyncPaths';
import {needsBaselineUpload, localHasSyncableData} from './baseline';
import {countPendingFormaSyncChanges} from './pendingChanges';
import {getLastSeenRevision, getLastUploadAt} from './syncMeta';
import type {FormaSyncManifest} from './manifest';

export type FormaSyncDebugPlan = {
  client_type: string;
  db_path: string;
  current_user_id: number | null;
  yandex_uid: string | null;
  yandex_connected: boolean;
  cloud_path: string | null;
  manifest_exists: boolean;
  local_revision: number;
  remote_revision: number | null;
  pending_entities_count: number;
  baseline_required: boolean;
  local_has_data: boolean;
  package_path: string | null;
  package_size: number | null;
  upload_target: string | null;
  download_target: string | null;
};

export async function buildSyncPlan(options: {
  yandexUid: string | null;
  yandexConnected: boolean;
  remoteManifest: FormaSyncManifest | null;
}): Promise<FormaSyncDebugPlan> {
  const localRevision = await getLastSeenRevision();
  const pending = await countPendingFormaSyncChanges();
  const hasData = await localHasSyncableData();
  const baselineRequired = await needsBaselineUpload(options.remoteManifest);
  const uid = options.yandexUid;

  return {
    client_type: 'mobile',
    db_path: 'SQLite (app local)',
    current_user_id: null,
    yandex_uid: uid,
    yandex_connected: options.yandexConnected,
    cloud_path: uid ? formaSyncRootPath(uid) : null,
    manifest_exists: options.remoteManifest != null,
    local_revision: localRevision,
    remote_revision: options.remoteManifest?.revision ?? null,
    pending_entities_count: pending,
    baseline_required: baselineRequired,
    local_has_data: hasData,
    package_path: null,
    package_size: null,
    upload_target: uid ? `${formaSyncManifestPath(uid)} + packages/` : null,
    download_target: uid ? formaSyncManifestPath(uid) : null,
  };
}
