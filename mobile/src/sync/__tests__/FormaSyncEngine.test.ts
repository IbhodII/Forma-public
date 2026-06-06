jest.mock('../syncState', () => ({
  withFormaSyncLock: (fn: () => Promise<unknown>) => fn(),
  isFormaSyncInFlight: jest.fn(() => false),
}));

jest.mock('../downloadFlow', () => ({
  runDownloadFlow: jest.fn(),
}));

jest.mock('../uploadFlow', () => ({
  runUploadFlow: jest.fn(),
}));

jest.mock('../yandexFormaSyncApi', () => ({
  fetchRemoteManifest: jest.fn(),
}));

jest.mock('../../services/CloudSyncService', () => ({
  CloudSyncService: {getToken: jest.fn().mockResolvedValue('token')},
}));

jest.mock('../../mode/yandexIdentity', () => ({
  getStoredYandexUid: jest.fn().mockResolvedValue('uid-1'),
}));

jest.mock('../../database/conflictStore', () => ({
  countUnresolvedConflicts: jest.fn().mockResolvedValue(0),
}));

jest.mock('../pendingChanges', () => ({
  countPendingFormaSyncChanges: jest.fn().mockResolvedValue(1),
  nowIso: jest.fn(() => '2026-05-30T12:00:00.000Z'),
}));

jest.mock('../syncMeta', () => ({
  getLastSeenRevision: jest.fn().mockResolvedValue(3),
  getLastUploadAt: jest.fn().mockResolvedValue(null),
  getLastDownloadAt: jest.fn().mockResolvedValue(null),
  getFormaSyncLastError: jest.fn().mockResolvedValue(null),
  setFormaSyncLastError: jest.fn(),
}));

import {runDownloadFlow} from '../downloadFlow';
import {uploadFormaSyncOnly, syncFormaSync, downloadFormaSyncOnly} from '../FormaSyncEngine';
import {runUploadFlow} from '../uploadFlow';

describe('FormaSyncEngine flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sync runs download then upload', async () => {
    (runDownloadFlow as jest.Mock).mockResolvedValue({
      downloaded: true,
      message: 'Загружено rev 4: 2 записей',
    });
    (runUploadFlow as jest.Mock).mockResolvedValue({
      uploaded: true,
      message: 'Отправлено rev 5 (1 записей)',
    });

    const result = await syncFormaSync();
    expect(result.downloaded).toBe(true);
    expect(result.uploaded).toBe(true);
    expect(runDownloadFlow).toHaveBeenCalled();
    expect(runUploadFlow).toHaveBeenCalled();
  });

  it('uploadOnly skips download', async () => {
    (runUploadFlow as jest.Mock).mockResolvedValue({
      uploaded: true,
      message: 'Отправлено rev 5 (1 записей)',
    });
    const result = await uploadFormaSyncOnly();
    expect(result.uploaded).toBe(true);
    expect(result.downloaded).toBe(false);
    expect(runDownloadFlow).not.toHaveBeenCalled();
  });

  it('downloadOnly skips upload', async () => {
    (runDownloadFlow as jest.Mock).mockResolvedValue({
      downloaded: false,
      message: 'Облако rev 3 — актуально',
    });
    const result = await downloadFormaSyncOnly();
    expect(result.downloaded).toBe(false);
    expect(runUploadFlow).not.toHaveBeenCalled();
  });
});
