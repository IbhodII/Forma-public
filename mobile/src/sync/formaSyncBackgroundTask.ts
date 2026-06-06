import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {CloudSyncService} from '../services/CloudSyncService';
import {isOnline} from '../services/network';
import {isFormaSyncAutoEnabled, setFormaSyncAutoLastRunAt} from './formaSyncSettings';
import {nowIso} from './pendingChanges';
import {isBackgroundSyncEnabled, isManualSyncOnly} from './syncSettings';
import {enqueueSyncJob, processQueue} from './syncOrchestrator';

export const FORMA_SYNC_TASK = 'forma-sync-background';
export const FORMA_SYNC_INTERVAL_MIN = 240;

export async function isBatteryOkForSync(): Promise<boolean> {
  try {
    const Battery = await import('expo-battery');
    const level = await Battery.getBatteryLevelAsync();
    const state = await Battery.getBatteryStateAsync();
    const charging =
      state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
    if (level >= 0 && level < 0.2 && !charging) {
      return false;
    }
  } catch {
    // Battery API unavailable — allow sync
  }
  return true;
}

TaskManager.defineTask(FORMA_SYNC_TASK, async () => {
  try {
    if (!(await isFormaSyncAutoEnabled()) || (await isManualSyncOnly()) || !(await isBackgroundSyncEnabled())) {
      try {
        await BackgroundTask.unregisterTaskAsync(FORMA_SYNC_TASK);
      } catch {
        // ignore
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const token = await CloudSyncService.getToken('yandex');
    if (!token || !(await isOnline()) || !(await isBatteryOkForSync())) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await enqueueSyncJob('forma_sync');
    await processQueue();
    await setFormaSyncAutoLastRunAt(nowIso());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
