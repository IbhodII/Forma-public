import axios from 'axios';
import {Alert} from 'react-native';

import {getApiBaseUrl, getUserId} from '../api/client';
import {
  cacheBodyMetricsResponse,
  listPendingBodyMetrics,
  markBodyMetricSynced,
} from '../database/bodyStore';
import {
  dayCacheKey,
  listPendingFoodEntries,
  listPendingBraceletCalories,
  markFoodEntrySynced,
  markBraceletCaloriesSynced,
  setFoodCache,
  upsertBraceletCaloriesCache,
  weekCacheKey,
} from '../database/foodStore';
import {getMeta, setMeta} from '../database/index';
import {
  cacheStrengthSessionsList,
  listPendingStrengthWorkouts,
  markStrengthWorkoutSynced,
  upsertPresetsCache,
  upsertWorkoutTypesCache,
  type StrengthSavePayload,
} from '../database/strengthStore';
import {
  cacheStretchingLog,
  listPendingStretchingLogs,
  markStretchingLogSynced,
} from '../database/stretchingStore';
import type {FoodPhase} from '../types/food';
import {cacheCardioWorkouts} from '../database/cardioStore';
import {enqueueConflict} from '../database/conflictStore';
import {upsertExerciseNamesCache} from '../database/exercisesStore';
import {getStoredOperatingMode} from '../auth/session';
import {logStartup} from '../debug/startupLog';
import {requiresPcApi} from '../mode/operatingMode';
import {isOnline} from './network';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
let conflictShownAt = 0;

export function legacySyncInFlight(): boolean {
  return syncInFlight;
}

export type ConflictListener = () => void;
const conflictListeners = new Set<ConflictListener>();

export function subscribeConflicts(listener: ConflictListener): () => void {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

function notifyConflictListeners(): void {
  conflictListeners.forEach(l => l());
}

function notifyConflict(
  entity: string,
  localPayload?: unknown,
  serverPayload?: unknown,
): void {
  if (localPayload != null) {
    void enqueueConflict({
      entityType: entity,
      entityLabel: entity,
      localPayload,
      serverPayload,
    }).then(() => notifyConflictListeners());
  }
  const now = Date.now();
  if (now - conflictShownAt < 15000) {
    return;
  }
  conflictShownAt = now;
  Alert.alert(
    'Конфликт синхронизации',
    `Обнаружен конфликт в ${entity}. Откройте «Конфликты синхронизации» в настройках, чтобы выбрать версию.`,
  );
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const base = await getApiBaseUrl();
  const userId = await getUserId();
  const {data} = await axios.post<T>(path, body, {
    baseURL: base,
    headers: {'X-User-ID': userId, 'Content-Type': 'application/json'},
  });
  return data;
}

async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const base = await getApiBaseUrl();
  const userId = await getUserId();
  const {data} = await axios.get<T>(path, {
    baseURL: base,
    headers: {'X-User-ID': userId},
    params,
  });
  return data;
}

export function scheduleSync(): void {
  void import('../sync/syncOrchestrator').then(m => m.notifyLocalChange());
}

export async function syncPendingWorkouts(): Promise<number> {
  const pending = await listPendingStrengthWorkouts();
  let ok = 0;
  for (const row of pending) {
    try {
      const result = await apiPost<{
        inserted_sets: number;
        workout_id: number;
        message: string;
      }>('/api/strength/workout', row.payload as StrengthSavePayload);
      await markStrengthWorkoutSynced(row.id, result.workout_id);
      ok += 1;
    } catch (e) {
      // оставляем synced=0 для следующей попытки
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 409) {
        notifyConflict('тренировках', row.payload, axios.isAxiosError(e) ? e.response?.data : undefined);
      }
    }
  }
  return ok;
}

export async function syncPendingFood(): Promise<number> {
  const pending = await listPendingFoodEntries();
  let ok = 0;
  for (const row of pending) {
    try {
      const entry = await apiPost<import('../types/food').FoodEntry>(
        '/api/food/entries',
        row.payload,
      );
      await markFoodEntrySynced(row.id, entry);
      ok += 1;
    } catch (e) {
      // retry later
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 409) {
        notifyConflict('питании', row.payload, axios.isAxiosError(e) ? e.response?.data : undefined);
      }
    }
  }
  return ok;
}

export async function syncPendingBodyMetrics(): Promise<number> {
  const pending = await listPendingBodyMetrics();
  let ok = 0;
  for (const row of pending) {
    try {
      await apiPost('/api/body/metrics', row.payload);
      await markBodyMetricSynced(row.id);
      ok += 1;
    } catch (e) {
      // retry later
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 409) {
        notifyConflict('замерах', row.payload, axios.isAxiosError(e) ? e.response?.data : undefined);
      }
    }
  }
  return ok;
}

export async function syncPendingStretching(): Promise<number> {
  const pending = await listPendingStretchingLogs();
  let ok = 0;
  for (const row of pending) {
    try {
      const entry = await apiPost<import('../types/stretching').StretchingLogEntry>(
        '/api/stretching/log',
        row.payload,
      );
      await markStretchingLogSynced(row.id, entry);
      ok += 1;
    } catch (e) {
      // retry later
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 409) {
        notifyConflict('растяжке', row.payload, axios.isAxiosError(e) ? e.response?.data : undefined);
      }
    }
  }
  return ok;
}

