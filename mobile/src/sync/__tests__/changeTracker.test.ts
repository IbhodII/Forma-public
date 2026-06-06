jest.mock('../deviceId', () => ({
  getOrCreateDeviceId: jest.fn().mockResolvedValue('device-test'),
}));

jest.mock('../../database/index', () => ({
  executeSql: jest.fn(),
  initDB: jest.fn(),
  nowIso: jest.fn(() => '2026-05-30T12:00:00.000Z'),
}));

jest.mock('../../services/hcModuleSettings', () => ({
  isHealthConnectModuleEnabled: jest.fn().mockResolvedValue(false),
}));

import {executeSql} from '../../database/index';
import {
  countPendingSyncChanges,
  markExported,
  PENDING_WHERE,
} from '../changeTracker';

describe('changeTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (executeSql as jest.Mock).mockImplementation(async () => ({
      rows: {length: 1, item: () => ({cnt: 2})},
    }));
  });

  it('counts pending across syncable tables', async () => {
    const total = await countPendingSyncChanges();
    expect(total).toBeGreaterThan(0);
    expect(executeSql).toHaveBeenCalled();
  });

  it('uses indexed pending predicate', () => {
    expect(PENDING_WHERE).toContain("sync_status IN ('pending', 'conflict')");
  });

  it('marks exported rows with revision', async () => {
    await markExported(
      [
        {table: 'food_entries', keyColumn: 'id', keyValue: 5},
        {table: 'body_metrics', keyColumn: 'id', keyValue: 3},
      ],
      42,
    );
    expect(executeSql).toHaveBeenCalledWith(
      expect.stringContaining('last_synced_revision'),
      [42, 5],
    );
  });
});
