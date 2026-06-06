import {apiFetch, getApiBaseUrl} from './client';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface UserProfile {
  sex?: 'male' | 'female';
  date_of_birth?: string | null;
  height_cm?: number | null;
  max_heart_rate?: number | null;
  units_system?: 'metric' | 'american';
  week_start_day?: number;
  use_chest_strap_priority?: boolean;
}

export interface NutritionSettings {
  protein_gram_per_kg?: number | null;
  fat_gram_per_kg?: number | null;
  carbs_gram_per_kg?: number | null;
  activity_level?: 'sedentary' | 'active' | null;
}

export interface IntegrationSettings {
  fit_folder_path?: string | null;
  effective_fit_folder_path?: string | null;
}

export interface BikeSettings {
  bike_weight_kg: number;
  rider_weight_kg?: number | null;
  tire_type: string;
  default_route_surface: string;
}

export interface PolarStatus {
  connected: boolean;
  polar_user_id?: string | null;
}

export interface CloudStatus {
  connected: boolean;
  expires_at?: string | null;
}

export async function fetchUserProfile() {
  return jsonOrThrow<UserProfile>(await apiFetch('/api/user/profile'));
}

export async function saveUserProfile(body: Partial<UserProfile>) {
  return jsonOrThrow<UserProfile>(
    await apiFetch('/api/user/profile', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchNutritionSettings() {
  return jsonOrThrow<NutritionSettings>(await apiFetch('/api/user/nutrition-settings'));
}

export async function saveNutritionSettings(body: NutritionSettings) {
  return jsonOrThrow<NutritionSettings>(
    await apiFetch('/api/user/nutrition-settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function calculateUserLevel() {
  return jsonOrThrow<{status: string; recommendations?: Record<string, unknown>}>(
    await apiFetch('/api/user/calculate-level', {method: 'POST'}),
  );
}

export async function fetchIntegrationSettings() {
  return jsonOrThrow<IntegrationSettings>(
    await apiFetch('/api/user/integration-settings'),
  );
}

export async function saveIntegrationSettings(body: Partial<IntegrationSettings>) {
  return jsonOrThrow<IntegrationSettings>(
    await apiFetch('/api/user/integration-settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function runFitImport() {
  return jsonOrThrow<{status: string; task_id?: string; message?: string}>(
    await apiFetch('/api/sync/fit', {method: 'POST'}),
  );
}

export async function fetchBikeSettings() {
  return jsonOrThrow<BikeSettings>(await apiFetch('/api/bike-settings'));
}

export async function saveBikeSettings(body: Partial<BikeSettings>) {
  return jsonOrThrow<BikeSettings>(
    await apiFetch('/api/bike-settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export type HcAnalyticsPrefs = {
  use_in_analytics: boolean;
  steps: boolean;
  sleep: boolean;
  heart_rate: boolean;
  active_calories: boolean;
  workout_calories: boolean;
  total_calories: boolean;
  weight: boolean;
};

export async function fetchAnalyticsSettings() {
  return jsonOrThrow<{
    include_warmup_in_analytics: boolean;
    hc_analytics: HcAnalyticsPrefs;
  }>(await apiFetch('/api/user/analytics-settings'));
}

export async function saveAnalyticsSettings(body: {
  include_warmup_in_analytics?: boolean;
  hc_analytics?: Partial<HcAnalyticsPrefs>;
}) {
  return jsonOrThrow<{include_warmup_in_analytics: boolean}>(
    await apiFetch('/api/user/analytics-settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchPolarStatus() {
  return jsonOrThrow<PolarStatus>(await apiFetch('/api/polar/status'));
}

export async function disconnectPolar() {
  return jsonOrThrow<{message: string}>(await apiFetch('/api/polar/disconnect', {method: 'DELETE'}));
}

export async function getPolarAuthUrl() {
  const base = await getApiBaseUrl();
  return `${base}/api/polar/auth`;
}

export async function fetchYandexStatus() {
  return jsonOrThrow<CloudStatus>(await apiFetch('/api/cloud/status/yandex'));
}

export async function fetchGoogleStatus() {
  return jsonOrThrow<CloudStatus>(await apiFetch('/api/cloud/status/google'));
}

export async function revokeYandex() {
  return jsonOrThrow<{message: string}>(await apiFetch('/api/cloud/revoke/yandex', {method: 'POST'}));
}

export async function revokeGoogle() {
  return jsonOrThrow<{message: string}>(await apiFetch('/api/cloud/revoke/google', {method: 'POST'}));
}

export async function getCloudAuthUrl(provider: 'yandex' | 'google') {
  const base = await getApiBaseUrl();
  return `${base}/api/cloud/auth/${provider}`;
}

export async function backupDatabase(provider: 'yandex' | 'google') {
  return jsonOrThrow<{message?: string}>(
    await apiFetch('/api/cloud/backup', {
      method: 'POST',
      body: JSON.stringify({provider, backup_type: 'database'}),
    }),
  );
}

export async function syncCloudDownload(provider: 'yandex' | 'google') {
  return jsonOrThrow<{message?: string}>(
    await apiFetch('/api/cloud/sync', {
      method: 'POST',
      body: JSON.stringify({provider, direction: 'download'}),
    }),
  );
}
