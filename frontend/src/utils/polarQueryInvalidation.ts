import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../hooks/queryKeys";

export type PolarAttachKind = "cardio" | "strength";

export interface PolarAttachInvalidationTarget {
  kind: PolarAttachKind;
  workoutId: number;
  sessionDate?: string;
  sessionTitle?: string;
}

/** Invalidate workout lists, availability, and HR series after Polar attach completes. */
export async function invalidateAfterPolarAttach(
  qc: QueryClient,
  target: PolarAttachInvalidationTarget,
): Promise<void> {
  await qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });

  if (target.kind === "cardio") {
    await qc.invalidateQueries({ queryKey: ["cardio"] });
    await qc.invalidateQueries({ queryKey: queryKeys.cardioHr(target.workoutId) });
    await qc.invalidateQueries({ queryKey: queryKeys.cardioGps(target.workoutId) });
    await qc.invalidateQueries({ queryKey: ["cardio", "availability"] });
    return;
  }

  await qc.invalidateQueries({ queryKey: ["strength"] });
  await qc.invalidateQueries({ queryKey: queryKeys.strengthHr(target.workoutId) });
  if (target.sessionDate && target.sessionTitle) {
    await qc.invalidateQueries({
      queryKey: queryKeys.strengthHrSession(target.sessionDate, target.sessionTitle),
    });
    await qc.invalidateQueries({
      queryKey: queryKeys.strengthDetail(target.sessionDate, target.sessionTitle),
    });
  }
}
