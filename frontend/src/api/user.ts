import { apiClient } from "./client";

export interface HeartRateZone {
  id: string;
  name: string;
  pct_min: number;
  pct_max: number;
  min_bpm: number;
  max_bpm: number;
}

export type Sex = "male" | "female";
export type CloudSyncProvider = "yandex" | "google";
/** metric — кг, см, км, °C; american — экспериментальный режим (пока только хранение). */
export type UnitsSystem = "metric" | "american";

export interface UserProfile {
  id: number;
  date_of_birth: string | null;
  height_cm: number | null;
  max_heart_rate: number | null;
  updated_at: string | null;
  effective_max_heart_rate: number;
  max_hr_source: "profile" | "formula" | "default" | string;
  heart_rate_zones: HeartRateZone[];
  sex: Sex;
  week_start_day: number;
  week_start_label?: string | null;
  cloud_sync_provider: CloudSyncProvider;
  units_system: UnitsSystem;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  effective_display_name: string | null;
  max_deficit_per_kg_fat?: number | null;
  max_physiological_deficit_per_kg_fat?: number | null;
  target_bulk_grams_per_week?: number | null;
  use_chest_strap_priority?: boolean;
}

export interface UserProfileUpdate {
  date_of_birth?: string | null;
  height_cm?: number | null;
  max_heart_rate?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  sex?: Sex;
  week_start_day?: number;
  cloud_sync_provider?: CloudSyncProvider;
  units_system?: UnitsSystem;
  max_deficit_per_kg_fat?: number | null;
  max_physiological_deficit_per_kg_fat?: number | null;
  target_bulk_grams_per_week?: number | null;
  use_chest_strap_priority?: boolean;
}

export async function fetchUserProfile() {
  const { data } = await apiClient.get<UserProfile>("/user/profile");
  return data;
}

export async function saveUserProfile(body: UserProfileUpdate) {
  const { data } = await apiClient.post<UserProfile>("/user/profile", body);
  return data;
}

export type ActivityLevel = "sedentary" | "active";

export interface NutritionSettings {
  protein_gram_per_kg: number | null;
  fat_gram_per_kg: number | null;
  carbs_gram_per_kg: number | null;
  activity_level: ActivityLevel | null;
}

export interface NutritionSettingsSave {
  protein_gram_per_kg?: number | null;
  fat_gram_per_kg?: number | null;
  carbs_gram_per_kg?: number | null;
  activity_level?: ActivityLevel | null;
}

export interface LevelRecommendations {
  bmr: number;
  tdee: number;
  protein_grams_per_kg: number;
  fat_grams_per_kg: number;
  carbs_grams_per_kg: number;
  protein_grams: number;
  fat_grams: number;
  carbs_grams: number;
  calories: number;
  activity_level: ActivityLevel;
}

export interface LevelCalculationResponse {
  status: "ok" | "missing_data" | string;
  missing_fields: string[];
  missing_hints: string[];
  recommendations: LevelRecommendations | null;
}

export async function fetchNutritionSettings() {
  const { data } = await apiClient.get<NutritionSettings>("/user/nutrition-settings");
  return data;
}

export async function saveNutritionSettings(body: NutritionSettingsSave) {
  const { data } = await apiClient.post<NutritionSettings>("/user/nutrition-settings", body);
  return data;
}

export async function calculateUserLevel() {
  const { data } = await apiClient.post<LevelCalculationResponse>("/user/calculate-level", {});
  return data;
}

export interface BraceletCalibrationStatus {
  factor: number;
  last_calibration_date: string | null;
  calibration_stale: boolean;
}

export interface BraceletCalibrationRecalculateResult {
  old_factor: number;
  new_factor: number;
  last_calibration_date: string;
  window_start?: string | null;
  window_end?: string | null;
  predicted_deficit_kcal?: number | null;
  observed_deficit_kcal?: number | null;
  total_intake_kcal?: number | null;
  total_predicted_expenditure_kcal?: number | null;
  weight_measurements?: number | null;
  food_days?: number | null;
  bracelet_days?: number | null;
  status?: string | null;
  note?: string | null;
}

export async function fetchBraceletCalibration() {
  const { data } = await apiClient.get<BraceletCalibrationStatus>("/user/calibration-factor");
  return data;
}

export async function recalculateBraceletCalibration(
  days = 14,
  phase: "cut" | "bulk" = "cut",
) {
  const { data } = await apiClient.post<BraceletCalibrationRecalculateResult>(
    "/user/recalculate-calibration",
    null,
    { params: { days, phase } },
  );
  return data;
}

