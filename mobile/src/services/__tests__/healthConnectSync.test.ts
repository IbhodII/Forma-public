jest.mock('react-native', () => ({
  Platform: {OS: 'android'},
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../../auth/session', () => ({
  getStoredOperatingMode: jest.fn(),
}));

jest.mock('../hcModuleSettings', () => ({
  isHealthConnectModuleEnabled: jest.fn(),
  setHcLastLocalReadAt: jest.fn(),
  getHcLastLocalReadAt: jest.fn(),
}));

jest.mock('../../database/hcStore', () => ({
  startSyncRun: jest.fn().mockResolvedValue(1),
  finishSyncRun: jest.fn(),
  upsertDayMetricsBatch: jest.fn().mockResolvedValue(2),
}));

jest.mock('../../database/hcRecordStore', () => ({
  upsertHcRecords: jest.fn().mockResolvedValue({found: 1, saved: 1}),
  rebuildDayRollupsForDates: jest.fn().mockResolvedValue(1),
}));

jest.mock('../hcCollectorSettings', () => ({
  getEnabledHcDataTypes: jest.fn().mockResolvedValue(new Set(['steps', 'sleep', 'heart_rate', 'calories', 'workouts'])),
  getInitialSyncDays: jest.fn().mockResolvedValue(7),
}));

jest.mock('../HealthConnectService', () => ({
  checkAvailability: jest.fn().mockResolvedValue(true),
  ensureHealthConnectReady: jest.fn(),
  collectHealthDataForRangeWithProviders: jest.fn(),
}));

jest.mock('../healthConnectAudit', () => ({
  buildMobileAuditSnapshot: jest.fn().mockResolvedValue({raw_summary: []}),
  getDeviceLabel: jest.fn().mockReturnValue('test-device'),
}));

jest.mock('../healthConnectSyncDebug', () => ({
  patchSyncDebugState: jest.fn(),
  persistSyncDebugError: jest.fn(),
  maskUserId: jest.fn(),
}));

jest.mock('../../api/ping', () => ({
  pingFirstAvailable: jest.fn(),
}));

jest.mock('../../config/apiBase', () => ({
  getApiBaseUrl: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getUserId: jest.fn(),
  apiFetch: jest.fn(),
}));

jest.mock('../../api/url', () => ({
  buildApiUrl: jest.fn((base: string, path: string) => `${base}${path}`),
  HC_SYNC_PATH: '/api/sync/health-connect',
}));

import {getStoredOperatingMode} from '../../auth/session';
import {getApiBaseUrl} from '../../config/apiBase';
import {pingFirstAvailable} from '../../api/ping';
import {getUserId, apiFetch} from '../../api/client';
import {rebuildDayRollupsForDates} from '../../database/hcRecordStore';
import {
  checkAvailability,
  ensureHealthConnectReady,
  collectHealthDataForRangeWithProviders,
} from '../HealthConnectService';
import {isHealthConnectModuleEnabled, getHcLastLocalReadAt} from '../hcModuleSettings';
import {
  runHealthConnectBackgroundCollect,
  runHealthConnectLocalRead,
  runHealthConnectSync,
} from '../healthConnectSync';

const sampleItems = [{date: '2026-05-30', steps: 1000}];

describe('healthConnectSync routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isHealthConnectModuleEnabled as jest.Mock).mockResolvedValue(true);
    (ensureHealthConnectReady as jest.Mock).mockResolvedValue(true);
    (collectHealthDataForRangeWithProviders as jest.Mock).mockResolvedValue({
      days: sampleItems,
      providersByDay: new Map(),
      recordCounts: {steps: 1, days: 1},
      records: [],
    });
    (getHcLastLocalReadAt as jest.Mock).mockResolvedValue(null);
  });

  it('background collect never POSTs', async () => {
    const result = await runHealthConnectBackgroundCollect();
    expect(result.ok).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('skips when module disabled', async () => {
    (isHealthConnectModuleEnabled as jest.Mock).mockResolvedValue(false);
    const result = await runHealthConnectLocalRead();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('выключен');
    expect(collectHealthDataForRangeWithProviders).not.toHaveBeenCalled();
  });

  it('runs local read in autonomous mode without POST', async () => {
    (getStoredOperatingMode as jest.Mock).mockResolvedValue('autonomous');
    const result = await runHealthConnectSync();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('автономном');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('preserves imported HC days in local storage (smoke)', async () => {
    const importedDays = [
      {
        date: '2026-05-30',
        steps: 9123,
        active_calories: 512,
        total_calories: 2244,
        sleep: {
          start_time: '2026-05-29T22:10:00.000Z',
          end_time: '2026-05-30T06:40:00.000Z',
          duration_seconds: 30600,
          light_seconds: 18000,
          deep_seconds: 7200,
          rem_seconds: 5400,
        },
        heart_rate_samples: [{time: '2026-05-30T07:00:00.000Z', bpm: 61}],
        workouts: [
          {
            start_time: '2026-05-30T10:00:00.000Z',
            end_time: '2026-05-30T10:45:00.000Z',
            duration_sec: 2700,
            avg_hr: 142,
          },
        ],
      },
    ];
    const providersByDay = new Map([['2026-05-30', {steps: 'com.google.android.apps.fitness'}]]);
    (collectHealthDataForRangeWithProviders as jest.Mock).mockResolvedValue({
      days: importedDays,
      providersByDay,
      recordCounts: {steps: 1, sleep: 1, heart_rate_samples: 1, workouts: 1},
      records: [],
    });

    const result = await runHealthConnectLocalRead();

    expect(result.ok).toBe(true);
    expect(rebuildDayRollupsForDates).toHaveBeenCalledWith(['2026-05-30']);
  });

  it('POSTs to backend in legacy_api when reachable', async () => {
    (getStoredOperatingMode as jest.Mock).mockResolvedValue('legacy_api');
    (getApiBaseUrl as jest.Mock).mockResolvedValue('http://127.0.0.1:8000');
    (pingFirstAvailable as jest.Mock).mockResolvedValue({ok: true, base: 'http://127.0.0.1:8000'});
    (getUserId as jest.Mock).mockResolvedValue('user-1');
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        status: 'ok',
        saved_days: 1,
        saved: {fields: 3},
      }),
    });

    const result = await runHealthConnectSync();
    expect(result.ok).toBe(true);
    expect(apiFetch).toHaveBeenCalled();
  });
});
