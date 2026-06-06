import axios from 'axios';

import {getApiBaseUrl, getUserId} from './client';
import {
  enqueueStrengthWorkout,
  cacheStrengthSessionsList,
  getCachedStrengthSessions,
  getCachedStrengthSessionDetail,
  getCachedPresets,
  getCachedWorkoutTypes,
  upsertPresetsCache,
  upsertWorkoutTypesCache,
} from '../database/strengthStore';
import {isOnline} from '../services/network';
import {localFirstWrite} from '../sync/localFirstWrite';
import {
  requiresPcApi,
  shouldSkipPcApi,
  type OperatingMode,
} from '../mode/operatingMode';

const WORKOUTS_API_TIMEOUT_MS = 6000;

export type StrengthSet = {
  exercise: string;
  weight?: number | null;
  reps?: number | null;
  reps_str?: string | null;
  order_index?: number | null;
  is_warmup?: boolean;
};

export type StrengthSession = {
  date: string;
  workout_title: string;
  sets_count: number;
  is_circuit?: boolean;
  ordered_sets?: StrengthSet[];
  exercises?: StrengthSet[];
};

export type StrengthSessionsResponse = {
  items: StrengthSession[];
  meta: {total: number; limit: number; offset: number};
};

export type WorkoutTypeName = string;

export type PresetItem = {
  id: number;
  name: string;
};

export type PresetSetRow = {
  reps: number;
  weight?: number | null;
  duration_sec?: number | null;
  is_warmup?: boolean;
};

export type WorkoutFormPrefill = {
  date: string;
  workout_title: string;
  preset_id?: number | null;
  exercises: Array<{
    exercise: string;
    last_weight?: number | null;
    last_reps?: string | null;
    last_date?: string | null;
    is_bodyweight?: boolean;
    sets?: PresetSetRow[];
  }>;
  session_metrics?: {
    avg_hr?: number | null;
    calories_chest?: number | null;
    calories_watch?: number | null;
  };
};

export type StrengthSetBlock = {
  weight: number;
  reps_str: string;
  is_bodyweight?: boolean;
  duration_sec?: number | null;
};

export type StrengthExerciseGroup = {
  exercise: string;
  weight?: number;
  reps_str?: string;
  is_bodyweight?: boolean;
  warmup_sets?: StrengthSetBlock[];
  working_sets?: StrengthSetBlock[];
};

export type StrengthOrderedSetRow = {
  exercise: string;
  weight: number;
  reps: number;
  reps_str?: string;
  is_warmup?: boolean;
  is_bodyweight?: boolean;
  duration_sec?: number | null;
  order_index?: number;
};

export type StrengthSessionDetail = {
  date: string;
  workout_title: string;
  is_circuit?: boolean;
  uses_ordered_sets?: boolean;
  avg_hr?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
  ordered_sets?: StrengthOrderedSetRow[];
  exercises?: StrengthExerciseGroup[];
};

export type StrengthSetCreate = {
  exercise: string;
  weight?: number | null;
  reps: number;
  notes?: string;
  is_warmup?: boolean;
  duration_sec?: number | null;
  is_bodyweight?: boolean;
};

export type SavePayload = {
  date: string;
  workout_title: string;
  preset_id?: number | null;
  is_circuit?: boolean;
  avg_hr?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
  sets?: StrengthSetCreate[];
  exercises?: Array<{exercise: string; weight?: number | null; reps_list: number[]}>;
};

async function request<T>(method: 'get' | 'post', path: string, paramsOrBody?: unknown) {
  const base = await getApiBaseUrl();
  if (!base) {
    throw new Error('API base is empty');
  }
  const userId = await getUserId();
  const cfg = {
    baseURL: base,
    headers: {'X-User-ID': userId},
    timeout: WORKOUTS_API_TIMEOUT_MS,
  };
  if (method === 'get') {
    const {data} = await axios.get<T>(path, {...cfg, params: paramsOrBody});
    return data;
  }
  const {data} = await axios.post<T>(path, paramsOrBody, cfg);
  return data;
}

