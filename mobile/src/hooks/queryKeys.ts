/** React Query keys for mobile (mirrors frontend queryKeys.cardio* pattern). */
export const queryKeys = {
  cardioWorkouts: (period?: number, typeFilter?: string | null) =>
    ['cardio-workouts', period, typeFilter] as const,
  cardioAvailability: (ids: number[]) =>
    ['cardio-availability', ids.slice().sort((a, b) => a - b).join(',')] as const,
  cardioHr: (workoutId: number) => ['cardio-hr', workoutId] as const,
  cardioGps: (workoutId: number) => ['cardio-gps', workoutId] as const,
  cardioSensors: (workoutId: number, downsample = 2) =>
    ['cardio-sensors', workoutId, downsample] as const,
  cardioPoints: (workoutId: number, downsample = 2) =>
    ['cardio-points', workoutId, downsample] as const,
  cardioPower: (workoutId: number) => ['cardio-power', workoutId] as const,
  cardioWorkout: (workoutId: number) => ['cardio-workout', workoutId] as const,
  sleepSummary: (days: number) => ['sleep-summary', days] as const,
  analyticsCtl: (days: number) => ['analytics', 'ctl', days] as const,
  analyticsTrimp: (from: string, to: string) => ['analytics', 'trimp', from, to] as const,
  analyticsZoneTime: (days: number) => ['analytics', 'zone-time', days] as const,
  analyticsCalories: (from: string, to: string) =>
    ['analytics', 'calories', from, to] as const,
};
