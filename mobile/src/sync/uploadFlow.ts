import RNFS from 'react-native-fs';

import {isOnline} from '../services/network';
import {localHasSyncableData, needsBaselineUpload} from './baseline';
import {markExported} from './changeTracker';
import {getOrCreateDeviceId} from './deviceId';
import {formaSyncPackageRelativePath} from './formaSyncPaths';
import {nextRevision, type FormaSyncManifest} from './manifest';
import {buildFormaSyncPackage} from './packageBuilder';
import {countPendingFormaSyncChanges, nowIso} from './pendingChanges';
import {clearFormaSyncAuthFailure, recordFormaSyncAuthFailure} from './formaSyncAuth';
import {
  getLastSeenRevision,
  setExportWatermark,
  setFormaSyncLastError,
  setLastSeenRevision,
  setLastUploadAt,
} from './syncMeta';
import {
  fetchRemoteManifest,
  requireYandexUid,
  uploadFormaSyncPackage,
  uploadManifest,
} from './yandexFormaSyncApi';

export type UploadFlowResult = {
  uploaded: boolean;
  revision: number | null;
  message: string;
};

export async function runUploadFlow(options?: {force?: boolean}): Promise<UploadFlowResult> {
  if (!(await isOnline())) {
    const msg = 'Нет сети — отправка отложена';
    await setFormaSyncLastError(msg);
    return {uploaded: false, revision: null, message: msg};
  }

  const {CloudSyncService} = await import('../services/CloudSyncService');
  const yandexUid = await requireYandexUid();
  const token = await CloudSyncService.getToken('yandex');
  if (!token) {
    throw new Error('Подключите Яндекс.Диск в настройках облака');
  }

  try {
    const currentLastSeen = await getLastSeenRevision();
    const remoteManifest = await fetchRemoteManifest(yandexUid);
    const remoteRev = remoteManifest?.revision ?? 0;
    const baseline = await needsBaselineUpload(remoteManifest);

    let built;
    if (baseline) {
      built = await buildFormaSyncPackage(0, {baseline: true});
      if (!built) {
        const hasData = await localHasSyncableData();
        return {
          uploaded: false,
          revision: null,
          message: hasData
            ? 'Первичная отправка не удалась — повторите «Отправить» или проверьте подключение к Диску'
            : 'Нет локальных данных для отправки',
        };
      }
    } else {
      const pending = await countPendingFormaSyncChanges();
      if (pending === 0 && !options?.force) {
        return {uploaded: false, revision: null, message: 'Нет локальных изменений для отправки'};
      }
      built = await buildFormaSyncPackage(currentLastSeen);
      if (!built) {
        const hasData = await localHasSyncableData();
        if (!hasData) {
          return {uploaded: false, revision: null, message: 'Нет локальных данных для отправки'};
        }
        return {
          uploaded: false,
          revision: null,
          message: 'Нет новых изменений с прошлой синхронизации',
        };
      }
    }

    const newRevision = baseline
      ? remoteRev < 1
        ? 1
        : nextRevision(currentLastSeen, remoteRev)
      : nextRevision(currentLastSeen, remoteRev);
    const deviceId = await getOrCreateDeviceId();
    const manifest: FormaSyncManifest = {
      schema_version: 1,
      revision: newRevision,
      updated_at: nowIso(),
      source_device: 'mobile',
      source_device_id: deviceId,
      package: formaSyncPackageRelativePath(newRevision, 'mobile'),
      package_sha256: built.sha256,
      entities_summary: built.entitiesSummary,
    };

    await uploadFormaSyncPackage(yandexUid, newRevision, built.zipPath);
    await uploadManifest(yandexUid, manifest, remoteManifest);
    await markExported(built.exportedRefs, newRevision);
    await setLastSeenRevision(newRevision);
    await setLastUploadAt(nowIso());
    await setExportWatermark(nowIso());
    await clearFormaSyncAuthFailure();
    await RNFS.unlink(built.zipPath).catch(() => undefined);

    const prefix = baseline ? 'Первичная отправка' : 'Отправлено';
    return {
      uploaded: true,
      revision: newRevision,
      message: `${prefix} rev ${newRevision} (${built.rowCount} записей)`,
    };
  } catch (e) {
    if (await recordFormaSyncAuthFailure(e)) {
      return {
        uploaded: false,
        revision: null,
        message: 'Токен Яндекс.Диска истёк — переподключите облако',
      };
    }
    const {formatUserFacingError} = await import('../utils/userFacingError');
    const msg = formatUserFacingError(e);
    await setFormaSyncLastError(msg);
    throw new Error(msg);
  }
}
