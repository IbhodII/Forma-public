import {apiFetch} from './client';
import {
  enqueueStretchingLog,
  cacheStretchingLog,
  getCachedStretchingLog,
} from '../database/stretchingStore';
import {isOnline} from '../services/network';
import {localFirstWrite} from '../sync/localFirstWrite';
import type {
  StretchingActivityDay,
  StretchingExercise,
  StretchingLogEntry,
  StretchingPreset,
  StretchingPresetExercise,
} from '../types/stretching';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchStretchingExercises(muscleGroup?: string) {
  const suffix = muscleGroup
    ? `?muscle_group=${encodeURIComponent(muscleGroup)}`
    : '';
  const res = await apiFetch(`/api/stretching/exercises${suffix}`);
  return jsonOrThrow<StretchingExercise[]>(res);
}

export async function updateStretchingExercise(
  id: number,
  body: {
    name: string;
    target_muscle_group?: string | null;
    description?: string | null;
    images?: string[];
  },
) {
  const res = await apiFetch(`/api/stretching/exercises/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<StretchingExercise>(res);
}

export async function fetchStretchingPresets(activeOnly?: boolean) {
  const suffix =
    activeOnly === undefined ? '' : `?active_only=${activeOnly ? 'true' : 'false'}`;
  const res = await apiFetch(`/api/stretching/presets${suffix}`);
  return jsonOrThrow<StretchingPreset[]>(res);
}

export async function fetchStretchingPreset(id: number) {
  const res = await apiFetch(`/api/stretching/presets/${id}`);
  return jsonOrThrow<StretchingPreset>(res);
}

export async function createStretchingPreset(body: {
  name: string;
  exercises: StretchingPresetExercise[];
}) {
  const res = await apiFetch('/api/stretching/presets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<StretchingPreset>(res);
}

export async function updateStretchingPreset(
  id: number,
  body: Partial<{
    name: string;
    exercises: StretchingPresetExercise[];
    sort_order: number;
  }>,
) {
  const res = await apiFetch(`/api/stretching/presets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<StretchingPreset>(res);
}

export async function archiveStretchingPreset(id: number) {
  const res = await apiFetch(`/api/stretching/presets/${id}/archive`, {method: 'POST'});
  return jsonOrThrow<StretchingPreset>(res);
}

export async function fetchStretchingLog(days = 30) {
  if (await isOnline()) {
    try {
      const res = await apiFetch(`/api/stretching/log?days=${days}`);
      const data = await jsonOrThrow<StretchingLogEntry[]>(res);
      await cacheStretchingLog(data, days);
      return data;
    } catch {
      return getCachedStretchingLog(days);
    }
  }
  return getCachedStretchingLog(days);
}

export async function createStretchingLog(body: {
  date: string;
  preset_id: number;
  duration_minutes?: number | null;
  notes?: string | null;
}) {
  return localFirstWrite({
    persist: async () => {
      const localId = await enqueueStretchingLog(body);
      return {
        id: -localId,
        date: body.date,
        preset_id: body.preset_id,
        preset_name: 'Сохранено',
        duration_minutes: body.duration_minutes ?? null,
        notes: body.notes ?? '',
      };
    },
  });
}

export async function fetchStretchingActivity(days = 365) {
  const res = await apiFetch(`/api/stretching/activity?days=${days}`);
  return jsonOrThrow<StretchingActivityDay[]>(res);
}
