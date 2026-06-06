import {
  computeNextRetryAt,
  MAX_SYNC_ATTEMPTS,
  enqueueSyncJob,
  markSyncJobFailed,
} from '../syncQueue';

describe('syncQueue backoff', () => {
  it('computes exponential delay capped at 30 minutes', () => {
    const base = Date.parse('2026-05-30T12:00:00.000Z');
    expect(computeNextRetryAt(1, base)).toBe('2026-05-30T12:00:30.000Z');
    expect(computeNextRetryAt(2, base)).toBe('2026-05-30T12:01:00.000Z');
    expect(computeNextRetryAt(3, base)).toBe('2026-05-30T12:02:00.000Z');
    expect(computeNextRetryAt(10, base)).toBe('2026-05-30T12:30:00.000Z');
  });

  it('marks job failed after max attempts', () => {
    expect(MAX_SYNC_ATTEMPTS).toBe(8);
  });
});

jest.mock('../../database/index', () => ({
  executeSql: jest.fn(),
  initDB: jest.fn(),
  nowIso: jest.fn(() => '2026-05-30T12:00:00.000Z'),
}));

import {executeSql, initDB} from '../../database/index';

describe('syncQueue CRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (initDB as jest.Mock).mockResolvedValue(undefined);
  });

  it('dedupes pending jobs per kind', async () => {
    (executeSql as jest.Mock).mockResolvedValueOnce({rows: {length: 1}});
    await enqueueSyncJob('forma_sync');
    expect(executeSql).toHaveBeenCalledTimes(1);
    expect(executeSql).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'running')"),
      ['forma_sync'],
    );
  });

  it('schedules next retry on failure below max attempts', async () => {
    (executeSql as jest.Mock).mockResolvedValue(undefined);
    await markSyncJobFailed(3, 'network error', 2);
    expect(executeSql).toHaveBeenCalledWith(
      expect.stringContaining('next_retry_at'),
      expect.arrayContaining(['pending', 2, expect.any(String), 'network error', expect.any(String), 3]),
    );
  });

  it('marks job failed permanently at max attempts', async () => {
    (executeSql as jest.Mock).mockResolvedValue(undefined);
    await markSyncJobFailed(5, 'timeout', MAX_SYNC_ATTEMPTS);
    expect(executeSql).toHaveBeenCalledWith(
      expect.stringContaining('next_retry_at'),
      expect.arrayContaining(['failed', MAX_SYNC_ATTEMPTS, null]),
    );
  });
});
