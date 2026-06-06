import type {HealthConnectDayPayload} from '../HealthConnectService';
import {computeStaleFlags} from '../../database/hcStore';

describe('hcStore stale flags', () => {
  const baseDay: HealthConnectDayPayload = {
    date: '2026-05-30',
    steps: 5000,
    active_calories: 300,
  };

  it('marks unchanged fields stale after 48h', () => {
    const previousRead = new Date('2026-05-27T10:00:00.000Z').toISOString();
    const now = new Date('2026-05-30T12:00:00.000Z');

    const stale = computeStaleFlags(baseDay, {...baseDay, total_calories: 2000}, previousRead, now);

    expect(stale.steps).toBe(true);
    expect(stale.active_calories).toBe(true);
    expect(stale.total_calories).toBeUndefined();
  });

  it('does not mark stale when last read is recent', () => {
    const previousRead = new Date('2026-05-30T08:00:00.000Z').toISOString();
    const now = new Date('2026-05-30T12:00:00.000Z');

    const stale = computeStaleFlags(baseDay, baseDay, previousRead, now);
    expect(Object.keys(stale)).toHaveLength(0);
  });

  it('returns empty stale flags for first ingest', () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    const stale = computeStaleFlags(null, baseDay, null, now);
    expect(Object.keys(stale)).toHaveLength(0);
  });
});
