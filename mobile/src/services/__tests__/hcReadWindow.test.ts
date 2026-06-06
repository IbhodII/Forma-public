import {
  INCREMENTAL_OVERLAP_H,
  INCREMENTAL_WINDOW_H,
  resolveIncrementalWindow,
  resolveInitialWindow,
  estimateNextBackgroundRun,
} from '../hcReadWindow';

describe('hcReadWindow', () => {
  it('uses 36h floor when no prior read', () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    const {from, to} = resolveIncrementalWindow(null, now);
    expect(to).toEqual(now);
    expect(from.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('applies overlap from last read', () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    const lastRead = '2026-05-30T10:00:00.000Z';
    const {from} = resolveIncrementalWindow(lastRead, now);
    expect(from.toISOString()).toBe('2026-05-30T06:00:00.000Z');
  });

  it('resolves initial window by days', () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    const {from} = resolveInitialWindow(7, now);
    expect(from.toISOString()).toBe('2026-05-23T12:00:00.000Z');
  });

  it('estimates next background run', () => {
    const est = estimateNextBackgroundRun('2026-05-30T10:00:00.000Z');
    expect(est).toBe('2026-05-30T11:00:00.000Z');
  });

  it('exports window constants within spec', () => {
    expect(INCREMENTAL_WINDOW_H).toBeGreaterThanOrEqual(24);
    expect(INCREMENTAL_WINDOW_H).toBeLessThanOrEqual(48);
    expect(INCREMENTAL_OVERLAP_H).toBeGreaterThanOrEqual(2);
    expect(INCREMENTAL_OVERLAP_H).toBeLessThanOrEqual(6);
  });
});
