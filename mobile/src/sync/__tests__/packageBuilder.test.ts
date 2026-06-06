jest.mock('../../database/index', () => ({
  executeSql: jest.fn(),
  initDB: jest.fn(),
  nowIso: jest.fn(() => '2026-05-30T12:00:00.000Z'),
}));

jest.mock('../../services/hcModuleSettings', () => ({
  isHealthConnectModuleEnabled: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(),
}));

jest.mock('../deviceId', () => ({
  getOrCreateDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('../sha256File', () => ({
  sha256HexFile: jest.fn().mockResolvedValue('abc'),
}));

jest.mock('../exportChanges', () => ({
  exportPendingChanges: jest.fn(),
}));

import {exportPendingChanges} from '../exportChanges';
import {buildFormaSyncPackage} from '../packageBuilder';

describe('packageBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no pending changes', async () => {
    (exportPendingChanges as jest.Mock).mockResolvedValue({
      jsonl: {},
      exportedRefs: [],
      rowCount: 0,
    });
    const result = await buildFormaSyncPackage(0);
    expect(result).toBeNull();
  });

  it('builds package when changes exist', async () => {
    (exportPendingChanges as jest.Mock).mockResolvedValue({
      jsonl: {
        food_entries: [
          {
            id: 'food:mobile:1',
            updated_at: '2026-05-30T11:00:00.000Z',
            source: 'mobile',
            device_id: 'device-1',
            payload: {date: '2026-05-30'},
          },
        ],
        body_metrics: [],
        strength_workouts: [],
        stretching_log: [],
        bracelet_calories: [],
        hc_days: [],
        cardio_workouts: [],
        food_products: [],
        strength_presets: [],
        user_preferences: [],
      },
      exportedRefs: [{table: 'food_entries', keyColumn: 'id', keyValue: 1}],
      rowCount: 1,
    });

    const result = await buildFormaSyncPackage(0);
    expect(result).not.toBeNull();
    expect(result!.rowCount).toBe(1);
    expect(result!.entitiesSummary.food_entries).toBe(1);
    expect(result!.exportedRefs).toHaveLength(1);
  });
});
