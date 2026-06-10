import { apiClient } from "./client";
import type {
  CardioAvailability,
  CardioTypeSetting,
  CardioWorkout,
  CardioWorkoutCreate,
  CardioWorkoutUpdate,
  HeartRateResponse,
  PaginatedResponse,
} from "../types";

export interface WorkoutsParams {
  limit: number;
  offset: number;
  date_from?: string;
  date_to?: string;
  type?: string;
}

export async function fetchCardioWorkouts(params: WorkoutsParams) {
  const { data } = await apiClient.get<PaginatedResponse<CardioWorkout>>("/cardio/workouts", {
    params,
  });
  return data;
}

export async function fetchCardioTypes() {
  const { data } = await apiClient.get<string[]>("/cardio/types");
  return data;
}

export async function fetchHeartRate(workoutId: number) {
  const { data } = await apiClient.get<HeartRateResponse>(`/cardio/${workoutId}/hr`);
  return data;
}

export async function fetchGps(workoutId: number) {
  const { data } = await apiClient.get<Record<string, unknown>>(`/cardio/${workoutId}/gps`);
  return data;
}

export interface WorkoutSensors {
  workout_id: number;
  start_time?: string | null;
  elapsed_sec: number[];
  speed_kmh: (number | null)[];
  cadence: (number | null)[];
  elevation_m: (number | null)[];
  temperature_c: (number | null)[];
  distance_m: (number | null)[];
  heart_rate: (number | null)[];
  has_cadence: boolean;
  has_elevation: boolean;
  has_temperature: boolean;
  has_speed: boolean;
}

/** downsample: 1=все, 0=1/сек, 2=1 точка/2 сек (default API). */
export async function fetchWorkoutSensors(workoutId: number, downsample: number = 2) {
  const { data } = await apiClient.get<WorkoutSensors>(`/cardio/${workoutId}/sensors`, {
    params: { downsample },
  });
  return data;
}

export interface WorkoutPointsResponse {
  workout_id: number;
  points: {
    lat: number;
    lon: number;
    elapsed_sec: number;
    speed_kmh?: number | null;
    cadence?: number | null;
    elevation_m?: number | null;
    temperature_c?: number | null;
    heart_rate?: number | null;
    distance_m?: number | null;
    power_watts?: number | null;
  }[];
}

export async function fetchWorkoutPoints(workoutId: number, downsample: number = 2) {
  const { data } = await apiClient.get<WorkoutPointsResponse>(`/cardio/${workoutId}/points`, {
    params: { downsample },
  });
  return data;
}

/** Batch-проверка наличия пульса, GPS и датчиков для списка id. */
export async function fetchCardioAvailability(ids: number[]) {
  if (!ids.length) {
    return {
      heart_rate_ids: [],
      gps_ids: [],
      sensor_ids: [],
      items: [],
    } as CardioAvailability;
  }
  const { data } = await apiClient.get<CardioAvailability>("/cardio/availability", {
    params: { ids: ids.join(",") },
  });
  return data;
}

export async function createCardioWorkout(body: CardioWorkoutCreate) {
  const { data } = await apiClient.post<{ id: number; message: string }>("/cardio/workout", body);
  return data;
}

export async function updateCardioWorkout(id: number, body: CardioWorkoutUpdate) {
  const { data } = await apiClient.put<CardioWorkout>(`/cardio/${id}`, body);
  return data;
}

export async function deleteCardioWorkout(id: number) {
  await apiClient.delete(`/cardio/${id}`);
}

export interface WorkoutPowerResponse {
  workout_id: number;
  has_real: boolean;
  has_estimated: boolean;
  avg_power: number | null;
  source: "real" | "estimated" | null;
  series: { elapsed_sec: number; power_watts: number }[];
}

export async function fetchWorkoutPower(workoutId: number) {
  const { data } = await apiClient.get<WorkoutPowerResponse>(`/cardio/${workoutId}/power`);
  return data;
}

export async function fetchWorkoutSources(workoutId: number) {
  const { data } = await apiClient.get<import("../utils/workoutSources").WorkoutSourceView>(
    `/cardio/${workoutId}/sources`,
  );
  return data;
}

export async function backfillBikePower(limit = 500) {
  const { data } = await apiClient.post<{ estimated: number; skipped: number; already_had_power: number }>(
    "/cardio/backfill-power",
    null,
    { params: { limit } },
  );
  return data;
}

export async function estimateWorkoutPower(workoutId: number) {
  const { data } = await apiClient.post<WorkoutPowerResponse>(`/cardio/${workoutId}/estimate-power`);
  return data;
}

export async function fetchRecentCardio(type: string, limit = 5) {
  const { data } = await apiClient.get<{ items: CardioWorkout[] }>("/cardio/recent", {
    params: { type, limit },
  });
  return data.items;
}

export async function fetchCardioTabSettings(activeOnly?: boolean) {
  const { data } = await apiClient.get<CardioTypeSetting[]>(
    "/cardio/tab-settings",
    { params: activeOnly === undefined ? {} : { active_only: activeOnly } },
  );
  return data;
}

export async function archiveCardioTabType(type: string) {
  const { data } = await apiClient.post<CardioTypeSetting>(
    `/cardio/tab-settings/${encodeURIComponent(type)}/archive`,
  );
  return data;
}

export async function restoreCardioTabType(type: string) {
  const { data } = await apiClient.post<CardioTypeSetting>(
    `/cardio/tab-settings/${encodeURIComponent(type)}/restore`,
  );
  return data;
}
