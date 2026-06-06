jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({type: 'wifi', isConnected: true}),
  addEventListener: jest.fn(),
}));

jest.mock('../../database/index', () => ({
  executeSql: jest.fn(),
  initDB: jest.fn(),
  getMeta: jest.fn(),
  setMeta: jest.fn(),
  nowIso: jest.fn(() => '2026-05-30T12:00:00.000Z'),
}));

jest.mock('../../database/conflictStore', () => ({
  countUnresolvedConflicts: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../services/network', () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../services/SyncService', () => ({
  runFullSync: jest.fn().mockResolvedValue({ok: true, message: 'ok'}),
  legacySyncInFlight: jest.fn().mockReturnValue(false),
}));

jest.mock('../FormaSyncEngine', () => ({
  FormaSyncEngine: {
    sync: jest.fn().mockResolvedValue({message: 'forma ok'}),
  },
}));

jest.mock('../syncState', () => ({
  isFormaSyncInFlight: jest.fn().mockReturnValue(false),
}));

jest.mock('../syncMeta', () => ({
  setFormaSyncLastError: jest.fn(),
}));

jest.mock('../pendingChanges', () => ({
  countPendingFormaSyncChanges: jest.fn().mockResolvedValue(0),
}));

jest.mock('../syncQueue', () => ({
  enqueueSyncJob: jest.fn().mockResolvedValue(undefined),
  getDueSyncJobs: jest.fn().mockResolvedValue([]),
  markSyncJobDone: jest.fn(),
  markSyncJobFailed: jest.fn(),
  markSyncJobRunning: jest.fn(),
  pruneDoneSyncJobs: jest.fn(),
  resetSyncJobForRetry: jest.fn(),
  getSyncQueueSummary: jest.fn().mockResolvedValue({
    pendingCount: 0,
    failedCount: 0,
    running: false,
    lastError: null,
  }),
}));

jest.mock('../syncSettings', () => ({
  canRunAutoSync: jest.fn().mockResolvedValue(false),
  isManualSyncOnly: jest.fn().mockResolvedValue(false),
  isWifiOnlySyncEnabled: jest.fn().mockResolvedValue(false),
  isChargingOnlySyncEnabled: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../auth/session', () => ({
  getStoredOperatingMode: jest.fn().mockResolvedValue('autonomous'),
}));

import {enqueueSyncJob} from '../syncQueue';
import {canRunAutoSync, isManualSyncOnly} from '../syncSettings';
import {notifyLocalChange} from '../syncOrchestrator';

describe('syncOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (isManualSyncOnly as jest.Mock).mockResolvedValue(false);
    (canRunAutoSync as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces enqueue and respects auto sync gate', async () => {
    notifyLocalChange();
    notifyLocalChange();
    expect(enqueueSyncJob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(enqueueSyncJob).toHaveBeenCalledTimes(1);
  });

  it('skips auto processing when manual-only', async () => {
    (isManualSyncOnly as jest.Mock).mockResolvedValue(true);

    notifyLocalChange();
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();

    expect(enqueueSyncJob).toHaveBeenCalledTimes(1);
    expect(canRunAutoSync).not.toHaveBeenCalled();
  });
});
