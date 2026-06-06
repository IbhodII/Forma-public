import type {
  DailyBraceletCalories,
  FoodDayResponse,
  FoodEntry,
  FoodEntryCreatePayload,
  FoodPhase,
} from '../types/food';
import {markRowPendingOnInsert} from '../sync/changeTracker';
import {executeSql, nowIso} from './index';

export async function setFoodCache(cacheKey: string, data: unknown): Promise<void> {
  await executeSql(
    'INSERT OR REPLACE INTO food_cache (cache_key, data_json, updated_at) VALUES (?, ?, ?)',
    [cacheKey, JSON.stringify(data), nowIso()],
  );
}

export async function getFoodCache<T>(cacheKey: string): Promise<T | null> {
  const rs = await executeSql('SELECT data_json FROM food_cache WHERE cache_key = ?', [
    cacheKey,
  ]);
  if (rs.rows.length < 1) {
    return null;
  }
  return JSON.parse(rs.rows.item(0).data_json as string) as T;
}

export function weekCacheKey(date: string, phase: FoodPhase): string {
  return `week:${date}:${phase}`;
}

export function dayCacheKey(date: string, phase: FoodPhase): string {
  return `day:${date}:${phase}`;
}

export async function enqueueFoodEntry(
  body: FoodEntryCreatePayload,
  phase: FoodPhase,
): Promise<number> {
  const rs = await executeSql(
    `INSERT INTO food_entries (date, phase, payload_json, synced, deleted, updated_at)
     VALUES (?, ?, ?, 0, 0, ?)`,
    [body.date, phase, JSON.stringify(body), nowIso()],
  );
  const localId = rs.insertId ?? 0;
  if (localId) {
    await markRowPendingOnInsert('food_entries', 'id', localId);
  }
  await mergePendingIntoDayCache(body.date, phase);
  return localId;
}

function localEntryFromPayload(
  localId: number,
  body: FoodEntryCreatePayload,
): FoodEntry {
  return {
    id: -localId,
    date: body.date,
    phase: body.phase,
    meal_type: body.meal_type,
    product_id: body.product_id,
    quantity: body.quantity,
    product_name: 'Сохранено',
    protein: 0,
    fat: 0,
    carbs: 0,
    fiber: 0,
    calories: 0,
  };
}

/** Rebuild day cache from canonical food_entries (after FormaSync apply). */
export async function refreshFoodDayCacheFromEntries(
  date: string,
  phase: FoodPhase,
): Promise<void> {
  const rs = await executeSql(
    `SELECT id, payload_json, server_id FROM food_entries
     WHERE date = ? AND phase = ? AND deleted = 0`,
    [date, phase],
  );
  const entries: FoodEntry[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    const payload = JSON.parse(row.payload_json as string) as FoodEntryCreatePayload;
    const localId = row.id as number;
    const serverId = row.server_id as number | null;
    const entry = localEntryFromPayload(localId, payload);
    if (serverId && serverId > 0) {
      entry.id = serverId;
    }
    entries.push(entry);
  }
  await setFoodCache(dayCacheKey(date, phase), {
    date,
    phase,
    entries,
    by_meal: {},
    daily_totals: {protein: 0, fat: 0, carbs: 0, calories: 0, fiber: 0},
  });
}

async function mergePendingIntoDayCache(date: string, phase: FoodPhase): Promise<void> {
  const key = dayCacheKey(date, phase);
  const cached = (await getFoodCache<FoodDayResponse>(key)) ?? {
    date,
    phase,
    entries: [],
    by_meal: {},
    daily_totals: {protein: 0, fat: 0, carbs: 0, fiber: 0, calories: 0},
  };
  const pending = await listPendingFoodForDay(date, phase);
  const mergedEntries = [
    ...cached.entries.filter(e => e.id > 0),
    ...pending.map(p => localEntryFromPayload(p.id, p.payload)),
  ];
  await setFoodCache(key, {...cached, entries: mergedEntries});
}

export async function listPendingFoodForDay(
  date: string,
  phase: FoodPhase,
): Promise<Array<{id: number; payload: FoodEntryCreatePayload}>> {
  const rs = await executeSql(
    `SELECT id, payload_json FROM food_entries
     WHERE synced = 0 AND deleted = 0 AND date = ? AND phase = ?`,
    [date, phase],
  );
  const out: Array<{id: number; payload: FoodEntryCreatePayload}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({id: row.id as number, payload: JSON.parse(row.payload_json as string)});
  }
  return out;
}

export async function listPendingFoodEntries(): Promise<
  Array<{id: number; phase: FoodPhase; payload: FoodEntryCreatePayload}>
