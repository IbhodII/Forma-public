/** Types aligned with backend Pydantic models */

import type { HeartRateZone } from "../api/user";

export interface PaginatedMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginatedMeta;
}

export interface StrengthSession {
  date: string;
  workout_title: string;
  avg_hr: number | null;
  calories_chest: number | null;
  calories_watch: number | null;
  sets_count: number;
  volume_kg?: number | null;
  has_hr?: boolean;
  duration_sec?: number | null;
}

export interface StrengthSetBlock {
  weight: number;
  reps_str: string;
  is_warmup?: boolean;
  duration_sec?: number | null;
  is_bodyweight?: boolean;
}

export interface StrengthExerciseRow {
  exercise: string;
  weight: number;
  reps_str: string;
  is_bodyweight?: boolean;
  warmup_sets?: StrengthSetBlock[];
  working_sets?: StrengthSetBlock[];
}

export interface PresetSet {
  set_number: number;
  reps: number;
  weight: number | null;
  duration_sec?: number | null;
  is_warmup: boolean;
}

export interface StrengthOrderedSetRow {
  order_index: number;
  set_number: number;
  exercise: string;
  weight: number;
  reps: number;
  reps_str: string;
  is_warmup: boolean;
  is_bodyweight: boolean;
  duration_sec?: number | null;
  block_uid?: string | null;
  block_type?: "normal" | "superset" | "circuit" | null;
  block_order?: number | null;
  block_rounds?: number | null;
  block_exercise_order?: number | null;
  round_index?: number | null;
  block_title?: string | null;
}

export interface StrengthSessionDetail {
  date: string;
  workout_title: string;
  exercises: StrengthExerciseRow[];
  ordered_sets?: StrengthOrderedSetRow[];
  uses_ordered_sets?: boolean;
  is_circuit?: boolean;
  avg_hr: number | null;
  calories_chest: number | null;
  calories_watch: number | null;
  has_hr?: boolean;
  hr_workout_id?: number | null;
  anchor_row_id?: number | null;
  duration_sec?: number | null;
}

export type StrengthHrConfidence = "high" | "medium" | "low" | null;
export type StrengthHrMatchQuality = "exact" | "partial" | "blocks_only";

export interface StrengthHrMatchedSet {
  exercise: string;
  set_number: number;
  weight: number;
  reps_str: string;
  load_display: string;
  is_warmup: boolean;
}

export interface StrengthHrBlockDebug {
  raw_peaks_count: number;
  raw_blocks_count: number;
  merged_blocks_count: number;
  expected_set_count: number | null;
  merge_reasons: string[];
  adaptive_passes_used?: number;
}

export interface StrengthHrDetectedBlock {
  block_index: number;
  block_id?: number;
  start_sec: number;
  end_sec: number;
  duration_sec?: number | null;
  peak_hr: number | null;
  avg_hr: number | null;
  min_hr: number | null;
  hr_rise: number | null;
  recovery_drop: number | null;
  recovery_time: number | null;
  confidence: string;
  confidence_reason?: string | null;
  matched_order_index: number | null;
  matched_exercise: string | null;
  matched_set_number: number | null;
  matched_load_display: string | null;
  is_warmup: boolean;
  matched_set?: StrengthHrMatchedSet | null;
  kind?: "set" | "rest" | "noise" | null;
}

export interface StrengthHrSetMetrics {
  order_index: number;
  set_number: number;
  exercise: string;
  weight: number;
  reps_str: string;
  load_display: string;
  is_warmup: boolean;
  start_sec: number;
  end_sec: number;
  peak_hr: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  hr_rise: number | null;
  zone_seconds: Record<string, number> | null;
  strain_score: number | null;
  recovery_drop: number | null;
  recovery_time: number | null;
  recovery_delta_bpm: number | null;
  confidence: string;
}

export interface StrengthHrExerciseMetrics {
  exercise: string;
  sets_count: number;
  avg_peak_hr: number | null;
  highest_hr_set: { order_index: number; max_hr: number | null } | null;
  avg_recovery_delta: number | null;
  cardiovascular_load_estimate: number | null;
}

export interface StrengthHrComparisonItem {
  exercise: string;
  current_peak_hr: number | null;
  previous_peak_hr: number | null;
  delta_bpm: number | null;
  prior_sessions_count: number;
}

