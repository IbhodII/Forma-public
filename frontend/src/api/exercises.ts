import { apiClient } from "./client";
import type { PresetSet } from "../types";

export type ExerciseSetBlockType = "normal" | "superset" | "circuit";

export interface ExerciseSetBlockExercise {
  exercise: string;
  reps?: number | null;
  weight?: number | null;
  duration_sec?: number | null;
  is_bodyweight?: boolean;
  is_warmup?: boolean;
}

export interface ExerciseSetBlock {
  id: string;
  type: ExerciseSetBlockType;
  title?: string | null;
  rounds: number;
  exercises: ExerciseSetBlockExercise[];
}

export interface ExerciseSetSummary {
  id: number;
  set_name: string | null;
  effective_from: string;
  effective_to: string | null;
  is_default: number;
  n_exercises: number;
}

export interface ExerciseSetEditorState {
  workout_type: string;
  effective_date: string;
  active_set_id: number | null;
  active_exercises: string[];
  active_blocks?: ExerciseSetBlock[];
  sets: ExerciseSetSummary[];
}

export interface ExerciseSetDetail {
  id: number;
  workout_type: string;
  set_name: string | null;
  effective_from: string;
  effective_to: string | null;
  is_default: number;
  exercises: string[];
  blocks?: ExerciseSetBlock[];
}

export interface WorkoutFormPrefillCircuitStep {
  exercise: string;
  reps: number;
  weight: number | null;
  is_warmup: boolean;
  is_bodyweight: boolean;
  duration_sec?: number | null;
}

export interface WorkoutFormPrefill {
  workout_title: string;
  date: string;
  preset_id?: number | null;
  is_circuit?: boolean;
  circuit_steps?: WorkoutFormPrefillCircuitStep[];
  blocks?: ExerciseSetBlock[];
  exercises: Array<{
    exercise: string;
    last_weight: number | null;
    last_reps: string | null;
    last_date: string | null;
    last_warmup_sets?: Array<{ weight: number; reps_str: string }>;
    default_sets?: number;
    default_reps?: string;
    default_weight?: number | null;
    sets?: PresetSet[];
    is_bodyweight?: boolean;
  }>;
  session_metrics: {
    avg_hr?: number | null;
    calories_chest?: number | null;
    calories_watch?: number | null;
  };
}

export async function fetchWorkoutTypes() {
  const { data } = await apiClient.get<string[]>("/strength/workout-types");
  return data;
}

export async function fetchWorkoutFormPrefill(workoutTitle: string, date: string) {
  const { data } = await apiClient.get<WorkoutFormPrefill>("/strength/workout-form-prefill", {
    params: { workout_title: workoutTitle, date },
  });
  return data;
}

export async function fetchExerciseSetEditor(workoutType: string, effectiveDate: string) {
  const { data } = await apiClient.get<ExerciseSetEditorState>("/strength/exercise-set/editor", {
    params: { workout_type: workoutType, effective_date: effectiveDate },
  });
  return data;
}

export async function fetchExerciseSetDetail(setId: number) {
  const { data } = await apiClient.get<ExerciseSetDetail>(`/strength/exercise-set/${setId}`);
  return data;
}

export async function saveExerciseSet(body: {
  workout_type: string;
  effective_from: string;
  active_exercises: string[];
  active_blocks?: ExerciseSetBlock[];
  set_name?: string | null;
  show_on_main_panel?: boolean;
}) {
  const { data } = await apiClient.post<{ set_id: number; message: string }>(
    "/strength/exercise-set",
    body,
  );
  return data;
}

export async function updateExerciseSet(
  setId: number,
  body: { active_exercises: string[]; active_blocks?: ExerciseSetBlock[]; set_name?: string | null },
) {
  const { data } = await apiClient.put<{ set_id: number; message: string }>(
    `/strength/exercise-set/${setId}`,
    body,
  );
  return data;
}

export async function createWorkoutType(body: {
  workout_type: string;
  effective_from: string;
  exercises: string[];
  show_on_main_panel?: boolean;
}) {
  const { data } = await apiClient.post<{ set_id: number; preset_id?: number | null; message: string }>(
    "/strength/workout-types",
    body,
  );
  return data;
}

export async function ensureWorkoutPreset(
  workoutType: string,
  body: { show_on_main_panel?: boolean; sync_exercises?: boolean } = {},
) {
  const { data } = await apiClient.post<{ preset_id: number; message: string }>(
    `/strength/workout-types/${encodeURIComponent(workoutType)}/ensure-preset`,
    {
      show_on_main_panel: body.show_on_main_panel ?? true,
      sync_exercises: body.sync_exercises ?? true,
    },
  );
  return data;
}

export async function deleteExerciseSet(setId: number) {
  const { data } = await apiClient.delete<{
    set_id: number;
    workout_type: string;
    workout_count: number;
    preset_archived: boolean;
    type_removed: boolean;
    message: string;
  }>(`/strength/exercise-set/${setId}`);
  return data;
}

export async function deleteWorkoutType(workoutType: string) {
  const { data } = await apiClient.delete<{
    workout_type: string;
    workout_count: number;
    preset_archived: boolean;
    message: string;
  }>(`/strength/workout-types/${encodeURIComponent(workoutType)}`);
  return data;
}

export async function appendExerciseToWorkout(body: {
  workout_title: string;
  date: string;
  exercise_name: string;
}) {
  const { data } = await apiClient.post<{
    exercise: string;
    set_id: number;
    added: boolean;
    exercises: string[];
    message: string;
  }>("/strength/exercises/append", body);
  return data;
}

export {
  addStrengthExercise,
  deleteStrengthExercise,
  ensureStrengthExercisesInCatalog,
  fetchExerciseCatalog,
  fetchExercises as fetchAllExerciseNames,
  updateStrengthExercise,
  type ExerciseCatalogDetailItem,
} from "./strength";

export async function renameExerciseGlobally(oldName: string, newName: string) {
  const { data } = await apiClient.post<Record<string, number>>("/strength/exercises/rename", {
    old_name: oldName,
    new_name: newName,
  });
  return data;
}
