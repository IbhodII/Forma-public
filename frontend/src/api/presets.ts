import { apiClient } from "./client";

import type { PresetExercise, PresetSet } from "../types";

export type { PresetExercise, PresetSet };

export interface WorkoutPreset {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
  workout_count: number;
  created_at: string | null;
  updated_at: string | null;
  exercises?: PresetExercise[];
}

export interface PresetCreatePayload {
  name: string;
  exercises: Omit<PresetExercise, "id">[];
}

export interface PresetUpdatePayload {
  name?: string;
  exercises?: Omit<PresetExercise, "id">[];
  sort_order?: number;
}

export async function fetchPresets(activeOnly?: boolean) {
  const { data } = await apiClient.get<WorkoutPreset[]>("/presets", {
    params: activeOnly === undefined ? {} : { active_only: activeOnly },
  });
  return data;
}

export async function fetchPreset(id: number) {
  const { data } = await apiClient.get<WorkoutPreset>(`/presets/${id}`);
  return data;
}

export async function createPreset(body: PresetCreatePayload) {
  const { data } = await apiClient.post<WorkoutPreset>("/presets", body);
  return data;
}

export async function updatePreset(id: number, body: PresetUpdatePayload) {
  const { data } = await apiClient.put<WorkoutPreset>(`/presets/${id}`, body);
  return data;
}

export async function archivePreset(id: number) {
  const { data } = await apiClient.post<WorkoutPreset>(`/presets/${id}/archive`);
  return data;
}

export async function restorePreset(id: number) {
  const { data } = await apiClient.post<WorkoutPreset>(`/presets/${id}/restore`);
  return data;
}

export async function deletePreset(id: number) {
  await apiClient.delete(`/presets/${id}`);
}
