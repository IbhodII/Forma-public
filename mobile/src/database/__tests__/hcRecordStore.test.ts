import {buildHcRecordKey, type HcRecordInput} from '../hcRecordStore';

describe('hcRecordStore dedupe keys', () => {
  const base: HcRecordInput = {
    recordType: 'steps',
    provider: 'com.mi.health',
    startTime: '2026-05-30T08:00:00.000Z',
    endTime: '2026-05-30T09:00:00.000Z',
    payload: {count: 1000},
  };

  it('uses metadata id when present', () => {
    expect(buildHcRecordKey({...base, metadataId: 'abc-123'})).toBe('hc:steps:abc-123');
  });

  it('falls back to type+time+provider key', () => {
    const key = buildHcRecordKey(base);
    expect(key).toContain('hc:steps:');
    expect(key).toContain('com.mi.health');
  });

  it('produces stable keys for same input', () => {
    expect(buildHcRecordKey(base)).toBe(buildHcRecordKey(base));
  });
});
