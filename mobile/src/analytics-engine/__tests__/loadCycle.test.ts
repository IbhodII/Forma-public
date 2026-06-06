import {buildPhasesForRange, computeCtlAtlTsb, predictPhase, resolveCycleImpact} from '../index';
import type {CycleSettings, DailyFacts} from '../contracts';

describe('analytics-engine load', () => {
  it('computes CTL/ATL/TSB series from daily load', () => {
    const facts: DailyFacts[] = [
      {
        date: '2026-06-01',
        steps: 10000,
        activeCalories: 350,
        totalCalories: 2000,
        workoutCalories: 400,
        sleepHours: 7,
        restingHr: 56,
        avgHr: 118,
        hrSamples: 20,
        workouts: 1,
        trimp: 80,
        strengthVolumeKg: 0,
        maxStrengthWeight: 0,
      },
      {
        date: '2026-06-02',
        steps: 9000,
        activeCalories: 280,
        totalCalories: 1950,
        workoutCalories: 260,
        sleepHours: 6.5,
        restingHr: 58,
        avgHr: 121,
        hrSamples: 18,
        workouts: 1,
        trimp: 90,
        strengthVolumeKg: 0,
        maxStrengthWeight: 0,
      },
    ];
    const series = computeCtlAtlTsb(facts);
    expect(series).toHaveLength(2);
    expect(series[0]?.ctl).toBe(80);
    expect(series[1]?.ctl).toBeGreaterThan(80);
    expect(series[1]?.atl).toBeGreaterThan(series[1]?.ctl ?? 0);
  });
});

describe('analytics-engine cycle parity', () => {
  const settings: CycleSettings = {
    cycleLengthDays: 28,
    periodLengthDays: 5,
    lastPeriodStart: '2026-05-20',
    cycleEnabled: true,
  };

  it('predicts phase with backend-compatible boundaries', () => {
    expect(predictPhase('2026-05-21', settings)).toBe('menstrual');
    expect(predictPhase('2026-05-30', settings)).toBe('follicular');
    expect(predictPhase('2026-06-03', settings)).toBe('ovulatory');
  });

  it('uses manual phase override for impact', () => {
    const impact = resolveCycleImpact('2026-06-01', settings, [
      {date: '2026-06-01', phase: 'luteal'},
    ]);
    expect(impact.tracking).toBe(true);
    expect(impact.phase).toBe('luteal');
    expect(impact.bmr_multiplier).toBe(1.05);
    expect(impact.recovery_multiplier).toBe(0.9);
  });

  it('builds phase timeline for range', () => {
    const rows = buildPhasesForRange('2026-06-01', '2026-06-07', settings, []);
    expect(rows.length).toBe(7);
    expect(rows[0]).toHaveProperty('phase');
  });
});
