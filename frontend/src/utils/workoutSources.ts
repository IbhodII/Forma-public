/** Unified workout source labels and colors (mirrors backend source_taxonomy). */

export type SourceType =
  | "manual"
  | "polar"
  | "health_connect"
  | "fit_import"
  | "tcx_import"
  | "gpx_import"
  | "garmin"
  | "phone"
  | "watch"
  | "excel"
  | "generated";

export interface SourceDisplay {
  label: string;
  shortLabel: string;
  colorClass: string;
}

const SOURCE_DISPLAY: Record<string, SourceDisplay> = {
  manual: {
    label: "Manual",
    shortLabel: "Manual",
    colorClass: "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/25",
  },
  polar: {
    label: "Polar",
    shortLabel: "Polar",
    colorClass: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  },
  health_connect: {
    label: "Health Connect",
    shortLabel: "HC",
    colorClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  fit_import: {
    label: "FIT",
    shortLabel: "FIT",
    colorClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  tcx_import: {
    label: "TCX",
    shortLabel: "TCX",
    colorClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
  },
  gpx_import: {
    label: "GPX",
    shortLabel: "GPX",
    colorClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  garmin: {
    label: "Garmin",
    shortLabel: "Garmin",
    colorClass: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/25",
  },
  phone: {
    label: "Phone",
    shortLabel: "Phone",
    colorClass: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-200 border-zinc-500/25",
  },
  watch: {
    label: "Watch",
    shortLabel: "Watch",
    colorClass: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/25",
  },
  excel: {
    label: "Excel",
    shortLabel: "Excel",
    colorClass: "bg-lime-500/15 text-lime-800 dark:text-lime-200 border-lime-500/25",
  },
  generated: {
    label: "Generated",
    shortLabel: "Gen",
    colorClass: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
  },
};

/** Map legacy cardio_workouts.data_source to taxonomy source_type. */
const LEGACY_DATA_SOURCE: Record<string, SourceType> = {
  manual: "manual",
  fit_coospo: "fit_import",
  polar_historical: "polar",
  health_connect: "health_connect",
  excel: "excel",
  import_tcx: "tcx_import",
  import_gpx: "gpx_import",
};

export function legacyDataSourceToType(dataSource: string | null | undefined): SourceType | null {
  if (!dataSource) return null;
  return LEGACY_DATA_SOURCE[dataSource.trim().toLowerCase()] ?? null;
}

export function getSourceDisplay(sourceType: string | null | undefined): SourceDisplay {
  const key = (sourceType || "manual").toLowerCase();
  return (
    SOURCE_DISPLAY[key] ?? {
      label: sourceType || "Unknown",
      shortLabel: sourceType || "?",
      colorClass: "bg-[rgb(var(--app-surface-subtle))] text-[rgb(var(--app-text-muted))] border-[rgb(var(--app-border))]",
    }
  );
}

export function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    hr: "Пульс",
    gps: "GPS",
    calories: "Калории",
    distance: "Дистанция",
    duration: "Длительность",
    sensors: "Датчики",
    metadata: "Метаданные",
  };
  return labels[metric] ?? metric;
}

export const SOURCE_PRIORITY_METRICS = [
  { key: "hr", label: "Пульс тренировки" },
  { key: "workout_calories", label: "Калории тренировки" },
  { key: "gps", label: "GPS" },
  { key: "steps", label: "Шаги" },
  { key: "weight", label: "Вес" },
  { key: "metadata", label: "Метаданные (дата/тип)" },
] as const;

export const ALLOWED_SOURCE_TYPES: SourceType[] = [
  "manual",
  "polar",
  "fit_import",
  "tcx_import",
  "gpx_import",
  "health_connect",
  "watch",
  "phone",
  "garmin",
  "excel",
];

export interface WorkoutSourceSummary {
  primary_label?: string | null;
  primary_source_type?: string | null;
  hr_label?: string | null;
  hr_fallback?: boolean;
  calories_label?: string | null;
  calories_fallback?: boolean;
  gps_label?: string | null;
  has_conflicts?: boolean;
}

export interface MetricSourceInfo {
  metric: string;
  effective_source?: string | null;
  effective_label?: string | null;
  fallback_sources?: string[];
  fallback_labels?: string[];
  is_fallback?: boolean;
  source_provider?: string | null;
}

export interface SourceConflictValue {
  source_type: string;
  label: string;
  value: number;
}

export interface SourceConflict {
  metric: string;
  message: string;
  values: SourceConflictValue[];
}

export interface WorkoutSourceView {
  workout_id: number;
  primary_source_type: string;
  primary_provider?: string | null;
  primary_label: string;
  metrics: MetricSourceInfo[];
  linked_sources: { workout_id: number; link_reason: string; confidence?: string | null }[];
  conflicts: SourceConflict[];
  has_conflicts: boolean;
}

export interface SourcePriorityPrefs {
  hr: string[];
  workout_calories: string[];
  steps: string[];
  weight: string[];
  gps: string[];
  metadata: string[];
}
