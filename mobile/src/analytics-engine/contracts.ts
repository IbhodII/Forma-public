export type DailyFacts = {
  date: string;
  steps: number;
  activeCalories: number;
  totalCalories: number;
  workoutCalories: number;
  sleepHours: number | null;
  restingHr: number | null;
  avgHr: number | null;
  hrSamples: number;
  workouts: number;
  trimp: number;
  strengthVolumeKg: number;
  maxStrengthWeight: number;
};

export type DataAvailability = {
  hasSteps: boolean;
  hasSleep: boolean;
  hasHeartRate: boolean;
  hasWorkouts: boolean;
  hasCalories: boolean;
};

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export type CycleSettings = {
  cycleLengthDays: number;
  periodLengthDays: number;
  lastPeriodStart: string | null;
  cycleEnabled: boolean;
};

export type CycleLogItem = {
  date: string;
  flow_intensity?: 'light' | 'medium' | 'heavy' | null;
  symptoms?: string | null;
  notes?: string | null;
  phase?: CyclePhase | null;
};
