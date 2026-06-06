import {Platform} from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {getStoredOperatingMode} from '../auth/session';
import {logStartup} from '../debug/startupLog';
import {CloudSyncService} from '../services/CloudSyncService';
import {isLocalFirstMode} from '../mode/operatingMode';
import {
  FORMA_SYNC_INTERVAL_MIN,
  FORMA_SYNC_TASK,
} from './formaSyncBackgroundTask';
import {isFormaSyncAutoEnabled} from './formaSyncSettings';

export async function canScheduleFormaSyncBackground(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (!(await isFormaSyncAutoEnabled())) {
    return false;
  }
  const token = await CloudSyncService.getToken('yandex');
  if (!token) {
    logStartup('sync', 'cloud_sync_skipped no yandex token');
    return false;
  }
  const mode = await getStoredOperatingMode();
  if (mode === 'local_hc_test' || mode === 'legacy_api') {
    return false;
  }
  if (mode !== 'autonomous' && mode !== 'cloud' && !isLocalFirstMode({operatingMode: mode})) {
    return false;
  }
  return true;
}

export async function scheduleFormaSyncBackground(): Promise<void> {
  if (!(await canScheduleFormaSyncBackground())) {
    await cancelFormaSyncBackground();
    return;
  }
  const registered = await TaskManager.isTaskRegisteredAsync(FORMA_SYNC_TASK);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(FORMA_SYNC_TASK, {
      minimumInterval: FORMA_SYNC_INTERVAL_MIN,
    });
  }
}

export async function cancelFormaSyncBackground(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(FORMA_SYNC_TASK);
  if (registered) {
    await BackgroundTask.unregisterTaskAsync(FORMA_SYNC_TASK);
  }
}

export async function refreshFormaSyncBackgroundSchedule(): Promise<void> {
  if (await canScheduleFormaSyncBackground()) {
    await scheduleFormaSyncBackground();
  } else {
    await cancelFormaSyncBackground();
  }
}

export async function getFormaSyncBackgroundTaskStatus(): Promise<BackgroundTask.BackgroundTaskStatus | null> {
  try {
    return await BackgroundTask.getStatusAsync();
  } catch {
    return null;
  }
}
