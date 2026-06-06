import RNFS from 'react-native-fs';

import {isOnline} from '../services/network';
import {applyFormaSyncPackage} from './packageApplier';
import {syncAfterPackageApply} from './syncAfterPackageApply';
import {nowIso} from './pendingChanges';
import {clearFormaSyncAuthFailure, recordFormaSyncAuthFailure} from './formaSyncAuth';
import {
  getLastSeenRevision,
  setFormaSyncLastError,
  setLastDownloadAt,
  setLastSeenRevision,
} from './syncMeta';
import {
  downloadFormaSyncPackage,
  fetchRemoteManifestDetailed,
  requireYandexUid,
} from './yandexFormaSyncApi';

export type DownloadFlowResult = {
  downloaded: boolean;
  applied: number;
  conflicts: number;
  message: string;
};

export async function runDownloadFlow(): Promise<DownloadFlowResult> {
  if (!(await isOnline())) {
    const msg = 'Нет сети — загрузка отложена';
    await setFormaSyncLastError(msg);
    return {downloaded: false, applied: 0, conflicts: 0, message: msg};
  }

  const {CloudSyncService} = await import('../services/CloudSyncService');
  const yandexUid = await requireYandexUid();
  const token = await CloudSyncService.getToken('yandex');
  if (!token) {
    throw new Error('Подключите Яндекс.Диск в настройках облака');
  }

  try {
    const localRevision = await getLastSeenRevision();
    const remote = await fetchRemoteManifestDetailed(yandexUid);

    if (remote.status === 'missing') {
      const msg = 'Файл manifest.json отсутствует в облаке';
      await setFormaSyncLastError(msg);
      return {downloaded: false, applied: 0, conflicts: 0, message: msg};
    }
    if (remote.status === 'invalid') {
      const msg = 'manifest.json повреждён или неподдерживаемой версии';
      await setFormaSyncLastError(msg);
      return {downloaded: false, applied: 0, conflicts: 0, message: msg};
    }

    const remoteManifest = remote.manifest;
    if (remoteManifest.revision <= localRevision) {
      return {
        downloaded: false,
        applied: 0,
        conflicts: 0,
        message: `Облако rev ${remoteManifest.revision} — актуально`,
      };
    }

    const zipDest = `${RNFS.CachesDirectoryPath}/forma-sync-dl-${Date.now()}.zip`;
    await downloadFormaSyncPackage(yandexUid, remoteManifest, zipDest);
    const result = await applyFormaSyncPackage(
      zipDest,
      remoteManifest.package_sha256,
      remoteManifest.revision,
    );
    await RNFS.unlink(zipDest).catch(() => undefined);

    if (result.error) {
      await setFormaSyncLastError(result.error);
      return {
        downloaded: false,
        applied: result.applied,
        conflicts: result.conflicts,
        message: result.error,
      };
    }

    if (!result.skipped) {
      if (result.applied > 0) {
        await syncAfterPackageApply();
      }
      await setLastSeenRevision(remoteManifest.revision);
      await setLastDownloadAt(nowIso());
      await clearFormaSyncAuthFailure();
      return {
        downloaded: true,
        applied: result.applied,
        conflicts: result.conflicts,
        message:
          `Загружено rev ${remoteManifest.revision}: ${result.applied} записей` +
          (result.conflicts ? `, конфликтов: ${result.conflicts}` : ''),
      };
    }

    await setLastSeenRevision(remoteManifest.revision);
    return {
      downloaded: false,
      applied: 0,
      conflicts: 0,
      message: `Пакет rev ${remoteManifest.revision} пропущен (собственное устройство)`,
    };
  } catch (e) {
    if (await recordFormaSyncAuthFailure(e)) {
      return {
        downloaded: false,
        applied: 0,
        conflicts: 0,
        message: 'Токен Яндекс.Диска истёк — переподключите облако',
      };
    }
    const {formatUserFacingError} = await import('../utils/userFacingError');
    const msg = formatUserFacingError(e);
    await setFormaSyncLastError(msg);
    throw new Error(msg);
  }
}
