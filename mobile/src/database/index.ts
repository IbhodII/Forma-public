import SQLite from 'react-native-sqlite-storage';

import {errorToDisplay, formatUserFacingError} from '../utils/userFacingError';

SQLite.DEBUG(__DEV__);
SQLite.enablePromise(true);

export const SCHEMA_VERSION = 2;

let db: any | null = null;
let initPromise: Promise<void> | null = null;
let initResolved = false;
let dbInitializing = false;
let lastInitError: string | null = null;

export const DB_INIT_TIMEOUT_MS = 20_000;

function isBenignMigrationError(err: unknown): boolean {
  const msg = errorToDisplay(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('duplicate column') ||
    lower.includes('already exists') ||
    lower.includes('duplicate column name')
  );
}

export async function tableHasColumn(
  database: {executeSql: (sql: string, params?: unknown[]) => Promise<unknown[]>},
  table: string,
  column: string,
): Promise<boolean> {
  const [rs] = (await database.executeSql(`PRAGMA table_info(${table})`)) as [
    {rows: {length: number; item: (i: number) => {name?: string}}},
  ];
  for (let i = 0; i < rs.rows.length; i++) {
    if (rs.rows.item(i).name === column) {
      return true;
    }
  }
  return false;
}

export async function ensureColumn(
  database: {executeSql: (sql: string, params?: unknown[]) => Promise<unknown[]>},
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  if (await tableHasColumn(database, table, column)) {
    return;
  }
  try {
    await database.executeSql(ddl);
  } catch (err) {
    if (!isBenignMigrationError(err)) {
      throw err;
    }
  }
}

export function getDbInitError(): string | null {
  return lastInitError;
}

