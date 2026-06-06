import { useQuery } from "@tanstack/react-query";
import {
  fetchCardioAvailability,
  fetchCardioWorkouts,
  type WorkoutsParams,
} from "../api/cardio";
import { queryKeys } from "./queryKeys";

/** Список тренировок — не перезапрашивать при каждом возврате на вкладку. */
export const CARDIO_WORKOUTS_STALE_MS = 60_000;

/** Наличие датчиков меняется редко — дольше держим в кэше. */
export const CARDIO_AVAILABILITY_STALE_MS = 5 * 60_000;

export function useCardioWorkouts(params: WorkoutsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.cardioWorkouts(params),
    queryFn: () => fetchCardioWorkouts(params),
    staleTime: CARDIO_WORKOUTS_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

export function useCardioAvailability(ids: number[]) {
  return useQuery({
    queryKey: queryKeys.cardioAvailability(ids),
    queryFn: () => fetchCardioAvailability(ids),
    enabled: ids.length > 0,
    staleTime: CARDIO_AVAILABILITY_STALE_MS,
  });
}
