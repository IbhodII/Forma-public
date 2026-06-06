import {apiFetch} from './client';
import {
  cacheCardioWorkouts,
  getCachedCardioWorkouts,
} from '../database/cardioStore';
import {isOnline} from '../services/network';
import type {
  CardioAvailability,
  CardioPaginated,
  CardioTypeSetting,
  CardioWorkout,
  CardioWorkoutCreate,
  HeartRateResponse,
  WorkoutPointsResponse,
  WorkoutPowerResponse,
  WorkoutSensors,
} from '../types/cardio';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchCardioWorkouts(params?: {
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
  type?: string;
}): Promise<CardioPaginated> {
  const sp = new URLSearchParams();
  sp.set('limit', String(params?.limit ?? 100));
  sp.set('offset', String(params?.offset ?? 0));
  if (params?.date_from) {
    sp.set('date_from', params.date_from);
  }
  if (params?.date_to) {
    sp.set('date_to', params.date_to);
  }
  if (params?.type) {
    sp.set('type', params.type);
  }
  if (await isOnline()) {
    try {
      const data = await jsonOrThrow<CardioPaginated>(
        await apiFetch(`/api/cardio/workouts?${sp.toString()}`),
      );
      await cacheCardioWorkouts(data.items || []);
      return data;
    } catch {
      // fallback
    }
  }
  const items = await getCachedCardioWorkouts();
  return {items, meta: {total: items.length, limit: 100, offset: 0}};
}

export async function fetchCardioTypes(): Promise<string[]> {
  if (!(await isOnline())) {
    const items = await getCachedCardioWorkouts();
    return [...new Set(items.map(w => w.type))].sort();
  }
  return jsonOrThrow<string[]>(await apiFetch('/api/cardio/types'));
}

export async function fetchCardioTabSettings(activeOnly = true): Promise<CardioTypeSetting[]> {
  const sp = activeOnly ? '?active_only=true' : '';
  if (!(await isOnline())) {
    return [];
  }
  return jsonOrThrow<CardioTypeSetting[]>(
    await apiFetch(`/api/cardio/tab-settings${sp}`),
  );
}

export async function createCardioWorkout(body: CardioWorkoutCreate) {
  const res = await apiFetch('/api/cardio/workout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{id: number; message: string}>(res);
}

export async function updateCardioWorkout(
  id: number,
  body: Partial<CardioWorkoutCreate>,
): Promise<CardioWorkout> {
  const res = await apiFetch(`/api/cardio/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<CardioWorkout>(res);
}

export async function deleteCardioWorkout(id: number): Promise<void> {
  const res = await apiFetch(`/api/cardio/${id}`, {method: 'DELETE'});
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function archiveCardioTabType(type: string) {
  const res = await apiFetch(
    `/api/cardio/tab-settings/${encodeURIComponent(type)}/archive`,
    {method: 'POST'},
  );
  return jsonOrThrow<CardioTypeSetting>(res);
}

export async function restoreCardioTabType(type: string) {
  const res = await apiFetch(
    `/api/cardio/tab-settings/${encodeURIComponent(type)}/restore`,
    {method: 'POST'},
  );
  return jsonOrThrow<CardioTypeSetting>(res);
}

export async function fetchCardioWorkoutById(id: number): Promise<CardioWorkout | null> {
  const cached = await getCachedCardioWorkouts();
  const hit = cached.find(w => w.id === id);
  if (hit) {
    return hit;
  }
  if (await isOnline()) {
    try {
      const data = await jsonOrThrow<CardioPaginated>(
        await apiFetch(`/api/cardio/workouts?limit=500&offset=0`),
      );
      await cacheCardioWorkouts(data.items || []);
      return (data.items || []).find(w => w.id === id) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchCardioAvailability(ids: number[]): Promise<CardioAvailability> {
  if (!ids.length) {
    return {heart_rate_ids: [], gps_ids: [], sensor_ids: [], items: []};
  }
  const sp = new URLSearchParams();
  sp.set('ids', ids.join(','));
  const res = await apiFetch(`/api/cardio/availability?${sp.toString()}`);
  return jsonOrThrow<CardioAvailability>(res);
}

export async function fetchHeartRate(workoutId: number): Promise<HeartRateResponse> {
  const res = await apiFetch(`/api/cardio/${workoutId}/hr`);
  return jsonOrThrow<HeartRateResponse>(res);
}

export async function fetchGps(workoutId: number): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/cardio/${workoutId}/gps`);
  return jsonOrThrow<Record<string, unknown>>(res);
}

export async function fetchWorkoutSensors(
  workoutId: number,
  downsample = 2,
): Promise<WorkoutSensors> {
  const sp = new URLSearchParams();
  sp.set('downsample', String(downsample));
  const res = await apiFetch(`/api/cardio/${workoutId}/sensors?${sp.toString()}`);
  return jsonOrThrow<WorkoutSensors>(res);
}

export async function fetchWorkoutPoints(
  workoutId: number,
  downsample = 2,
): Promise<WorkoutPointsResponse> {
  const sp = new URLSearchParams();
  sp.set('downsample', String(downsample));
  const res = await apiFetch(`/api/cardio/${workoutId}/points?${sp.toString()}`);
  return jsonOrThrow<WorkoutPointsResponse>(res);
}

export async function fetchWorkoutPower(workoutId: number): Promise<WorkoutPowerResponse> {
  const res = await apiFetch(`/api/cardio/${workoutId}/power`);
  return jsonOrThrow<WorkoutPowerResponse>(res);
}
