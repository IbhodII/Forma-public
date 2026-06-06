import { fetchCardioWorkouts } from "../api/cardio";
import {
  attachPolarToCardio,
  attachPolarToStrength,
  isPolarCardioType,
  isPolarStrengthType,
  type PolarPendingListItem,
} from "../api/polar";
import { fetchSessionDetail, fetchSessions } from "../api/strength";
import { CARDIO_SOURCE_FIT } from "../utils/constants";
import type { PolarAttachInvalidationTarget } from "./polarQueryInvalidation";

export interface ManualWorkoutCandidate {
  kind: "cardio" | "strength";
  id: number;
  label: string;
  sessionDate?: string;
  sessionTitle?: string;
}

export function groupPolarPendingByDate(
  items: PolarPendingListItem[],
): Map<string, PolarPendingListItem[]> {
  const map = new Map<string, PolarPendingListItem[]>();
  for (const item of items) {
    const date = item.date ?? "";
    if (!date) continue;
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return map;
}

export async function getManualWorkoutCandidates(
  item: PolarPendingListItem,
): Promise<ManualWorkoutCandidate[]> {
  const date = item.date ?? "";
  if (!date) return [];

  if (isPolarStrengthType(item.type)) {
    const res = await fetchSessions({
      limit: 50,
      offset: 0,
      date_from: date,
      date_to: date,
    });
    const out: ManualWorkoutCandidate[] = [];
    for (const s of res.items) {
      const detail = await fetchSessionDetail(s.date, s.workout_title);
      const workoutId = detail.anchor_row_id ?? detail.hr_workout_id;
      if (!workoutId) continue;
      out.push({
        kind: "strength",
        id: workoutId,
        label: s.workout_title || "Без названия",
        sessionDate: s.date,
        sessionTitle: s.workout_title,
      });
    }
    return out;
  }

  if (!isPolarCardioType(item.type)) return [];

  const res = await fetchCardioWorkouts({
    limit: 50,
    offset: 0,
    date_from: date,
    date_to: date,
    type: item.type ?? undefined,
  });
  return res.items
    .filter((w) => w.data_source !== CARDIO_SOURCE_FIT)
    .map((w) => ({
      kind: "cardio" as const,
      id: w.id,
      label: `${w.type} · ${w.distance_km} км`,
    }));
}

export async function attachPolarItemToWorkout(
  item: PolarPendingListItem,
  workoutId: number,
  kind: "cardio" | "strength",
) {
  if (kind === "cardio") {
    return attachPolarToCardio(workoutId, item.polar_transaction_id);
  }
  return attachPolarToStrength(workoutId, item.polar_transaction_id);
}

export interface PolarAutoAttachResult {
  attachedCount: number;
  attachedTargets: PolarAttachInvalidationTarget[];
  anyMissingHrChart: boolean;
  /** Один Polar за день, но несколько ручных тренировок — нужен выбор */
  pickManualFor: PolarPendingListItem | null;
  /** Несколько Polar за один день — нужна привязка по каждой */
  multiPolarDates: Array<{ date: string; items: PolarPendingListItem[] }>;
}

export async function runPolarAutoAttach(
  items: PolarPendingListItem[],
): Promise<PolarAutoAttachResult> {
  const byDate = groupPolarPendingByDate(items);
  let attachedCount = 0;
  const attachedTargets: PolarAttachInvalidationTarget[] = [];
  let anyMissingHrChart = false;
  let pickManualFor: PolarPendingListItem | null = null;
  const multiPolarDates: Array<{ date: string; items: PolarPendingListItem[] }> = [];

  for (const [date, dateItems] of byDate) {
    if (dateItems.length > 1) {
      multiPolarDates.push({ date, items: dateItems });
      continue;
    }

    const item = dateItems[0];
    const candidates = await getManualWorkoutCandidates(item);
    if (candidates.length === 1) {
      const attachRes = await attachPolarItemToWorkout(
        item,
        candidates[0].id,
        candidates[0].kind,
      );
      if (!attachRes.has_hr_chart) {
        anyMissingHrChart = true;
      }
      attachedTargets.push({
        kind: candidates[0].kind,
        workoutId: candidates[0].id,
        sessionDate: candidates[0].sessionDate,
        sessionTitle: candidates[0].sessionTitle,
      });
      attachedCount += 1;
    } else if (candidates.length > 1 && !pickManualFor) {
      pickManualFor = item;
    }
  }

  return {
    attachedCount,
    attachedTargets,
    anyMissingHrChart,
    pickManualFor,
    multiPolarDates,
  };
}

export function filterPendingForWorkout(
  items: PolarPendingListItem[],
  date: string,
  type: string,
): PolarPendingListItem[] {
  return items.filter((p) => p.date === date && p.type === type);
}
