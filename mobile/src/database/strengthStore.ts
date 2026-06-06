import type {PresetItem, StrengthSession, WorkoutTypeName} from '../api/workouts';
import type {StrengthSessionDetail} from '../api/workouts';
import {getUserId} from '../api/client';
import {markRowPendingOnInsert} from '../sync/changeTracker';
import {executeSql, nowIso} from './index';

import type {SavePayload} from '../api/workouts';

export type StrengthSavePayload = SavePayload;

function payloadToSession(payload: StrengthSavePayload): StrengthSession {
  if (payload.is_circuit && payload.sets) {
    return {
      date: payload.date,
      workout_title: payload.workout_title,
      sets_count: payload.sets.length,
      is_circuit: true,
      ordered_sets: payload.sets.map((s, i) => ({
        exercise: s.exercise,
        weight: s.weight ?? 0,
        reps: s.reps,
        order_index: i,
      })),
    };
  }
  const exercises =
    payload.exercises?.flatMap(ex =>
      ex.reps_list.map((reps, idx) => ({
        exercise: ex.exercise,
        weight: ex.weight ?? 0,
        reps,
        order_index: idx,
      })),
    ) || [];
  return {
    date: payload.date,
    workout_title: payload.workout_title,
    sets_count: exercises.length,
    is_circuit: false,
    exercises,
  };
}

export async function enqueueStrengthWorkout(
  payload: StrengthSavePayload,
): Promise<number> {
  const userId = (await getUserId()) ?? '0';
  const rs = await executeSql(
    `INSERT INTO workouts (date, workout_title, sets_json, is_circuit, user_id, synced, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [
      payload.date,
      payload.workout_title,
      JSON.stringify(payload),
      payload.is_circuit ? 1 : 0,
      userId,
      nowIso(),
    ],
  );
  const localId = rs.insertId ?? 0;
  await markRowPendingOnInsert('workouts', 'id', localId);
  await upsertStrengthSessionCache(payload.workout_title, payloadToSession(payload), userId);
  return localId;
}

export async function markStrengthWorkoutSynced(
  localId: number,
  serverWorkoutId?: number,
): Promise<void> {
  const {markSyncedRow} = await import('../sync/changeTracker');
  await executeSql(
    'UPDATE workouts SET server_workout_id = ? WHERE id = ?',
    [serverWorkoutId ?? null, localId],
  );
  await markSyncedRow('workouts', 'id', localId);
}

export async function listPendingStrengthWorkouts(): Promise<
  Array<{id: number; payload: StrengthSavePayload}>
> {
  const rs = await executeSql('SELECT id, sets_json FROM workouts WHERE synced = 0');
  const out: Array<{id: number; payload: StrengthSavePayload}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({id: row.id as number, payload: JSON.parse(row.sets_json as string)});
  }
  return out;
}

export async function upsertStrengthSessionCache(
  workoutTitle: string,
  session: StrengthSession,
  userId?: string,
): Promise<void> {
  const uid = userId ?? (await getUserId()) ?? '0';
  await executeSql(
    `INSERT OR REPLACE INTO strength_sessions_cache (workout_title, date, session_json, user_id)
     VALUES (?, ?, ?, ?)`,
    [workoutTitle, session.date, JSON.stringify(session), uid],
  );
}

export async function cacheStrengthSessionsList(
  workoutTitle: string,
  items: StrengthSession[],
): Promise<void> {
  const userId = (await getUserId()) ?? '0';
  for (const session of items) {
    await upsertStrengthSessionCache(workoutTitle, session, userId);
  }
}

export async function getCachedStrengthSessions(
  workoutTitle: string,
): Promise<StrengthSession[]> {
  const userId = await getUserId();
  const rs = await executeSql(
    `SELECT session_json FROM strength_sessions_cache
     WHERE workout_title = ? AND user_id = ?
     ORDER BY date DESC`,
    [workoutTitle, userId],
  );
  const items: StrengthSession[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    items.push(JSON.parse(rs.rows.item(i).session_json as string));
  }
  return items;
}

function sessionToDetail(session: StrengthSession): StrengthSessionDetail {
  return {
    date: session.date,
    workout_title: session.workout_title,
    is_circuit: session.is_circuit,
    ordered_sets: session.ordered_sets,
    exercises: session.exercises,
  };
}

export async function getCachedStrengthSessionDetail(
  date: string,
  workoutTitle: string,
): Promise<StrengthSessionDetail | null> {
  const userId = (await getUserId()) ?? '0';
  const cached = await executeSql(
    `SELECT session_json FROM strength_sessions_cache
     WHERE workout_title = ? AND date = ? AND user_id = ?`,
    [workoutTitle, date, userId],
  );
  if (cached.rows.length > 0) {
    const session = JSON.parse(cached.rows.item(0).session_json as string) as StrengthSession;
    return sessionToDetail(session);
  }
  const wrs = await executeSql(
    `SELECT sets_json FROM workouts
     WHERE date = ? AND workout_title = ? AND user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [date, workoutTitle, userId],
  );
  if (wrs.rows.length < 1) {
    return null;
  }
  const payload = JSON.parse(wrs.rows.item(0).sets_json as string) as StrengthSavePayload;
  return sessionToDetail(payloadToSession(payload));
}

export async function upsertWorkoutTypesCache(
  workoutTypes: WorkoutTypeName[],
): Promise<void> {
  for (const title of workoutTypes) {
    await executeSql(
      'INSERT OR REPLACE INTO strength_workout_types_cache (workout_title, updated_at) VALUES (?, ?)',
      [title, nowIso()],
    );
  }
}

export async function getCachedWorkoutTypes(): Promise<WorkoutTypeName[]> {
  const rs = await executeSql(
    'SELECT workout_title FROM strength_workout_types_cache ORDER BY workout_title',
  );
  const out: WorkoutTypeName[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(rs.rows.item(i).workout_title as WorkoutTypeName);
  }
  return out;
}

export async function upsertPresetsCache(presets: PresetItem[]): Promise<void> {
  for (const p of presets) {
    const ts = nowIso();
    await executeSql(
      `INSERT OR REPLACE INTO strength_presets_cache
        (id, name, payload_json, updated_at, sync_status)
       VALUES (?, ?, ?, ?, 'synced')`,
      [p.id, p.name, JSON.stringify(p), ts],
    );
  }
}

export async function upsertLocalPreset(
  preset: PresetItem & {payload?: unknown},
): Promise<void> {
  const ts = nowIso();
  const payload = preset.payload ?? preset;
  await executeSql(
    `INSERT OR REPLACE INTO strength_presets_cache
      (id, name, payload_json, updated_at, sync_status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [preset.id, preset.name, JSON.stringify(payload), ts],
  );
  await markRowPendingOnInsert('strength_presets_cache', 'id', preset.id);
}

export async function getCachedPresets(): Promise<PresetItem[]> {
  const rs = await executeSql(
    'SELECT id, name FROM strength_presets_cache ORDER BY id',
  );
  const out: PresetItem[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push({
      id: rs.rows.item(i).id as number,
      name: rs.rows.item(i).name as string,
    });
  }
  return out;
}
