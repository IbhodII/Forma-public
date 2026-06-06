import { apiClient } from "./client";
import type {
  StretchingActivityDay,
  StretchingExercise,
  StretchingLogEntry,
  StretchingPreset,
  StretchingPresetExercise,
} from "../types";

export async function fetchStretchingExercises(muscleGroup?: string) {
  const { data } = await apiClient.get<StretchingExercise[]>("/stretching/exercises", {
    params: muscleGroup ? { muscle_group: muscleGroup } : {},
  });
  return data;
}

export async function uploadStretchingImage(file: File): Promise<{ path: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<{ path: string }>("/stretching/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
  return data;
}

export async function createStretchingExercise(body: {
  name: string;
  target_muscle_group?: string | null;
  description?: string | null;
  images?: string[];
}) {
  const { data } = await apiClient.post<StretchingExercise>("/stretching/exercises", body);
  return data;
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
  const { data } = await apiClient.put<StretchingExercise>(`/stretching/exercises/${id}`, body);
  return data;
}

export async function deleteStretchingExercise(id: number) {
  await apiClient.delete(`/stretching/exercises/${id}`);
}

export async function fetchStretchingPresets(activeOnly?: boolean) {
  const { data } = await apiClient.get<StretchingPreset[]>("/stretching/presets", {
    params: activeOnly === undefined ? {} : { active_only: activeOnly },
  });
  return data;
}

export async function fetchStretchingPreset(id: number) {
  const { data } = await apiClient.get<StretchingPreset>(`/stretching/presets/${id}`);
  return data;
}

export async function createStretchingPreset(body: {
  name: string;
  exercises: StretchingPresetExercise[];
}) {
  const { data } = await apiClient.post<StretchingPreset>("/stretching/presets", body);
  return data;
}

export async function updateStretchingPreset(
  id: number,
  body: Partial<{ name: string; exercises: StretchingPresetExercise[]; sort_order: number }>,
) {
  const { data } = await apiClient.put<StretchingPreset>(`/stretching/presets/${id}`, body);
  return data;
}

export async function archiveStretchingPreset(id: number) {
  const { data } = await apiClient.post<StretchingPreset>(`/stretching/presets/${id}/archive`);
  return data;
}

export async function restoreStretchingPreset(id: number) {
  const { data } = await apiClient.post<StretchingPreset>(`/stretching/presets/${id}/restore`);
  return data;
}

export async function deleteStretchingPreset(id: number) {
  await apiClient.delete(`/stretching/presets/${id}`);
}

export async function fetchStretchingLog(params?: {
  days?: number;
  date_from?: string;
  date_to?: string;
}) {
  const { data } = await apiClient.get<StretchingLogEntry[]>("/stretching/log", { params: params ?? {} });
  return data;
}

export async function createStretchingLog(body: {
  date: string;
  preset_id: number;
  duration_minutes?: number | null;
  notes?: string | null;
}) {
  const { data } = await apiClient.post<StretchingLogEntry>("/stretching/log", body);
  return data;
}

export async function deleteStretchingLog(logId: number) {
  await apiClient.delete(`/stretching/log/${logId}`);
}

export async function fetchStretchingActivity(days = 365) {
  const { data } = await apiClient.get<StretchingActivityDay[]>("/stretching/activity", {
    params: { days },
  });
  return data;
}