export function clearDbInitError(): void {
  lastInitError = null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    workout_title TEXT NOT NULL,
    sets_json TEXT NOT NULL,
    is_circuit INTEGER DEFAULT 0,
    user_id TEXT,
    synced INTEGER DEFAULT 0,
    server_workout_id INTEGER,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS strength_sessions_cache (
    workout_title TEXT NOT NULL,
    date TEXT NOT NULL,
    session_json TEXT NOT NULL,
    user_id TEXT,
    PRIMARY KEY (workout_title, date, user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS strength_workout_types_cache (
    workout_title TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS strength_presets_cache (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS food_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    date TEXT NOT NULL,
    phase TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS food_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS body_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS body_metrics_cache (
    date TEXT PRIMARY KEY,
    row_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS stretching_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    payload_json TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS stretching_log_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS bracelet_calories_cache (
    date TEXT PRIMARY KEY,
    total_calories REAL NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS bracelet_calories_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_calories REAL NOT NULL,
    synced INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_next ON sync_queue(status, next_retry_at);`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS cardio_workouts_cache (
    id INTEGER PRIMARY KEY,
    workout_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS exercises_catalog_cache (
    name TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_label TEXT NOT NULL,
    local_payload_json TEXT NOT NULL,
    server_payload_json TEXT,
    created_at TEXT NOT NULL,
    resolved INTEGER DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS hc_day_metrics (
    date TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    providers_json TEXT NOT NULL DEFAULT '{}',
    stale_flags_json TEXT NOT NULL DEFAULT '{}',
    last_read_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    forma_sync_synced INTEGER DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS hc_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    range_from TEXT NOT NULL,
    range_to TEXT NOT NULL,
    status TEXT NOT NULL,
    records_by_type_json TEXT NOT NULL DEFAULT '{}',
    error_text TEXT,
    snapshot_json TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'manual'
  );`,
  `CREATE TABLE IF NOT EXISTS hc_records (
    record_key TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,
    provider TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending'
  );`,
  `CREATE TABLE IF NOT EXISTS food_products_local (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    device_id TEXT,
    last_synced_revision INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS forma_sync_preferences (
    pref_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    device_id TEXT,
    last_synced_revision INTEGER
  );`,
];

const SYNC_COLUMN_MIGRATIONS: Array<{table: string; column: string; ddl: string}> = [
  {table: 'food_entries', column: 'deleted_at', ddl: 'ALTER TABLE food_entries ADD COLUMN deleted_at TEXT'},
  {table: 'food_entries', column: 'sync_status', ddl: "ALTER TABLE food_entries ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'food_entries', column: 'device_id', ddl: 'ALTER TABLE food_entries ADD COLUMN device_id TEXT'},
  {table: 'food_entries', column: 'last_synced_revision', ddl: 'ALTER TABLE food_entries ADD COLUMN last_synced_revision INTEGER'},
  {table: 'body_metrics', column: 'deleted_at', ddl: 'ALTER TABLE body_metrics ADD COLUMN deleted_at TEXT'},
  {table: 'body_metrics', column: 'sync_status', ddl: "ALTER TABLE body_metrics ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'body_metrics', column: 'device_id', ddl: 'ALTER TABLE body_metrics ADD COLUMN device_id TEXT'},
  {table: 'body_metrics', column: 'last_synced_revision', ddl: 'ALTER TABLE body_metrics ADD COLUMN last_synced_revision INTEGER'},
  {table: 'workouts', column: 'deleted_at', ddl: 'ALTER TABLE workouts ADD COLUMN deleted_at TEXT'},
  {table: 'workouts', column: 'sync_status', ddl: "ALTER TABLE workouts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'workouts', column: 'device_id', ddl: 'ALTER TABLE workouts ADD COLUMN device_id TEXT'},
  {table: 'workouts', column: 'last_synced_revision', ddl: 'ALTER TABLE workouts ADD COLUMN last_synced_revision INTEGER'},
  {table: 'stretching_log', column: 'deleted_at', ddl: 'ALTER TABLE stretching_log ADD COLUMN deleted_at TEXT'},
  {table: 'stretching_log', column: 'sync_status', ddl: "ALTER TABLE stretching_log ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'stretching_log', column: 'device_id', ddl: 'ALTER TABLE stretching_log ADD COLUMN device_id TEXT'},
  {table: 'stretching_log', column: 'last_synced_revision', ddl: 'ALTER TABLE stretching_log ADD COLUMN last_synced_revision INTEGER'},
  {table: 'bracelet_calories_queue', column: 'deleted_at', ddl: 'ALTER TABLE bracelet_calories_queue ADD COLUMN deleted_at TEXT'},
  {table: 'bracelet_calories_queue', column: 'sync_status', ddl: "ALTER TABLE bracelet_calories_queue ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'bracelet_calories_queue', column: 'device_id', ddl: 'ALTER TABLE bracelet_calories_queue ADD COLUMN device_id TEXT'},
  {table: 'bracelet_calories_queue', column: 'last_synced_revision', ddl: 'ALTER TABLE bracelet_calories_queue ADD COLUMN last_synced_revision INTEGER'},
  {table: 'hc_day_metrics', column: 'deleted_at', ddl: 'ALTER TABLE hc_day_metrics ADD COLUMN deleted_at TEXT'},
  {table: 'hc_day_metrics', column: 'sync_status', ddl: "ALTER TABLE hc_day_metrics ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'hc_day_metrics', column: 'device_id', ddl: 'ALTER TABLE hc_day_metrics ADD COLUMN device_id TEXT'},
  {table: 'hc_day_metrics', column: 'last_synced_revision', ddl: 'ALTER TABLE hc_day_metrics ADD COLUMN last_synced_revision INTEGER'},
  {table: 'cardio_workouts_cache', column: 'deleted_at', ddl: 'ALTER TABLE cardio_workouts_cache ADD COLUMN deleted_at TEXT'},
  {table: 'cardio_workouts_cache', column: 'sync_status', ddl: "ALTER TABLE cardio_workouts_cache ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'cardio_workouts_cache', column: 'device_id', ddl: 'ALTER TABLE cardio_workouts_cache ADD COLUMN device_id TEXT'},
  {table: 'cardio_workouts_cache', column: 'last_synced_revision', ddl: 'ALTER TABLE cardio_workouts_cache ADD COLUMN last_synced_revision INTEGER'},
  {table: 'strength_presets_cache', column: 'payload_json', ddl: "ALTER TABLE strength_presets_cache ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'"},
  {table: 'strength_presets_cache', column: 'deleted_at', ddl: 'ALTER TABLE strength_presets_cache ADD COLUMN deleted_at TEXT'},
  {table: 'strength_presets_cache', column: 'sync_status', ddl: "ALTER TABLE strength_presets_cache ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"},
  {table: 'strength_presets_cache', column: 'device_id', ddl: 'ALTER TABLE strength_presets_cache ADD COLUMN device_id TEXT'},
  {table: 'strength_presets_cache', column: 'last_synced_revision', ddl: 'ALTER TABLE strength_presets_cache ADD COLUMN last_synced_revision INTEGER'},
  {table: 'sync_conflicts', column: 'remote_updated_at', ddl: 'ALTER TABLE sync_conflicts ADD COLUMN remote_updated_at TEXT'},
  {table: 'sync_conflicts', column: 'winner', ddl: 'ALTER TABLE sync_conflicts ADD COLUMN winner TEXT'},
  {table: 'sync_conflicts', column: 'previous_payload_json', ddl: 'ALTER TABLE sync_conflicts ADD COLUMN previous_payload_json TEXT'},
  {table: 'food_entries', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE food_entries ADD COLUMN last_sync_attempt_at TEXT'},
  {table: 'body_metrics', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE body_metrics ADD COLUMN last_sync_attempt_at TEXT'},
  {table: 'workouts', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE workouts ADD COLUMN last_sync_attempt_at TEXT'},
  {table: 'stretching_log', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE stretching_log ADD COLUMN last_sync_attempt_at TEXT'},
  {table: 'bracelet_calories_queue', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE bracelet_calories_queue ADD COLUMN last_sync_attempt_at TEXT'},
  {table: 'hc_day_metrics', column: 'last_sync_attempt_at', ddl: 'ALTER TABLE hc_day_metrics ADD COLUMN last_sync_attempt_at TEXT'},
];

const SYNC_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_food_entries_sync_status ON food_entries(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_body_metrics_sync_status ON body_metrics(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_workouts_sync_status ON workouts(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_stretching_log_sync_status ON stretching_log(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_bracelet_calories_queue_sync_status ON bracelet_calories_queue(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_hc_day_metrics_sync_status ON hc_day_metrics(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_cardio_workouts_cache_sync_status ON cardio_workouts_cache(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_food_products_local_sync_status ON food_products_local(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_strength_presets_cache_sync_status ON strength_presets_cache(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_forma_sync_preferences_sync_status ON forma_sync_preferences(sync_status)',
];

export async function getDb(): Promise<any> {
  if (!db) {
    db = await SQLite.openDatabase({name: 'myhealth.db', location: 'default'});
  }
  return db;
}

/** Закрыть соединение перед заменой файла БД (облачное восстановление). */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
  initPromise = null;
  initResolved = false;
  dbInitializing = false;
}

export function isDbReady(): boolean {
  return initResolved && lastInitError == null;
}

export async function executeSql(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<any> {
  if (!dbInitializing) {
    await initDB();
  }
  const database = await getDb();
  const [result] = await database.executeSql(sql, params);
  return result;
}

async function writeMetaDirect(
  database: {executeSql: (sql: string, params?: unknown[]) => Promise<unknown[]>},
  key: string,
  value: string,
): Promise<void> {
  await database.executeSql('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [
    key,
    value,
  ]);
}

async function initDBInternal(): Promise<void> {
  dbInitializing = true;
  try {
    const database = await getDb();
    for (const ddl of SCHEMA) {
      await database.executeSql(ddl);
    }
    await ensureColumn(
      database,
      'hc_sync_runs',
      'trigger_type',
      "ALTER TABLE hc_sync_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'",
    );
    for (const mig of SYNC_COLUMN_MIGRATIONS) {
      await ensureColumn(database, mig.table, mig.column, mig.ddl);
    }
    for (const idx of SYNC_INDEXES) {
      await database.executeSql(idx);
    }
    await backfillSyncColumns(database);
    await writeMetaDirect(database, 'schema_version', String(SCHEMA_VERSION));
  } finally {
    dbInitializing = false;
  }
}

/** Idempotent schema setup; concurrent callers share one in-flight promise. */
export async function initDB(): Promise<void> {
  if (initResolved && lastInitError == null) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = initDBInternal()
    .then(() => {
      lastInitError = null;
      initResolved = true;
    })
    .catch(err => {
      lastInitError = formatUserFacingError(err);
      initResolved = false;
      initPromise = null;
      throw err;
    });
  return initPromise;
}

export async function retryInitDB(): Promise<void> {
  initPromise = null;
  initResolved = false;
  lastInitError = null;
  return initDB();
}

/** Force-reset init state after timeout (OfflineContext). */
export function resetInitAfterTimeout(message: string): void {
  initPromise = null;
  initResolved = false;
  dbInitializing = false;
  lastInitError = message;
}

async function backfillSyncColumns(database: any): Promise<void> {
  const backfills = [
    `UPDATE food_entries SET deleted_at = updated_at WHERE deleted = 1 AND deleted_at IS NULL`,
    `UPDATE food_entries SET sync_status = 'pending' WHERE synced = 0 AND sync_status = 'synced'`,
    `UPDATE food_entries SET sync_status = 'synced' WHERE synced = 1 AND sync_status = 'pending' AND deleted = 0`,
    `UPDATE body_metrics SET deleted_at = updated_at WHERE deleted = 1 AND deleted_at IS NULL`,
    `UPDATE body_metrics SET sync_status = 'pending' WHERE synced = 0 AND sync_status = 'synced'`,
    `UPDATE body_metrics SET sync_status = 'synced' WHERE synced = 1 AND sync_status = 'pending' AND deleted = 0`,
    `UPDATE workouts SET sync_status = 'pending' WHERE synced = 0 AND sync_status = 'synced'`,
    `UPDATE workouts SET sync_status = 'synced' WHERE synced = 1 AND sync_status = 'pending'`,
    `UPDATE stretching_log SET sync_status = 'pending' WHERE synced = 0 AND sync_status = 'synced'`,
    `UPDATE stretching_log SET sync_status = 'synced' WHERE synced = 1 AND sync_status = 'pending'`,
    `UPDATE bracelet_calories_queue SET sync_status = 'pending' WHERE synced = 0 AND sync_status = 'synced'`,
    `UPDATE bracelet_calories_queue SET sync_status = 'synced' WHERE synced = 1 AND sync_status = 'pending'`,
    `UPDATE hc_day_metrics SET sync_status = 'pending' WHERE forma_sync_synced = 0 AND sync_status = 'synced'`,
    `UPDATE hc_day_metrics SET sync_status = 'synced' WHERE forma_sync_synced = 1 AND sync_status = 'pending'`,
  ];
  for (const sql of backfills) {
    try {
      await database.executeSql(sql);
    } catch {
      // ignore backfill errors on fresh schema
    }
  }
}

export async function getMeta(key: string): Promise<string | null> {
  const rs = await executeSql('SELECT value FROM sync_meta WHERE key = ?', [key]);
  if (rs.rows.length < 1) {
    return null;
  }
  return rs.rows.item(0).value as string;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await executeSql(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value],
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Logical DB name (react-native-sqlite-storage default location). */
export function getActiveDbPath(): string {
  return 'myhealth.db';
}

export type DatabaseDiagnostics = {
  activeDbPath: string;
  counts: Record<string, number>;
};

/** Row counts for support / sync debugging (local SQLite). */
export async function getDatabaseDiagnostics(): Promise<DatabaseDiagnostics> {
  const tables = [
    'food_entries',
    'food_cache',
    'body_metrics',
    'body_metrics_cache',
    'workouts',
    'stretching_log',
    'hc_day_metrics',
    'cardio_workouts_cache',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const rs = await executeSql(`SELECT COUNT(*) AS c FROM ${table}`);
      counts[table] = Number(rs.rows.item(0).c ?? 0);
    } catch {
      counts[table] = -1;
    }
  }
  return {activeDbPath: getActiveDbPath(), counts};
}
