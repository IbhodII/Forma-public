import {haptics} from './trigger';

/** Call after a successful save mutation — subtle double-tap, not a full celebration. */
export function notifySave(): void {
  haptics.save();
}

/** Workout set logged — centralized so UI does not double-fire. */
export function notifySetComplete(): void {
  haptics.setComplete();
}
