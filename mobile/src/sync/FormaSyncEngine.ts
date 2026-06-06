import {countUnresolvedConflicts} from '../database/conflictStore';
import {CloudSyncService} from '../services/CloudSyncService';
import {getStoredYandexUid} from '../mode/yandexIdentity';
import {runDownloadFlow} from './downloadFlow';
import {countPendingFormaSyncChanges} from './pendingChanges';
import {isFormaSyncTokenExpired} from './syncMeta';
import {
  getFormaSyncLastError,
  getLastDownloadAt,
  getLastSeenRevision,
  getLastUploadAt,
  setFormaSyncLastError,
} from './syncMeta';
import {isFormaSyncInFlight, withFormaSyncLock} from './syncState';
import {runUploadFlow} from './uploadFlow';
import {buildSyncPlan, type FormaSyncDebugPlan} from './syncPlan';
import {fetchRemoteManifest} from './yandexFormaSyncApi';

export type FormaSyncStatus = {
  yandexConnected: boolean;
  yandexUid: string | null;
  localRevision: number;
  remoteRevision: number | null;
  pendingChanges: number;
  conflictCount: number;
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastError: string | null;
  syncInFlight: boolean;
  tokenExpired?: boolean;
  baselineRequired?: boolean;
  debugPlan?: FormaSyncDebugPlan;
};

export type FormaSyncSyncResult = {
  uploaded: boolean;
  downloaded: boolean;
  message: string;
};

export async function getFormaSyncStatus(): Promise<FormaSyncStatus> {
  const token = await CloudSyncService.getToken('yandex');
  const yandexUid = await getStoredYandexUid();
  const localRevision = await getLastSeenRevision();
  let remoteRevision: number | null = null;
  let remote = null;

  if (token && yandexUid) {
    try {
      remote = await fetchRemoteManifest(yandexUid);
      remoteRevision = remote?.revision ?? null;
    } catch {
      remoteRevision = null;
    }
  }

  const debugPlan = await buildSyncPlan({
    yandexUid,
    yandexConnected: Boolean(token),
    remoteManifest: remote,
  });

  return {
    yandexConnected: Boolean(token),
    yandexUid,
    localRevision,
    remoteRevision,
    pendingChanges: await countPendingFormaSyncChanges(),
    conflictCount: await countUnresolvedConflicts(),
    lastUploadAt: await getLastUploadAt(),
    lastDownloadAt: await getLastDownloadAt(),
    lastError: await getFormaSyncLastError(),
    syncInFlight: isFormaSyncInFlight(),
    tokenExpired: await isFormaSyncTokenExpired(),
    baselineRequired: debugPlan.baseline_required,
    debugPlan,
  };
}

export async function syncFormaSync(options?: {forceUpload?: boolean}): Promise<FormaSyncSyncResult> {
  return withFormaSyncLock(async () => {
    const parts: string[] = [];
    let downloaded = false;
    let uploaded = false;

    try {
      const dl = await runDownloadFlow();
      if (dl.downloaded) {
        downloaded = true;
      }
      parts.push(dl.message);

      const pending = await countPendingFormaSyncChanges();
      const up = await runUploadFlow({force: options?.forceUpload});
      if (up.uploaded) {
        uploaded = true;
        parts.push(up.message);
      } else if (pending > 0 || options?.forceUpload) {
        parts.push(up.message);
      }

      return {
        uploaded,
        downloaded,
        message: parts.filter(Boolean).join('. ') || 'Синхронизация завершена',
      };
    } catch (e) {
      const {formatUserFacingError} = await import('../utils/userFacingError');
      const message = formatUserFacingError(e);
      await setFormaSyncLastError(message);
      throw new Error(message);
    }
  });
}

export async function uploadFormaSyncOnly(options?: {force?: boolean}): Promise<FormaSyncSyncResult> {
  return withFormaSyncLock(async () => {
    try {
      const up = await runUploadFlow({force: options?.force});
      return {uploaded: up.uploaded, downloaded: false, message: up.message};
    } catch (e) {
      const {formatUserFacingError} = await import('../utils/userFacingError');
      const message = formatUserFacingError(e);
      await setFormaSyncLastError(message);
      throw new Error(message);
    }
  });
}

export async function downloadFormaSyncOnly(): Promise<FormaSyncSyncResult> {
  return withFormaSyncLock(async () => {
    try {
      const dl = await runDownloadFlow();
      return {
        uploaded: false,
        downloaded: dl.downloaded,
        message: dl.message,
      };
    } catch (e) {
      const {formatUserFacingError} = await import('../utils/userFacingError');
      const message = formatUserFacingError(e);
      await setFormaSyncLastError(message);
      throw new Error(message);
    }
  });
}

export const FormaSyncEngine = {
  getStatus: getFormaSyncStatus,
  sync: syncFormaSync,
  uploadOnly: uploadFormaSyncOnly,
  downloadOnly: downloadFormaSyncOnly,
};