export async function fetchWorkoutTypes(options?: {
  operatingMode?: OperatingMode;
  pcApiReachable?: boolean;
}) {
  const mode = options?.operatingMode ?? 'legacy_api';
  const pcReachable = options?.pcApiReachable ?? false;
  const skipPc = shouldSkipPcApi(mode, pcReachable);
  if (!skipPc && requiresPcApi(mode) && (await isOnline())) {
    try {
      const types = await request<WorkoutTypeName[]>(
        'get',
        '/api/strength/workout-types',
      );
      await upsertWorkoutTypesCache(types);
      return types;
    } catch {
      // fallback to cache for offline-like API failures/timeouts
    }
  }
  return getCachedWorkoutTypes();
}

export async function fetchPresets() {
  if (await isOnline()) {
    try {
      const presets = await request<PresetItem[]>('get', '/api/presets');
      await upsertPresetsCache(presets);
      return presets;
    } catch {
      // fallback to cache for offline-like API failures/timeouts
    }
  }
  return getCachedPresets();
}

export async function fetchStrengthSessions(params: {
  workout_title?: string;
  preset_id?: number;
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
}) {
  const title = params.workout_title || '';
  if (await isOnline()) {
    try {
      const data = await request<StrengthSessionsResponse>('get', '/api/strength/sessions', {
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
        workout_title: params.workout_title,
        preset_id: params.preset_id,
        date_from: params.date_from,
        date_to: params.date_to,
      });
      if (title) {
        await cacheStrengthSessionsList(title, data.items || []);
      }
      return data;
    } catch {
      // fallback to cache
    }
  }
  const items = title ? await getCachedStrengthSessions(title) : [];
  return {
    items,
    meta: {total: items.length, limit: params.limit ?? 100, offset: params.offset ?? 0},
  };
}

export async function fetchWorkoutFormPrefill(workoutTitle: string, presetId?: number) {
  if (!(await isOnline())) {
    return {
      date: new Date().toISOString().slice(0, 10),
      workout_title: workoutTitle,
      exercises: [],
    } satisfies WorkoutFormPrefill;
  }
  try {
    return await request<WorkoutFormPrefill>(
      'get',
      '/api/strength/workout-form-prefill',
      {
        workout_title: workoutTitle,
        date: new Date().toISOString().slice(0, 10),
        preset_id: presetId,
      },
    );
  } catch {
    return {
      date: new Date().toISOString().slice(0, 10),
      workout_title: workoutTitle,
      exercises: [],
    } satisfies WorkoutFormPrefill;
  }
}

export async function fetchStrengthSessionDetail(date: string, workoutTitle: string) {
  if (!(await isOnline())) {
    const local = await getCachedStrengthSessionDetail(date, workoutTitle);
    if (local) {
      return local;
    }
    throw new Error('Сессия недоступна офлайн');
  }
  try {
    return await request<StrengthSessionDetail>(
      'get',
      `/api/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}`,
    );
  } catch {
    const local = await getCachedStrengthSessionDetail(date, workoutTitle);
    if (local) {
      return local;
    }
    throw new Error('Не удалось загрузить сессию');
  }
}

/** Все силовые сессии (журнал) без фильтра по типу. */
export async function fetchAllStrengthSessions(params?: {
  limit?: number;
  offset?: number;
  date_from?: string;
}) {
  return fetchStrengthSessions({
    limit: params?.limit ?? 200,
    offset: params?.offset ?? 0,
    date_from: params?.date_from,
  });
}

export async function deleteStrengthSession(date: string, workoutTitle: string) {
  const base = await getApiBaseUrl();
  const userId = await getUserId();
  await axios.delete(
    `${base}/api/strength/sessions/${encodeURIComponent(date)}/${encodeURIComponent(workoutTitle)}`,
    {headers: {'X-User-ID': userId}},
  );
}

export async function saveStrengthWorkout(payload: SavePayload) {
  return localFirstWrite({
    persist: async () => {
      const localId = await enqueueStrengthWorkout(payload);
      return {
        inserted_sets: payload.is_circuit
          ? (payload.sets?.length ?? 0)
          : (payload.exercises?.reduce((n, ex) => n + ex.reps_list.length, 0) ?? 0),
        workout_id: localId,
        message: 'Сохранено',
      };
    },
  });
}
