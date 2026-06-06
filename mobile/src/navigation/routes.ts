/** Bottom tab route keys (English identifiers for React Navigation). */
export const TAB = {
  Dashboard: 'Dashboard',
  Workouts: 'Workouts',
  Food: 'Food',
  Analytics: 'Analytics',
  HealthConnect: 'HealthConnect',
  Settings: 'Settings',
} as const;

export type MainTabRoute = (typeof TAB)[keyof typeof TAB];
