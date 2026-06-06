jest.mock('react-native', () => ({
  Platform: {OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default},
}));

jest.mock('../hcBackgroundTask', () => ({
  HC_COLLECTOR_TASK: 'hc-background-collector',
  BACKGROUND_INTERVAL_MIN: 60,
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn().mockResolvedValue(2),
  BackgroundTaskStatus: {Restricted: 1, Available: 2},
}));

jest.mock('expo-task-manager', () => ({
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
  defineTask: jest.fn(),
}));

jest.mock('../hcModuleSettings', () => ({
  isHealthConnectModuleEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('../hcCollectorSettings', () => ({
  isHcBackgroundCollectorEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../auth/session', () => ({
  getStoredOperatingMode: jest.fn().mockResolvedValue('autonomous'),
}));

jest.mock('../../mode/operatingMode', () => ({
  isLocalFirstMode: jest.fn().mockReturnValue(true),
}));

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import {getStoredOperatingMode} from '../../auth/session';
import {isHealthConnectModuleEnabled} from '../hcModuleSettings';
import {isHcBackgroundCollectorEnabled} from '../hcCollectorSettings';
import {
  canScheduleHcBackgroundCollector,
  cancelHcBackgroundCollector,
  scheduleHcBackgroundCollector,
} from '../hcBackgroundScheduler';
import {HC_COLLECTOR_TASK} from '../hcBackgroundTask';

describe('hcBackgroundScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isHealthConnectModuleEnabled as jest.Mock).mockResolvedValue(true);
    (isHcBackgroundCollectorEnabled as jest.Mock).mockResolvedValue(true);
    (getStoredOperatingMode as jest.Mock).mockResolvedValue('autonomous');
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
  });

  it('schedules when all conditions met', async () => {
    expect(await canScheduleHcBackgroundCollector()).toBe(true);
    await scheduleHcBackgroundCollector();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(HC_COLLECTOR_TASK, {
      minimumInterval: 60,
    });
  });

  it('does not schedule when module disabled', async () => {
    (isHealthConnectModuleEnabled as jest.Mock).mockResolvedValue(false);
    expect(await canScheduleHcBackgroundCollector()).toBe(false);
    await scheduleHcBackgroundCollector();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('cancels registered task', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
    await cancelHcBackgroundCollector();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(HC_COLLECTOR_TASK);
  });
});
