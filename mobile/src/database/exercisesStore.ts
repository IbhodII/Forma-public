import {executeSql, nowIso} from './index';

const DEFAULT_EXERCISE_NAMES = [
  'Приседания',
  'Жим лёжа',
  'Становая тяга',
  'Подтягивания',
  'Тяга в наклоне',
  'Жим над головой',
  'Выпады',
  'Планка',
];

export async function upsertExerciseNamesCache(names: string[]): Promise<void> {
  for (const name of names) {
    await executeSql(
      'INSERT OR REPLACE INTO exercises_catalog_cache (name, updated_at) VALUES (?, ?)',
      [name, nowIso()],
    );
  }
}

export async function getCachedExerciseNames(): Promise<string[]> {
  const rs = await executeSql(
    'SELECT name FROM exercises_catalog_cache ORDER BY name',
  );
  const out: string[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(rs.rows.item(i).name as string);
  }
  return out;
}

export async function ensureDefaultExerciseSeed(): Promise<string[]> {
  const cached = await getCachedExerciseNames();
  if (cached.length > 0) {
    return cached;
  }
  await upsertExerciseNamesCache(DEFAULT_EXERCISE_NAMES);
  return [...DEFAULT_EXERCISE_NAMES].sort((a, b) => a.localeCompare(b));
}