export interface IntegrationSettings {
  fit_folder_path: string | null;
  effective_fit_folder_path: string | null;
}

export interface IntegrationSettingsSave {
  fit_folder_path?: string | null;
}

export async function fetchIntegrationSettings() {
  const { data } = await apiClient.get<IntegrationSettings>("/user/integration-settings");
  return data;
}

export async function saveIntegrationSettings(body: IntegrationSettingsSave) {
  const { data } = await apiClient.post<IntegrationSettings>("/user/integration-settings", body);
  return data;
}

export interface BackupSettings {
  backup_folder_path: string | null;
  last_backup_date: string | null;
}

export interface BackupSettingsSave {
  backup_folder_path?: string | null;
}

export interface BackupNowResult {
  success: boolean;
  backup_path?: string | null;
  backup_name?: string | null;
  error?: string | null;
}

export async function fetchBackupSettings() {
  const { data } = await apiClient.get<BackupSettings>("/user/backup-settings");
  return data;
}

export async function saveBackupSettings(backup_folder_path: string | null) {
  const { data } = await apiClient.post<BackupSettings>("/user/backup-settings", {
    backup_folder_path,
  });
  return data;
}

export async function runBackupNow() {
  const { data } = await apiClient.post<BackupNowResult>("/user/backup/now");
  return data;
}

export interface HcAnalyticsPrefs {
  use_in_analytics: boolean;
  steps: boolean;
  sleep: boolean;
  heart_rate: boolean;
  active_calories: boolean;
  workout_calories: boolean;
  total_calories: boolean;
  weight: boolean;
}

export const DEFAULT_HC_ANALYTICS_PREFS: HcAnalyticsPrefs = {
  use_in_analytics: false,
  steps: false,
  sleep: false,
  heart_rate: false,
  active_calories: false,
  workout_calories: false,
  total_calories: false,
  weight: false,
};

export const HC_ANALYTICS_METRIC_KEYS = [
  "steps",
  "sleep",
  "heart_rate",
  "active_calories",
  "workout_calories",
  "total_calories",
  "weight",
] as const;

export interface AnalyticsSettings {
  include_warmup_in_analytics: boolean;
  hc_analytics: HcAnalyticsPrefs;
}

export interface AnalyticsSettingsSave {
  include_warmup_in_analytics?: boolean;
  hc_analytics?: Partial<HcAnalyticsPrefs>;
}

export async function fetchAnalyticsSettings() {
  const { data } = await apiClient.get<AnalyticsSettings>("/user/analytics-settings");
  return data;
}

export async function saveAnalyticsSettings(body: AnalyticsSettingsSave) {
  const { data } = await apiClient.post<AnalyticsSettings>("/user/analytics-settings", body);
  return data;
}

export type { SourcePriorityPrefs } from "../utils/workoutSources";

export async function fetchSourcePriorities() {
  const { data } = await apiClient.get<import("../utils/workoutSources").SourcePriorityPrefs>(
    "/user/source-priorities",
  );
  return data;
}

export async function saveSourcePriorities(body: import("../utils/workoutSources").SourcePriorityPrefs) {
  const { data } = await apiClient.put<import("../utils/workoutSources").SourcePriorityPrefs>(
    "/user/source-priorities",
    body,
  );
  return data;
}

export interface BikeSettings {
  id: number;
  user_id: number;
  bike_weight_kg: number;
  rider_weight_kg: number | null;
  tire_type: string;
  tire_width_mm: number;
  wheel_size_inch: number;
  default_route_surface: string;
  created_at?: string | null;
  updated_at?: string | null;
  suggested_rider_weight_kg?: number | null;
  effective_rider_weight_kg?: number | null;
  effective_crr?: number | null;
  tire_options?: { tire_type: string; crr: number; description: string }[];
  surface_options?: { surface: string; crr_multiplier: number; description: string }[];
}

export type BikeSettingsSave = Partial<{
  bike_weight_kg: number;
  rider_weight_kg: number | null;
  tire_type: string;
  tire_width_mm: number;
  wheel_size_inch: number;
  default_route_surface: string;
}>;

export async function fetchBikeSettings() {
  const { data } = await apiClient.get<BikeSettings>("/user/bike-settings");
  return data;
}

export async function saveBikeSettings(body: BikeSettingsSave) {
  const { data } = await apiClient.post<BikeSettings>("/user/bike-settings", body);
  return data;
}
