import NetInfo from '@react-native-community/netinfo';

import {getStoredOperatingMode} from '../auth/session';
import {setMeta} from '../database/index';
import {countUnresolvedConflicts} from '../database/conflictStore';
import {isOnline} from '../services/network';
import {runFullSync, legacySyncInFlight} from '../services/SyncService';
import {FormaSyncEngine} from './FormaSyncEngine';
import {canRunAutoSync, isManualSyncOnly} from './syncSettings';
import {countPendingFormaSyncChanges} from './pendingChanges';
import {
  enqueueSyncJob,
  getDueSyncJobs,
  markSyncJobDone,
  markSyncJobFailed,
  markSyncJobRunning,
  pruneDoneSyncJobs,
  resetSyncJobForRetry,
  getSyncQueueSummary,
  type SyncQueueKind,
} from './syncQueue';
import {isFormaSyncInFlight} from './syncState';
import {getFormaSyncLastError, setFormaSyncLastError} from './syncMeta';

const DEBOUNCE_MS = 3000;
const SUCCESS_BANNER_MS = 3000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let processInFlight = false;

export type BannerSyncPhase =
  | 'idle'
  | 'offline'
  | 'pending'
  | 'syncing'
  | 'completed'
  | 'conflicts'
  | 'failed';

type BannerListener = (state: BannerState) => void;

export type BannerState = {
  phase: BannerSyncPhase;
  pendingCount: number;
  conflictCount: number;
  message: string;
};

const bannerListeners = new Set<BannerListener>();
let bannerState: BannerState = {
  phase: 'idle',
  pendingCount: 0,
  conflictCount: 0,
  message: '',
};

function emitBanner(next: Partial<BannerState>): void {
  bannerState = {...bannerState, ...next};
  bannerListeners.forEach(l => l(bannerState));
}

export function subscribeBannerState(listener: BannerListener): () => void {
  bannerListeners.add(listener);
  listener(bannerState);
  return () => bannerListeners.delete(listener);
}

export function getBannerState(): BannerState {
  return bannerState;
}

async function resolveSyncKind(): Promise<SyncQueueKind> {
  const mode = await getStoredOperatingMode();
  return mode === 'legacy_api' ? 'legacy_full' : 'forma_sync';
}

async function isAutonomousMode(): Promise<boolean> {
  return (await getStoredOperatingMode()) === 'autonomous';
}

