/** Abstract workout category visuals — Lucide icons, no emoji. */

import { CARDIO_BIKE, CARDIO_POOL, CARDIO_RUN, cardioTypeLabel } from "./constants";

export type WorkoutCategory = "strength" | "cardio" | "circuit" | "hiit" | "recovery" | "custom";

/** Icon key resolved in WorkoutCategoryIcon (keeps this module free of JSX). */
export type WorkoutIconKey =
  | "dumbbell"
  | "activity"
  | "layers"
  | "zap"
  | "heart-pulse"
  | "sparkles"
  | "orbit"
  | "hexagon"
  | "shapes"
  | "circle-dot";

export type WorkoutVisual = {
  category: WorkoutCategory;
  icon: WorkoutIconKey;
  label: string;
  accentClass: string;
  ringClass: string;
  iconClass: string;
};

const PALETTES: Pick<WorkoutVisual, "accentClass" | "ringClass" | "iconClass">[] = [
  {
    accentClass: "from-slate-500/12 to-slate-400/5",
    ringClass: "ring-slate-500/20",
    iconClass: "text-slate-600 dark:text-slate-300",
  },
  {
    accentClass: "from-violet-500/12 to-indigo-500/5",
    ringClass: "ring-violet-500/22",
    iconClass: "text-violet-600 dark:text-violet-300",
  },
  {
    accentClass: "from-sky-500/12 to-blue-500/5",
    ringClass: "ring-sky-500/22",
    iconClass: "text-sky-600 dark:text-sky-300",
  },
  {
    accentClass: "from-emerald-500/12 to-teal-500/5",
    ringClass: "ring-emerald-500/22",
    iconClass: "text-emerald-600 dark:text-emerald-300",
  },
  {
    accentClass: "from-amber-500/12 to-orange-500/5",
    ringClass: "ring-amber-500/22",
    iconClass: "text-amber-700 dark:text-amber-300",
  },
  {
    accentClass: "from-rose-500/12 to-pink-500/5",
    ringClass: "ring-rose-500/22",
    iconClass: "text-rose-600 dark:text-rose-300",
  },
  {
    accentClass: "from-fuchsia-500/12 to-purple-500/5",
    ringClass: "ring-fuchsia-500/22",
    iconClass: "text-fuchsia-600 dark:text-fuchsia-300",
  },
];

const CATEGORY_ICON: Record<WorkoutCategory, WorkoutIconKey> = {
  strength: "dumbbell",
  cardio: "activity",
  circuit: "layers",
  hiit: "zap",
  recovery: "heart-pulse",
  custom: "sparkles",
};

const CUSTOM_VARIANT_ICONS: WorkoutIconKey[] = [
  "sparkles",
  "layers",
  "orbit",
  "hexagon",
  "shapes",
  "circle-dot",
];

const DEFAULT_VISUAL: WorkoutVisual = {
  category: "strength",
  icon: "dumbbell",
  label: "Силовая",
  ...PALETTES[0]!,
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Keyword-based category; muscle names fall through to strength + palette hash. */
export function resolveWorkoutCategory(
  title: string,
  opts?: { circuit?: boolean },
): WorkoutCategory {
  if (opts?.circuit) return "circuit";

  const t = normalizeTitle(title);
  if (!t) return "strength";

  if (/круг|circuit|кругов/.test(t)) return "circuit";
  if (/hiit|интервал|tabata|табата/.test(t)) return "hiit";
  if (/восстанов|recovery|растяж|stretch|йога|yoga|mobility|мобил/.test(t)) return "recovery";
  if (/кардио|cardio|бег|run|вело|bike|бассейн|pool|swim|плаван|row|греб/.test(t)) return "cardio";

  return "strength";
}

function paletteFor(title: string): (typeof PALETTES)[number] {
  return PALETTES[hashString(normalizeTitle(title)) % PALETTES.length]!;
}

function iconForCategory(category: WorkoutCategory, title: string): WorkoutIconKey {
  if (category === "custom") {
    return CUSTOM_VARIANT_ICONS[hashString(normalizeTitle(title)) % CUSTOM_VARIANT_ICONS.length]!;
  }
  return CATEGORY_ICON[category];
}

export function workoutVisual(
  workoutTitle: string,
  opts?: { circuit?: boolean; forceCustom?: boolean },
): WorkoutVisual {
  const label = workoutTitle.trim() || DEFAULT_VISUAL.label;
  let category = resolveWorkoutCategory(label, opts);
  if (opts?.forceCustom) category = "custom";

  const palette = paletteFor(label);
  const icon = iconForCategory(category, label);

  return {
    category,
    icon,
    label,
    ...palette,
  };
}

/** Визуал вкладки кардио (вело / бассейн / бег). */
export function cardioVisual(type: string): WorkoutVisual {
  const paletteByType: Record<string, (typeof PALETTES)[number]> = {
    [CARDIO_BIKE]: PALETTES[2]!,
    [CARDIO_POOL]: PALETTES[3]!,
    [CARDIO_RUN]: PALETTES[4]!,
  };
  const palette = paletteByType[type] ?? paletteFor(type);
  return {
    category: "cardio",
    icon: "activity",
    label: cardioTypeLabel(type),
    ...palette,
  };
}

/** Initials fallback for compact badges without icon room. */
export function workoutInitials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "W";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
