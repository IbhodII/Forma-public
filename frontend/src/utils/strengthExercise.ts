export function isPlankExercise(name: string): boolean {
  return isTimeBasedExercise(name);
}

/** Упражнения на время (планка и аналоги). */
export function isTimeBasedExercise(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/ё/g, "е");
  if (n.includes("планк")) return true;
  if (/\bplank\b/.test(n)) return true;
  if (n.includes("wall sit") || n.includes("hollow hold")) return true;
  return false;
}

export interface PresetSetLike {
  set_number: number;
  reps: number;
  weight: number | null;
  duration_sec?: number | null;
  is_warmup?: boolean;
}

export function defaultPresetSets(isBodyweight: boolean): PresetSetLike[] {
  return Array.from({ length: 4 }, (_, i) => ({
    set_number: i + 1,
    reps: isBodyweight ? 1 : 8,
    weight: isBodyweight ? null : 0,
    duration_sec: isBodyweight ? 30 : null,
    is_warmup: false,
  }));
}

export function parseRepsStrToNumbers(repsStr: string): number[] {
  if (!repsStr.trim()) return [8];
  return repsStr
    .split(/[,+;\s]+/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}