function truncateError(msg: string, max = 80): string {
  const t = msg.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

async function lastSyncErrorMessage(): Promise<string | null> {
  const queueSummary = await getSyncQueueSummary();
  if (queueSummary.lastError?.trim()) {
    return queueSummary.lastError.trim();
  }
  return getFormaSyncLastError();
}

async function refreshBannerCounts(): Promise<void> {
  try {
    if (await isAutonomousMode()) {
      emitBanner({
        phase: 'idle',
        pendingCount: 0,
        conflictCount: 0,
        message: '',
      });
      return;
    }
    const online = await isOnline();
    const pendingCount = await countPendingFormaSyncChanges();
    const conflictCount = await countUnresolvedConflicts();
    const queueSummary = await getSyncQueueSummary();
    if (!online) {
      emitBanner({
        phase: 'offline',
        pendingCount,
        conflictCount,
        message: 'Офлайн — данные на устройстве',
      });
      return;
    }
    if (isFormaSyncInFlight()) {
      emitBanner({
        phase: 'syncing',
        pendingCount,
        conflictCount,
        message: 'Синхронизация уже выполняется…',
      });
      return;
    }
    if (queueSummary.failedCount > 0) {
      const detail = await lastSyncErrorMessage();
      emitBanner({
        phase: 'failed',
        pendingCount,
        conflictCount,
        message: detail
          ? `Синхронизация не удалась: ${truncateError(detail)}`
          : 'Синхронизация не удалась — повтор позже',
      });
      return;
    }
    if (conflictCount > 0) {
      emitBanner({
        phase: 'conflicts',
        pendingCount,
        conflictCount,
        message: `Конфликты (${conflictCount})`,
      });
      return;
    }
    if (processInFlight || legacySyncInFlight() || isFormaSyncInFlight()) {
      emitBanner({
        phase: 'syncing',
        pendingCount,
        conflictCount,
        message: 'Синхронизация…',
      });
      return;
    }
    if (pendingCount > 0) {
      emitBanner({
        phase: 'pending',
        pendingCount,
        conflictCount,
        message: `Ожидает синхронизации (${pendingCount})`,
      });
      return;
    }
    emitBanner({phase: 'idle', pendingCount: 0, conflictCount: 0, message: ''});
  } catch (e) {
    const {formatUserFacingError} = await import('../utils/userFacingError');
    const msg = formatUserFacingError(e);
    await setFormaSyncLastError(msg);
    emitBanner({
      phase: 'failed',
      pendingCount: 0,
      conflictCount: 0,
      message: truncateError(msg),
    });
  }
}

async function passesSyncGates(manual = false): Promise<boolean> {
  if (!manual && (await isManualSyncOnly())) {
    return false;
  }
  if (!(await isOnline())) {
    return false;
  }
  if (!manual && !(await canRunAutoSync())) {
    return false;
  }
  if (await isWifiOnlyEnabled()) {
    const net = await NetInfo.fetch();
    if (net.type !== 'wifi' && net.type !== 'ethernet' && net.type !== 'unknown') {
      return false;
    }
  }
  if (await isChargingOnlyEnabled()) {
    const {isBatteryOkForSync} = await import('./formaSyncBackgroundTask');
    const ok = await isBatteryOkForSync();
    if (!ok) {
      return false;
    }
  }
  return true;
}

async function isWifiOnlyEnabled(): Promise<boolean> {
  const {isWifiOnlySyncEnabled} = await import('./syncSettings');
  return isWifiOnlySyncEnabled();
}

async function isChargingOnlyEnabled(): Promise<boolean> {
  const {isChargingOnlySyncEnabled} = await import('./syncSettings');
  return isChargingOnlySyncEnabled();
}

async function runJob(kind: SyncQueueKind): Promise<{ok: boolean; message: string}> {
  if (kind === 'legacy_full') {
    const result = await runFullSync();
    return {ok: result.ok, message: result.message};
  }
  try {
    const result = await FormaSyncEngine.sync();
    await setFormaSyncLastError(null);
    return {ok: true, message: result.message};
  } catch (e) {
    const {formatUserFacingError} = await import('../utils/userFacingError');
    const msg = formatUserFacingError(e);
    await setFormaSyncLastError(msg);
    return {ok: false, message: msg};
  }
}

export type ManualSyncResult = {ok: boolean; message?: string};

export async function processQueue(options?: {manual?: boolean}): Promise<ManualSyncResult> {
  if (await isAutonomousMode()) {
    await refreshBannerCounts();
    return {ok: true, message: 'Локальный режим: облачная синхронизация отключена'};
  }
  if (processInFlight) {
    return {ok: true, message: 'Синхронизация уже выполняется'};
  }
  try {
    await refreshBannerCounts();
  } catch {
    // refreshBannerCounts handles its own banner state
  }
  if (!(await passesSyncGates(options?.manual))) {
    const detail = await lastSyncErrorMessage();
    return {
      ok: false,
      message: detail ?? 'Синхронизация недоступна (офлайн или настройки)',
    };
  }
  if (legacySyncInFlight() || isFormaSyncInFlight()) {
    return {ok: true, message: 'Синхронизация уже выполняется'};
  }

  processInFlight = true;
  emitBanner({phase: 'syncing', message: 'Синхронизация…'});
  let lastResult: ManualSyncResult = {ok: true};
  try {
    const jobs = await getDueSyncJobs();
    for (const job of jobs) {
      await markSyncJobRunning(job.id);
      const result = await runJob(job.kind);
      lastResult = {ok: result.ok, message: result.message};
      if (result.ok) {
        await markSyncJobDone(job.id);
        await setMeta('sync:last_success_at', new Date().toISOString());
        emitBanner({phase: 'completed', message: 'Синхронизировано'});
        setTimeout(() => void refreshBannerCounts(), SUCCESS_BANNER_MS);
      } else {
        await markSyncJobFailed(job.id, result.message, job.attempt_count + 1);
        await setFormaSyncLastError(result.message);
        emitBanner({
          phase: 'failed',
          message: `Синхронизация не удалась: ${truncateError(result.message)}`,
        });
      }
    }
    await pruneDoneSyncJobs();
    return lastResult;
  } catch (e) {
    const {formatUserFacingError} = await import('../utils/userFacingError');
    const msg = formatUserFacingError(e);
    await setFormaSyncLastError(msg);
    emitBanner({phase: 'failed', message: truncateError(msg)});
    return {ok: false, message: msg};
  } finally {
    processInFlight = false;
    try {
      await refreshBannerCounts();
    } catch {
      // ignore secondary refresh failures
    }
  }
}

export function notifyLocalChange(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    void (async () => {
      if (await isAutonomousMode()) {
        await refreshBannerCounts();
        return;
      }
      const kind = await resolveSyncKind();
      await enqueueSyncJob(kind);
      if (await isManualSyncOnly()) {
        await refreshBannerCounts();
        return;
      }
      if (await canRunAutoSync()) {
        await processQueue();
      } else {
        await refreshBannerCounts();
      }
    })();
  }, DEBOUNCE_MS);
}

export async function scheduleSyncJob(): Promise<void> {
  if (await isAutonomousMode()) {
    await refreshBannerCounts();
    return;
  }
  const kind = await resolveSyncKind();
  await enqueueSyncJob(kind);
  notifyLocalChange();
}

export async function manualSyncNow(): Promise<ManualSyncResult> {
  if (await isAutonomousMode()) {
    await refreshBannerCounts();
    return {ok: true, message: 'Локальный режим: облачная синхронизация отключена'};
  }
  const kind = await resolveSyncKind();
  await resetSyncJobForRetry(kind);
  return processQueue({manual: true});
}

export async function onNetworkReconnect(): Promise<void> {
  if (await isAutonomousMode()) {
    await refreshBannerCounts();
    return;
  }
  if (await isManualSyncOnly()) {
    return;
  }
  if (!(await canRunAutoSync())) {
    await refreshBannerCounts();
    return;
  }
  const kind = await resolveSyncKind();
  await enqueueSyncJob(kind);
  await processQueue();
}

export async function onAppForeground(): Promise<void> {
  await refreshBannerCounts();
  if (await isAutonomousMode()) {
    return;
  }
  if (await isManualSyncOnly()) {
    return;
  }
  const jobs = await getDueSyncJobs();
  if (jobs.length > 0 && (await canRunAutoSync())) {
    await processQueue();
  }
}

// Re-export for background task
export {refreshBannerCounts};
