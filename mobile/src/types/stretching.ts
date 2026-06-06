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
