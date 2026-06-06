import {
  DEFAULT_WEEK_START,
  formatFormaWeekLabel,
  getWeekRange,
  getWeekStart,
  groupByFormaWeek,
} from '../formaWeek';

describe('formaWeek', () => {
  it('uses Saturday as default start', () => {
    expect(DEFAULT_WEEK_START).toBe(6);
    expect(getWeekStart('2026-06-02')).toBe('2026-05-30');
  });

  it('builds week range across month boundary', () => {
    expect(getWeekRange('2026-06-02')).toEqual({
      start: '2026-05-30',
      end: '2026-06-05',
    });
  });

  it('formats week labels in russian style', () => {
    expect(formatFormaWeekLabel('2026-06-02')).toBe('30 мая – 5 июн');
    expect(formatFormaWeekLabel('2026-06-20')).toBe('20–26 июн');
  });

  it('groups records by Forma week start', () => {
    const rows = [
      {date: '2026-06-01', value: 1},
      {date: '2026-06-04', value: 2},
      {date: '2026-06-07', value: 3},
    ];
    const grouped = groupByFormaWeek(rows, row => row.date);
    expect(Object.keys(grouped)).toEqual(['2026-05-30', '2026-06-06']);
    expect(grouped['2026-05-30']).toHaveLength(2);
    expect(grouped['2026-06-06']).toHaveLength(1);
  });
});
