import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {initDB} from '../database/index';
import {checkAvailability, ensureHealthConnectReady} from './HealthConnectService';
import {isHealthConnectModuleEnabled} from './hcModuleSettings';
import {
  isHcBackgroundCollectorEnabled,
  recordHcBackgroundRun,
} from './hcCollectorSettings';
import {runHealthConnectBackgroundCollect} from './healthConnectSync';

export const HC_COLLECTOR_TASK = 'hc-background-collector';
export const BACKGROUND_INTERVAL_MIN = 60;

TaskManager.defineTask(HC_COLLECTOR_TASK, async () => {
  try {
    await initDB();
    if (!(await isHealthConnectModuleEnabled()) || !(await isHcBackgroundCollectorEnabled())) {
      try {
        await BackgroundTask.unregisterTaskAsync(HC_COLLECTOR_TASK);
      } catch {
        // ignore
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const available = await checkAvailability();
    if (!available) {
      await recordHcBackgroundRun({
        status: 'unavailable',
        recordsFound: 0,
        recordsSaved: 0,
        error: 'Health Connect недоступен',
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const ready = await ensureHealthConnectReady({requestPermissions: false});
    if (!ready) {
      await recordHcBackgroundRun({
        status: 'permissions',
        recordsFound: 0,
        recordsSaved: 0,
        error: 'Нужны разрешения Health Connect',
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await runHealthConnectBackgroundCollect();
    await recordHcBackgroundRun({
      status: result.status,
      recordsFound: result.recordsFound,
      recordsSaved: result.recordsSaved,
      error: result.error,
    });

    return result.ok
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (err) {
    await recordHcBackgroundRun({
      status: 'error',
      recordsFound: 0,
      recordsSaved: 0,
      error: err instanceof Error ? err.message : 'Background collect failed',
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