export interface StrengthHrAnalysisResponse {
  date: string;
  workout_title: string;
  confidence: StrengthHrConfidence;
  confidence_reason?: string | null;
  confidence_reasons?: string[];
  disclaimer: string | null;
  warnings: string[];
  duration_sec: number | null;
  detection_mode: string;
  match_quality: StrengthHrMatchQuality;
  detected_count: number;
  expected_count: number | null;
  hr_available?: boolean;
  hr_samples_count?: number;
  ordered_sets_count?: number;
  detected_blocks_count?: number;
  thresholds_used?: Record<string, number> | null;
  debug?: StrengthHrBlockDebug | null;
  detected_blocks: StrengthHrDetectedBlock[];
  sets: StrengthHrSetMetrics[];
  exercises: StrengthHrExerciseMetrics[];
  comparison: StrengthHrComparisonItem[];
  comparison_available: boolean;
  overrides_applied?: boolean;
  auto_detected_blocks?: StrengthHrDetectedBlock[] | null;
  mapping_status?: "auto" | "verified" | "manual";
  has_verified_mapping?: boolean;
  has_manual_mapping?: boolean;
}

export interface StrengthHrSessionSummary {
  date: string;
  workout_title: string;
  duration_sec: number | null;
  detected_blocks_count: number;
  verified_blocks_count: number;
  avg_peak_hr: number | null;
  max_hr: number | null;
  avg_recovery_drop: number | null;
  avg_recovery_time: number | null;
  high_intensity_blocks: number;
  confidence: StrengthHrConfidence | null;
  mapping_status: "auto" | "verified" | "manual";
  has_verified_mapping: boolean;
  has_manual_mapping: boolean;
  overrides_applied: boolean;
}

export interface StrengthHrExerciseAggregate {
  exercise: string;
  sessions_count: number;
  sets_count: number;
  avg_peak_hr: number | null;
  max_peak_hr: number | null;
  avg_recovery_drop: number | null;
  trend_direction: "up" | "down" | "stable";
  recovery_trend_direction: "up" | "down" | "stable";
  latest_vs_previous: number | null;
  insight: string | null;
}

export interface StrengthHrTrendPoint {
  date: string;
  workout_title: string;
  avg_peak_hr: number | null;
  max_hr: number | null;
  avg_recovery_drop: number | null;
  block_count: number;
  mapping_status: string;
  confidence: StrengthHrConfidence | null;
}

export interface StrengthHrAnalyticsFilters {
  date_from?: string;
  date_to?: string;
  workout_title?: string;
  exercise?: string;
  verified_only?: boolean;
  min_confidence?: StrengthHrConfidence;
}

export interface StrengthHrAnalyticsOverview {
  sessions: StrengthHrSessionSummary[];
  sessions_total: number;
  sessions_limit: number;
  sessions_offset: number;
  exercises: StrengthHrExerciseAggregate[];
  trends: StrengthHrTrendPoint[];
  truncated: boolean;
}

export interface StrengthSetCreate {
  exercise: string;
  weight?: number | null;
  reps: number;
  notes?: string;
  is_warmup?: boolean;
  duration_sec?: number | null;
  is_bodyweight?: boolean;
  set_number?: number | null;
  block_uid?: string | null;
  block_type?: "normal" | "superset" | "circuit" | null;
  block_order?: number | null;
  block_rounds?: number | null;
  block_exercise_order?: number | null;
  round_index?: number | null;
  block_title?: string | null;
}

export interface StrengthExerciseCreate {
  exercise: string;
  weight?: number | null;
  reps_list: number[];
  notes?: string;
  is_warmup?: boolean;
  duration_sec?: number | null;
  is_bodyweight?: boolean;
}

export interface StrengthWorkoutCreate {
  date: string;
  workout_title: string;
  sets?: StrengthSetCreate[];
  exercises?: StrengthExerciseCreate[];
  avg_hr?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
  preset_id?: number | null;
  is_circuit?: boolean;
  /** При редактировании — исходная сессия (сохранение пульса Polar). */
  edit_session_date?: string;
  edit_session_title?: string;
}

export interface PresetExercise {
  id?: number;
  exercise_name: string;
  exercise_order: number;
  is_bodyweight?: boolean;
  sets?: PresetSet[];
  default_sets?: number;
  default_reps?: string;
  default_weight?: number | null;
  notes: string;
}

export interface WorkoutPreset {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
  /** Число сессий (дата + тип), не подходов */
  workout_count: number;
  exercise_count?: number;
  exercise_names?: string[];
  created_at: string | null;
  updated_at: string | null;
  exercises?: PresetExercise[];
}

export interface CardioTypeSetting {
  type: string;
  is_active: number;
  sort_order: number;
  workout_count: number;
  updated_at: string | null;
}

export interface StrengthProgressPoint {
  date: string;
  max_weight: number;
  max_1rm: number;
  epley_1rm: number;
}

export interface StrengthVolumeDay {
  date: string;
  volume_kg: number;
}

export interface DailyTrimpPoint {
  date: string;
  trimp: number;
}