export async function syncPendingBraceletCalories(): Promise<number> {
  const pending = await listPendingBraceletCalories();
  let ok = 0;
  for (const row of pending) {
    try {
      await apiPost('/api/analytics/daily-bracelet-calories', {
        date: row.date,
        total_calories: row.total_calories,
        source: 'manual',
      });
      await markBraceletCaloriesSynced(row.id);
      await upsertBraceletCaloriesCache(row.date, row.total_calories);
      ok += 1;
    } catch {
      // retry later
    }
  }
  return ok;
}

export async function pullRemoteData(): Promise<void> {
  const workoutTypes = await apiGet<string[]>('/api/strength/workout-types');
  await upsertWorkoutTypesCache(workoutTypes);
  for (const title of workoutTypes) {
    const sessions = await apiGet<{
      items: import('../api/workouts').StrengthSession[];
    }>('/api/strength/sessions', {workout_title: title, limit: 200, offset: 0});
    await cacheStrengthSessionsList(title, sessions.items || []);
  }

  const presets = await apiGet<import('../api/workouts').PresetItem[]>('/api/presets');
  await upsertPresetsCache(presets);

  const cardio = await apiGet<import('../types/cardio').CardioPaginated>(
    '/api/cardio/workouts',
    {limit: 200, offset: 0},
  );
  await cacheCardioWorkouts(cardio.items || []);

  const exercises = await apiGet<string[]>('/api/strength/exercises');
  await upsertExerciseNamesCache(exercises);

  const body = await apiGet<import('../types/body').BodyMetricsResponse>(
    '/api/body/metrics',
    {limit: 200, offset: 0},
  );
  await cacheBodyMetricsResponse(body);

  const stretchLog = await apiGet<import('../types/stretching').StretchingLogEntry[]>(
    '/api/stretching/log',
    {days: 90},
  );
  await cacheStretchingLog(stretchLog, 90);

  const today = new Date().toISOString().slice(0, 10);
  const addDaysIso = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Несколько недель: так после переустановки офлайн-режим уже показывает данные.
  const weekAnchors = [0, -7].map(d => addDaysIso(today, d));

  for (const phase of ['cut', 'bulk'] as FoodPhase[]) {
    for (const anchorDate of weekAnchors) {
      const week = await apiGet<import('../types/food').FoodWeekResponse>(
        '/api/food/entries/week',
        {date: anchorDate, phase},
      );
      await setFoodCache(weekCacheKey(anchorDate, phase), week);

      // Кэш day entries для DayModal.
      for (const day of week.days) {
        const dayResp = await apiGet<import('../types/food').FoodDayResponse>(
          '/api/food/entries',
          {date: day.date, phase},
        );
        await setFoodCache(dayCacheKey(day.date, phase), dayResp);
      }

      // Кэш bracelet calories для офлайна.
      const bracelet = await apiGet<{
        items: Array<{date: string; total_calories: number}>;
      }>('/api/analytics/daily-bracelet-calories', {
        from: week.week_start,
        to: week.week_end,
      });
      for (const item of bracelet.items || []) {
        await upsertBraceletCaloriesCache(
          item.date,
          item.total_calories,
        );
      }
    }
  }

  await setMeta('last_full_sync_at', new Date().toISOString());
}

export async function runFullSync(): Promise<{
  ok: boolean;
  uploaded: number;
  message: string;
}> {
  if (syncInFlight) {
    return {ok: true, uploaded: 0, message: 'Синхронизация уже выполняется'};
  }
  if (!(await isOnline())) {
    return {ok: false, uploaded: 0, message: 'Нет интернета'};
  }

  syncInFlight = true;
  try {
    const uploaded =
      (await syncPendingWorkouts()) +
      (await syncPendingFood()) +
      (await syncPendingBodyMetrics()) +
      (await syncPendingStretching()) +
      (await syncPendingBraceletCalories());

    const lastFull = await getMeta('last_full_sync_at');
    if (!lastFull) {
      await pullRemoteData();
    }

    return {
      ok: true,
      uploaded,
      message:
        uploaded > 0
          ? `Отправлено записей: ${uploaded}`
          : 'Данные синхронизированы с сервером',
    };
  } catch (e) {
    return {
      ok: false,
      uploaded: 0,
      message: e instanceof Error ? e.message : 'Ошибка синхронизации',
    };
  } finally {
    syncInFlight = false;
  }
}

export async function runInitialSyncIfNeeded(): Promise<void> {
  const mode = (await getStoredOperatingMode()) ?? 'legacy_api';
  if (!requiresPcApi(mode)) {
    logStartup('sync', 'cloud_sync_skipped_local_mode');
    return;
  }
  const last = await getMeta('last_full_sync_at');
  if (last) {
    return;
  }
  if (await isOnline()) {
    await runFullSync();
  }
}
