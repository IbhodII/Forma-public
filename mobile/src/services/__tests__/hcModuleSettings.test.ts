jest.mock('../../database/index', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn(),
}));

import {getMeta, setMeta} from '../../database/index';
import {
  HC_MODULE_ENABLED_KEY,
  HC_LAST_LOCAL_READ_AT_KEY,
  isHealthConnectModuleEnabled,
  setHealthConnectModuleEnabled,
  setHcLastLocalReadAt,
  getHcLastLocalReadAt,
} from '../hcModuleSettings';

describe('hcModuleSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to disabled when meta missing', async () => {
    (getMeta as jest.Mock).mockResolvedValue(null);
    expect(await isHealthConnectModuleEnabled()).toBe(false);
  });

  it('reads enabled flag from sync_meta', async () => {
    (getMeta as jest.Mock).mockResolvedValue('1');
    expect(await isHealthConnectModuleEnabled()).toBe(true);
  });

  it('persists toggle on and off', async () => {
    await setHealthConnectModuleEnabled(true);
    expect(setMeta).toHaveBeenCalledWith(HC_MODULE_ENABLED_KEY, '1');

    await setHealthConnectModuleEnabled(false);
    expect(setMeta).toHaveBeenCalledWith(HC_MODULE_ENABLED_KEY, '0');
  });

  it('persists last local read timestamp', async () => {
    (getMeta as jest.Mock).mockResolvedValue('2026-05-30T10:00:00.000Z');
    await setHcLastLocalReadAt('2026-05-30T12:00:00.000Z');
    expect(setMeta).toHaveBeenCalledWith(
      HC_LAST_LOCAL_READ_AT_KEY,
      '2026-05-30T12:00:00.000Z',
    );
    expect(await getHcLastLocalReadAt()).toBe('2026-05-30T10:00:00.000Z');
  });
});
