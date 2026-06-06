import type { QueryClient } from "@tanstack/react-query";

/** Invalidate caches after DB import, replace, or full warmup. */
export function invalidateAfterDataReload(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["strength"] });
  void qc.invalidateQueries({ queryKey: ["cardio"] });
  void qc.invalidateQueries({ queryKey: ["presets"] });
  void qc.invalidateQueries({ queryKey: ["analytics"] });
  void qc.invalidateQueries({ queryKey: ["body"] });
  void qc.invalidateQueries({ queryKey: ["steps"] });
  void qc.invalidateQueries({ queryKey: ["food"] });
  void qc.invalidateQueries({ queryKey: ["nutrition"] });
}

export type WorkoutVisibilityReport = {
  rows_for_current_user?: number;
  ui_visible_sessions?: number;
  ui_visible_sessions_all_time?: number;
  likely_causes?: string[];
  sample_titles?: string[];
};

export function workoutVisibilityWarning(
  vis: WorkoutVisibilityReport | undefined,
): string | null {
  if (!vis?.likely_causes?.length) {
    return null;
  }
  const raw = vis.rows_for_current_user ?? 0;
  const ui = vis.ui_visible_sessions ?? 0;
  if (raw > 0 && ui === 0) {
    return vis.likely_causes[0] ?? null;
  }
  return null;
}
