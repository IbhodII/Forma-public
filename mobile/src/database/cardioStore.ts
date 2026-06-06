import type {CardioWorkout} from '../types/cardio';
import {markLocalChange, markRowPendingOnInsert} from '../sync/changeTracker';
import {executeSql, nowIso} from './index';

export async function cacheCardioWorkouts(items: CardioWorkout[]): Promise<void> {
  for (const w of items) {
    await executeSql(
      `INSERT OR REPLACE INTO cardio_workouts_cache
        (id, workout_json, updated_at, sync_status)
       VALUES (?, ?, ?, 'synced')`,
      [w.id, JSON.stringify(w), nowIso()],
    );
  }
}

export async function upsertLocalCardioWorkout(workout: CardioWorkout): Promise<void> {
  const ts = nowIso();
  await executeSql(
    `INSERT OR REPLACE INTO cardio_workouts_cache
      (id, workout_json, updated_at, deleted_at, sync_status)
     VALUES (?, ?, ?, NULL, 'pending')`,
    [workout.id, JSON.stringify(workout), ts],
  );
  await markRowPendingOnInsert('cardio_workouts_cache', 'id', workout.id);
}

export async function softDeleteCardioWorkout(id: number): Promise<void> {
  await markLocalChange('cardio_workouts_cache', 'id', id, {deletedAt: nowIso()});
}

export async function getCachedCardioWorkouts(): Promise<CardioWorkout[]> {
  const rs = await executeSql(
    'SELECT workout_json FROM cardio_workouts_cache ORDER BY id DESC',
  );
  const out: CardioWorkout[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(JSON.parse(rs.rows.item(i).workout_json as string));
  }
  return out;
}

export async function removeCachedCardioWorkout(id: number): Promise<void> {
  await executeSql('DELETE FROM cardio_workouts_cache WHERE id = ?', [id]);
}
