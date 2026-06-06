import {apiFetch} from './client';
import {isOnline} from '../services/network';
import {
  ensureDefaultExerciseSeed,
  getCachedExerciseNames,
  upsertExerciseNamesCache,
} from '../database/exercisesStore';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function fetchExerciseCatalog(): Promise<string[]> {
  if (await isOnline()) {
    try {
      const names = await jsonOrThrow<string[]>(
        await apiFetch('/api/strength/exercises'),
      );
      if (names.length > 0) {
        await upsertExerciseNamesCache(names);
        return names;
      }
    } catch {
      // fallback to local cache/default seed
    }
  }
  const cached = await getCachedExerciseNames();
  if (cached.length > 0) {
    return cached;
  }
  return ensureDefaultExerciseSeed();
}

export async function addExerciseToCatalog(name: string) {
  const res = await apiFetch('/api/strength/exercises', {
    method: 'POST',
    body: JSON.stringify({name: name.trim()}),
  });
  return jsonOrThrow<{id: number; name: string}>(res);
}

export async function renameExerciseGlobally(oldName: string, newName: string) {
  const res = await apiFetch('/api/strength/exercises/rename', {
    method: 'POST',
    body: JSON.stringify({old_name: oldName, new_name: newName}),
  });
  return jsonOrThrow<Record<string, number>>(res);
}

export async function createWorkoutType(body: {
  workout_type: string;
  effective_from: string;
  exercises: string[];
}) {
  const res = await apiFetch('/api/strength/workout-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{set_id: number; message: string}>(res);
}

export async function fetchExerciseSetEditor(workoutType: string, effectiveDate: string) {
  const sp = new URLSearchParams({
    workout_type: workoutType,
    effective_date: effectiveDate,
  });
  return jsonOrThrow<{
    workout_type: string;
    effective_date: string;
    active_exercises: string[];
    sets: Array<{id: number; set_name: string | null; n_exercises: number}>;
  }>(await apiFetch(`/api/strength/exercise-set/editor?${sp.toString()}`));
}

export async function saveExerciseSet(body: {
  workout_type: string;
  effective_from: string;
  active_exercises: string[];
  set_name?: string | null;
}) {
  const res = await apiFetch('/api/strength/exercise-set', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{set_id: number; message: string}>(res);
}
