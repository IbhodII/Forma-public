import type {CardioAvailability, CardioAvailabilityItem} from '../types/cardio';

export function availabilityForWorkout(
  availability: CardioAvailability | undefined,
  workoutId: number,
): CardioAvailabilityItem {
  const item = availability?.items?.find(i => i.id === workoutId);
  if (item) {
    return item;
  }
  return {
    id: workoutId,
    has_hr: availability?.heart_rate_ids?.includes(workoutId) ?? false,
    has_gps: availability?.gps_ids?.includes(workoutId) ?? false,
    has_sensors: availability?.sensor_ids?.includes(workoutId) ?? false,
  };
}
