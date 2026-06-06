import {buildEntityId, parseEntityId} from '../entityTypes';

describe('entityTypes', () => {
  it('builds and parses food id', () => {
    const id = buildEntityId('food_entries', 'mobile', 15);
    expect(id).toBe('food:mobile:15');
    expect(parseEntityId(id)).toEqual({
      entity: 'food_entries',
      origin: 'mobile',
      localKey: '15',
    });
  });

  it('builds bracelet id by date', () => {
    const id = buildEntityId('bracelet_calories', 'mobile', '2026-05-30');
    expect(parseEntityId(id)?.entity).toBe('bracelet_calories');
  });

  it('builds hc day id', () => {
    const id = buildEntityId('hc_days', 'mobile', '2026-05-30');
    expect(id).toBe('hc:health_connect:2026-05-30');
    expect(parseEntityId(id)).toEqual({
      entity: 'hc_days',
      origin: 'health_connect',
      localKey: '2026-05-30',
    });
  });

  it('returns null for unknown id', () => {
    expect(parseEntityId('unknown:x:1')).toBeNull();
  });
});
