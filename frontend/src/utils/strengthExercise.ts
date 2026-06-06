export function isPlankExercise(name: string): boolean {
  return name.trim().toLowerCase().replace(/ё/g, "е").includes("планк");
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
