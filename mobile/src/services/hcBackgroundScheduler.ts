import {Platform} from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {getStoredOperatingMode} from '../auth/session';
import {isLocalFirstMode} from '../mode/operatingMode';
import {isHealthConnectModuleEnabled} from './hcModuleSettings';
import {isHcBackgroundCollectorEnabled} from './hcCollectorSettings';
import {BACKGROUND_INTERVAL_MIN, HC_COLLECTOR_TASK} from './hcBackgroundTask';

export async function canScheduleHcBackgroundCollector(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (!(await isHealthConnectModuleEnabled())) {
    return false;
  }
  if (!(await isHcBackgroundCollectorEnabled())) {
    return false;
  }
  const mode = await getStoredOperatingMode();
  if (mode === 'local_hc_test') {
    return false;
  }
  if (mode !== 'legacy_api' && !isLocalFirstMode({operatingMode: mode})) {
    return false;
  }
  return true;
}

export async function scheduleHcBackgroundCollector(): Promise<void> {
  if (!(await canScheduleHcBackgroundCollector())) {
    await cancelHcBackgroundCollector();
    return;
  }
  const registered = await TaskManager.isTaskRegisteredAsync(HC_COLLECTOR_TASK);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(HC_COLLECTOR_TASK, {
      minimumInterval: BACKGROUND_INTERVAL_MIN,
    });
  }
}

export async function cancelHcBackgroundCollector(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(HC_COLLECTOR_TASK);
  if (registered) {
    await BackgroundTask.unregisterTaskAsync(HC_COLLECTOR_TASK);
  }
}

export async function refreshHcBackgroundSchedule(): Promise<void> {
  if (await canScheduleHcBackgroundCollector()) {
    await scheduleHcBackgroundCollector();
  } else {
    await cancelHcBackgroundCollector();
  }
}

export async function getHcBackgroundTaskStatus(): Promise<BackgroundTask.BackgroundTaskStatus | null> {
  try {
    return await BackgroundTask.getStatusAsync();
  } catch {
    return null;
  }
}
