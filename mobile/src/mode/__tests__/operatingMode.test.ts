import {
  allowsLocalOnly,
  isLegacyApiMode,
  LOCAL_DEVICE_USER_ID,
  normalizeOperatingMode,
  requiresPcApi,
  shouldSkipPcApi,
  sessionUserIdForMode,
  userIdFromYandexUid,
  maskYandexUid,
  modeLabel,
} from '../operatingMode';

describe('operatingMode', () => {
  it('migrates legacy api app mode', () => {
    expect(normalizeOperatingMode(null, 'api')).toBe('legacy_api');
    expect(normalizeOperatingMode(null, 'local_hc_test')).toBe('local_hc_test');
  });

  it('requiresPcApi only for legacy', () => {
    expect(requiresPcApi('legacy_api')).toBe(true);
    expect(requiresPcApi('autonomous')).toBe(false);
    expect(requiresPcApi('cloud')).toBe(false);
  });

  it('shouldSkipPcApi for autonomous even when PC reachable flag is true', () => {
    expect(shouldSkipPcApi('autonomous', true)).toBe(true);
    expect(shouldSkipPcApi('autonomous', false)).toBe(true);
    expect(shouldSkipPcApi('cloud', true)).toBe(false);
    expect(shouldSkipPcApi('cloud', false)).toBe(true);
    expect(shouldSkipPcApi('legacy_api', true)).toBe(false);
    expect(shouldSkipPcApi('legacy_api', false)).toBe(true);
  });

  it('allowsLocalOnly for autonomous and cloud', () => {
    expect(allowsLocalOnly('autonomous')).toBe(true);
    expect(allowsLocalOnly('legacy_api')).toBe(false);
  });

  it('sessionUserIdForMode uses stable id for local-first', () => {
    expect(sessionUserIdForMode('autonomous', 999_999)).toBe(LOCAL_DEVICE_USER_ID);
    expect(sessionUserIdForMode('legacy_api', 42)).toBe(42);
  });

  it('stable userIdFromYandexUid', () => {
    const a = userIdFromYandexUid('123456789');
    const b = userIdFromYandexUid('123456789');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(100_000);
  });

  it('masks yandex uid', () => {
    expect(maskYandexUid('1234567890')).toMatch(/…/);
  });

  it('mode labels', () => {
    expect(modeLabel('autonomous')).toBe('На устройстве');
    expect(modeLabel('legacy_api')).toBe('С компьютером');
  });

  it('isLegacyApiMode from session shape', () => {
    expect(isLegacyApiMode({userId: 1, operatingMode: 'legacy_api'})).toBe(true);
    expect(isLegacyApiMode({userId: 1, operatingMode: 'autonomous'})).toBe(false);
  });
});
