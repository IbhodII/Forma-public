export type InsightCategory =
  | 'recovery'
  | 'workload'
  | 'fatigue'
  | 'progression'
  | 'mobility'
  | 'cycle'
  | 'wellness';

export type InsightTone = 'calm' | 'warm' | 'alert' | 'positive' | 'neutral';

export type InsightSurface = 'home' | 'analytics' | 'post_workout' | 'recovery';

export type Insight = {
  id: string;
  category: InsightCategory;
  tone: InsightTone;
  title: string;
  body: string;
  priority: number;
  surfaces: InsightSurface[];
  icon?: string;
  tab?: string;
};

export type TsbPoint = {date: string; tsb: number; atl: number; ctl: number};

export type InsightContext = {
  tsb: number | null;
  atl: number | null;
  ctl: number | null;
  tsbSeries: TsbPoint[];
  daysSinceWorkout: number;
  lastWorkoutDate: string | null;
  stretchRecent: boolean;
  streak: number;
  kcalToday: number;
  proteinToday: number;
  isFemale: boolean;
  cycle?: {
    phase_label?: string | null;
    recovery_note?: string | null;
    message?: string | null;
    tracking?: boolean;
  } | null;
  workoutsLast7d: number;
  workoutsPrev7d: number;
  hadRestBeforeLastWorkout: boolean;
  trimpTrendPerDay: number | null;
  trimpSumPeriod: number;
};

export type PostWorkoutEvent = {
  kind: 'strength' | 'cardio' | 'stretch';
  title: string;
  setsOrMinutes?: number;
};
