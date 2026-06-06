import type {DailyFacts, DataAvailability} from './contracts';

export type RecoveryState = {
  fatigue: number;
  readiness: number;
  recovery: number;
  strain: number;
  availability: DataAvailability;
};

export function computeRecoveryState(facts: DailyFacts[]): RecoveryState {
  const sorted = [...facts].sort((a, b) => a.date.localeCompare(b.date));
  const tail = sorted.slice(-7);
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const sleepAvg = avg(tail.map(x => x.sleepHours ?? 0).filter(Boolean));
  const trimpAvg = avg(tail.map(x => x.trimp));
  const restingHr = avg(tail.map(x => x.restingHr ?? 0).filter(Boolean));
  const readinessRaw = 100 - trimpAvg * 0.35 + sleepAvg * 8 - Math.max(0, restingHr - 58) * 1.5;
  const readiness = clamp(round1(readinessRaw), 0, 100);
  const fatigue = clamp(round1(trimpAvg * 0.6 + Math.max(0, 7 - sleepAvg) * 8), 0, 100);
  const recovery = clamp(round1(100 - fatigue + (sleepAvg >= 7 ? 8 : -6)), 0, 100);
  const strain = clamp(round1(trimpAvg), 0, 100);
  return {
    fatigue,
    readiness,
    recovery,
    strain,
    availability: {
      hasSteps: tail.some(x => x.steps > 0),
      hasSleep: tail.some(x => (x.sleepHours ?? 0) > 0),
      hasHeartRate: tail.some(x => (x.avgHr ?? 0) > 0 || (x.restingHr ?? 0) > 0),
      hasWorkouts: tail.some(x => x.workouts > 0),
      hasCalories: tail.some(x => x.totalCalories > 0 || x.activeCalories > 0),
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
