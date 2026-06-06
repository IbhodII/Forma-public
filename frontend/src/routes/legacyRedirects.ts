/** Старые URL из закладок — редирект без 404 (тренировки/растяжка: только /workouts, /stretching). */
export const LEGACY_REDIRECTS: ReadonlyArray<{ path: string; to: string }> = [
  { path: "/strength", to: "/workouts" },
  { path: "/cardio", to: "/workouts" },
  { path: "/exercises", to: "/workouts" },
  { path: "/charts", to: "/workouts" },
  { path: "/weight", to: "/body?tab=weight" },
  { path: "/nutrition", to: "/food?phase=cut" },
  { path: "/profile", to: "/settings?tab=profile" },
  { path: "/menstrual-cycle", to: "/cycle" },
  { path: "/polar-import", to: "/workouts" },
  { path: "/settings/health-connect", to: "/body?tab=health-connect" },
  { path: "/health-connect", to: "/body?tab=health-connect" },
];