export interface CtlAtlTsbPoint {
  date: string;
  trimp: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface CtlAtlTsbResponse {
  items: CtlAtlTsbPoint[];
  current: {
    ctl?: number | null;
    atl?: number | null;
    tsb?: number | null;
    /** TRIMP последней кардио-тренировки (не сумма за день). */
    trimp?: number | null;
    last_workout_date?: string | null;
  };
}

export interface TopExerciseProgress {
  exercise: string;
  current_1rm: number | null;
  past_1rm: number | null;
  change: number | null;
  change_percent: number | null;
}

export interface ZoneTimeItem {
  zone_id: string;
  name: string;
  seconds: number;
  minutes: number;
  percent: number;
}

export interface ZoneTimeTypeOption {
  id: string;
  label: string;
}

export interface ZoneTimeResponse {
  days: number;
  max_heart_rate: number;
  workout_type?: string | null;
  zones: HeartRateZone[];
  items: ZoneTimeItem[];
  total_seconds: number;
  available_types?: ZoneTimeTypeOption[];
  workouts_with_hr?: number;
}

export interface CardioWorkout {
  id: number;
  date: string;
  type: string;
  distance_km: number;
  duration_sec: number;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  calories_chest: number | null;
  calories_watch: number | null;
  avg_cadence?: number | null;
  start_time?: string | null;
  data_source?: string | null;
  avg_speed_kmh?: number | null;
  max_speed_kmh?: number | null;
  avg_power?: number | null;
  max_power?: number | null;
  has_power_data?: boolean | null;
  avg_power_watts?: number | null;
  estimated_avg_power_watts?: number | null;
  power_source?: "real" | "estimated" | null;
  swolf?: number | null;
  pace_min_km?: number | null;
  pace_sec_100m?: number | null;
  source_summary?: import("../utils/workoutSources").WorkoutSourceSummary | null;
}

export interface CardioWorkoutCreate {
  date: string;
  type: string;
  distance_km: number;
  duration_min: number;
  duration_sec: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
  avg_cadence?: number | null;
  swolf?: number | null;
}

export type CardioWorkoutUpdate = Partial<CardioWorkoutCreate>;

export interface HeartRatePoint {
  seconds: number;
  heart_rate: number;
  elapsed_sec?: number;
  distance_m?: number | null;
}

export interface HeartRateResponse {
  workout_id: number;
  points: HeartRatePoint[];
  count?: number;
  message?: string | null;
  min_elapsed_sec?: number | null;
  max_elapsed_sec?: number | null;
}

export interface CardioAvailabilityItem {
  id: number;
  has_hr: boolean;
  has_gps: boolean;
  has_sensors: boolean;
}

export interface CardioAvailability {
  heart_rate_ids: number[];
  gps_ids: number[];
  sensor_ids?: number[];
  items?: CardioAvailabilityItem[];
}

export type BodyMetricRow = Record<string, string | number | null | undefined>;

export interface BodyMetricCreate {
  date: string;
  allow_replace?: boolean;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  muscle_mass_kg?: number | null;
  chest_inhale_cm?: number | null;
  chest_exhale_cm?: number | null;
  bicep_relaxed_cm?: number | null;
  bicep_tense_cm?: number | null;
  forearm_relaxed_cm?: number | null;
  forearm_tense_cm?: number | null;
  wrist_cm?: number | null;
  thigh_relaxed_cm?: number | null;
  thigh_tense_cm?: number | null;
  calf_relaxed_cm?: number | null;
  calf_tense_cm?: number | null;
  ankle_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  neck_cm?: number | null;
}

export interface CaloriesAnalyticsRow {
  date: string;
  strength_kcal: number;
  cardio_kcal: number;
  total_kcal: number;
}

export interface ApiErrorBody {
  detail?: string | unknown;
  errors?: unknown[];
}

export interface StretchingExercise {
  id: number;
  name: string;
  original_name?: string | null;
  description: string | null;
  original_description?: string | null;
  target_muscle_group: string | null;
  images_json: string[];
  translated: boolean;
  description_translated: boolean;
}

export interface StretchingPresetExercise {
  id?: number;
  exercise_id: number;
  exercise_name?: string;
  target_muscle_group?: string | null;
  description?: string | null;
  original_description?: string | null;
  images_json?: string[];
  hold_seconds: number;
  reps: number;
  notes: string;
  exercise_order: number;
}

export interface StretchingPreset {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
  exercise_count: number;
  log_count: number;
  created_at: string | null;
  updated_at: string | null;
  exercises?: StretchingPresetExercise[];
}

export interface StretchingLogEntry {
  id: number;
  date: string;
  preset_id: number;
  preset_name: string;
  duration_minutes: number | null;
  notes: string;
}

export interface StretchingActivityDay {
  date: string;
  count: number;
  total_minutes: number;
  level: number;
}