> {
  const rs = await executeSql(
    'SELECT id, phase, payload_json FROM food_entries WHERE synced = 0 AND deleted = 0',
  );
  const out: Array<{id: number; phase: FoodPhase; payload: FoodEntryCreatePayload}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      id: row.id as number,
      phase: row.phase as FoodPhase,
      payload: JSON.parse(row.payload_json as string),
    });
  }
  return out;
}

export async function updateLocalFoodEntry(
  localId: number,
  patch: Partial<Pick<FoodEntryCreatePayload, 'product_id' | 'quantity' | 'meal_type'>>,
): Promise<FoodEntry> {
  const rs = await executeSql(
    'SELECT payload_json, date, phase FROM food_entries WHERE id = ? AND deleted = 0',
    [localId],
  );
  if (rs.rows.length < 1) {
    throw new Error('Запись не найдена');
  }
  const row = rs.rows.item(0);
  const payload = JSON.parse(row.payload_json as string) as FoodEntryCreatePayload;
  const next: FoodEntryCreatePayload = {...payload, ...patch};
  await executeSql(
    'UPDATE food_entries SET payload_json = ?, synced = 0, updated_at = ? WHERE id = ?',
    [JSON.stringify(next), nowIso(), localId],
  );
  const {markRowPendingOnInsert} = await import('../sync/changeTracker');
  await markRowPendingOnInsert('food_entries', 'id', localId);
  await mergePendingIntoDayCache(next.date, row.phase as FoodPhase);
  return localEntryFromPayload(localId, next);
}

export async function deleteLocalFoodEntry(localId: number): Promise<void> {
  const rs = await executeSql(
    'SELECT date, phase FROM food_entries WHERE id = ?',
    [localId],
  );
  if (rs.rows.length < 1) {
    return;
  }
  const row = rs.rows.item(0);
  await executeSql(
    'UPDATE food_entries SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?',
    [nowIso(), localId],
  );
  const {markRowPendingOnInsert} = await import('../sync/changeTracker');
  await markRowPendingOnInsert('food_entries', 'id', localId);
  await mergePendingIntoDayCache(row.date as string, row.phase as FoodPhase);
}

export async function markFoodEntrySynced(
  localId: number,
  serverEntry: FoodEntry,
): Promise<void> {
  const {markSyncedRow} = await import('../sync/changeTracker');
  await executeSql('UPDATE food_entries SET server_id = ? WHERE id = ?', [
    serverEntry.id,
    localId,
  ]);
  await markSyncedRow('food_entries', 'id', localId);
}

export async function upsertBraceletCaloriesCache(
  date: string,
  totalCalories: number,
): Promise<void> {
  await executeSql(
    'INSERT OR REPLACE INTO bracelet_calories_cache (date, total_calories, updated_at) VALUES (?, ?, ?)',
    [date, totalCalories, nowIso()],
  );
}

export async function enqueueBraceletCalories(
  date: string,
  totalCalories: number,
): Promise<number> {
  await upsertBraceletCaloriesCache(date, totalCalories);
  const rs = await executeSql(
    `INSERT INTO bracelet_calories_queue (date, total_calories, synced, updated_at)
     VALUES (?, ?, 0, ?)`,
    [date, totalCalories, nowIso()],
  );
  const localId = rs.insertId ?? 0;
  if (localId) {
    await markRowPendingOnInsert('bracelet_calories_queue', 'id', localId);
  }
  return localId;
}

export async function listPendingBraceletCalories(): Promise<
  Array<{id: number; date: string; total_calories: number}>
> {
  const rs = await executeSql(
    'SELECT id, date, total_calories FROM bracelet_calories_queue WHERE synced = 0 ORDER BY id',
  );
  const out: Array<{id: number; date: string; total_calories: number}> = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      id: row.id as number,
      date: row.date as string,
      total_calories: row.total_calories as number,
    });
  }
  return out;
}

export async function markBraceletCaloriesSynced(localId: number): Promise<void> {
  await executeSql('UPDATE bracelet_calories_queue SET synced = 1 WHERE id = ?', [localId]);
}

export async function getCachedBraceletCalories(
  from: string,
  to: string,
): Promise<DailyBraceletCalories[]> {
  const rs = await executeSql(
    'SELECT date, total_calories FROM bracelet_calories_cache WHERE date >= ? AND date <= ? ORDER BY date',
    [from, to],
  );
  const out: DailyBraceletCalories[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      date: row.date as string,
      total_calories: row.total_calories as number,
    });
  }
  return out;
}
