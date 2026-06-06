/**
 * Canonical health metric colors (desktop dashboard / body / HC charts).
 * Slightly muted hex values — readable in light and dark themes.
 */
export const HEALTH_METRIC = {
  weight: {
    primary: "#22C55E",
    rgb: "34 197 94",
    dark: "#16A34A",
  },
  sleep: {
    primary: "#8B5CF6",
    rgb: "139 92 246",
    dark: "#7C3AED",
  },
  steps: {
    primary: "#06B6D4",
    rgb: "6 182 212",
    dark: "#0891B2",
  },
  calories: {
    primary: "#F97316",
    rgb: "249 115 22",
    dark: "#EA580C",
  },
  bodyFat: {
    primary: "#EAB308",
    rgb: "234 179 8",
    dark: "#CA8A04",
  },
  heartRate: {
    primary: "#EF4444",
    rgb: "239 68 68",
    dark: "#DC2626",
  },
  /** Macros / secondary — not primary health tiles */
  protein: {
    primary: "#22C55E",
    rgb: "34 197 94",
  },
  carbs: {
    primary: "#3B82F6",
    rgb: "59 130 246",
  },
} as const;

export type HealthMetricId = keyof typeof HEALTH_METRIC;

export function healthMetricRgb(id: HealthMetricId, alpha = 1): string {
  const { rgb } = HEALTH_METRIC[id];
  return alpha === 1 ? `rgb(${rgb})` : `rgb(${rgb} / ${alpha})`;
}

export function healthMetricGradient(id: HealthMetricId, alphaStart = 0.12): string {
  return `linear-gradient(155deg, rgb(${HEALTH_METRIC[id].rgb} / ${alphaStart}) 0%, rgb(var(--app-surface)) 58%)`;
}
