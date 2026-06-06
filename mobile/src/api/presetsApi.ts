import {apiFetch} from './client';
import {isOnline} from '../services/network';
import {getCachedPresets, upsertPresetsCache} from '../database/strengthStore';

export interface WorkoutPreset {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
  workout_count: number;
  exercises?: Array<{
    exercise: string;
    default_sets?: number;
    default_reps?: string;
    default_weight?: number | null;
  }>;
}

export interface PresetCreatePayload {
  name: string;
  exercises: Array<{
    exercise: string;
    default_sets?: number;
    default_reps?: string;
    default_weight?: number | null;
  }>;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function fetchAllPresets(activeOnly?: boolean): Promise<WorkoutPreset[]> {
  const sp =
    activeOnly === undefined ? '' : `?active_only=${activeOnly ? 'true' : 'false'}`;
  if (await isOnline()) {
    const data = await jsonOrThrow<WorkoutPreset[]>(
      await apiFetch(`/api/presets${sp}`),
    );
    await upsertPresetsCache(data.map(p => ({id: p.id, name: p.name})));
    return data;
  }
  const cached = await getCachedPresets();
  return cached.map(p => ({
    id: p.id,
    name: p.name,
    is_active: 1,
    sort_order: 0,
    workout_count: 0,
  }));
}

export async function fetchPresetDetail(id: number): Promise<WorkoutPreset> {
  return jsonOrThrow<WorkoutPreset>(await apiFetch(`/api/presets/${id}`));
}

export async function createPreset(body: PresetCreatePayload) {
  const res = await apiFetch('/api/presets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<WorkoutPreset>(res);
}

export async function archivePreset(id: number) {
  const res = await apiFetch(`/api/presets/${id}/archive`, {method: 'POST'});
  return jsonOrThrow<WorkoutPreset>(res);
}

export async function restorePreset(id: number) {
  const res = await apiFetch(`/api/presets/${id}/restore`, {method: 'POST'});
  return jsonOrThrow<WorkoutPreset>(res);
}

export async function deletePreset(id: number): Promise<void> {
  const res = await apiFetch(`/api/presets/${id}`, {method: 'DELETE'});
  if (!res.ok) {
    throw new Error(await res.text());
  }
}
