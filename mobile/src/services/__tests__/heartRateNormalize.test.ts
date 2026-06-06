import {normalizeHeartRatePoints, isValidBpm} from '../heartRateNormalize';

describe('normalizeHeartRatePoints', () => {
  it('sorts by time and converts to UTC ISO', () => {
    const {points, stats} = normalizeHeartRatePoints([
      {timeMs: new Date('2026-05-31T12:00:00Z').getTime(), bpm: 80},
      {timeMs: new Date('2026-05-31T10:00:00Z').getTime(), bpm: 70},
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]!.bpm).toBe(70);
    expect(points[0]!.timestamp).toBe('2026-05-31T10:00:00.000Z');
    expect(stats.accepted).toBe(2);
  });

  it('deduplicates by timestamp', () => {
    const t = new Date('2026-05-31T10:00:00Z').getTime();
    const {points, stats} = normalizeHeartRatePoints([
      {timeMs: t, bpm: 70},
      {timeMs: t, bpm: 75},
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.bpm).toBe(70);
    expect(stats.duplicates).toBe(1);
  });

  it('rejects out-of-range bpm', () => {
    const {points, stats} = normalizeHeartRatePoints([
      {timeMs: Date.now(), bpm: 20},
      {timeMs: Date.now() + 1000, bpm: 250},
      {timeMs: Date.now() + 2000, bpm: 72},
    ]);
    expect(points).toHaveLength(1);
    expect(stats.rejected).toBe(2);
  });
});

describe('isValidBpm', () => {
  it('accepts 25-240 inclusive', () => {
    expect(isValidBpm(25)).toBe(true);
    expect(isValidBpm(240)).toBe(true);
    expect(isValidBpm(24)).toBe(false);
    expect(isValidBpm(241)).toBe(false);
  });
});
