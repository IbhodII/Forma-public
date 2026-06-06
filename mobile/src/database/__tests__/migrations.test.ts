const syncMetaStore = new Map<string, string>();

const mockExecuteSql = jest.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes('INSERT OR REPLACE INTO sync_meta')) {
    syncMetaStore.set(String(params[0]), String(params[1]));
  }
  if (sql.includes('SELECT value FROM sync_meta')) {
    const key = String(params[0]);
    const value = syncMetaStore.get(key);
    return [
      {
        rows: {
          length: value != null ? 1 : 0,
          item: (i: number) => (i === 0 ? {value} : null),
        },
      },
    ];
  }
  return [
    {
      rows: {
        length: 0,
        item: () => null,
      },
    },
  ];
});

jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: {
    DEBUG: jest.fn(),
    enablePromise: jest.fn(),
    openDatabase: jest.fn(() =>
      Promise.resolve({
        executeSql: (...args: unknown[]) => mockExecuteSql(...args),
        close: jest.fn(),
      }),
    ),
  },
}));

jest.mock('../../utils/userFacingError', () => ({
  errorToDisplay: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as {message: unknown}).message);
    }
    return String(err);
  },
  formatUserFacingError: (err: unknown) => String(err),
}));

import {ensureColumn, getMeta, initDB, retryInitDB, SCHEMA_VERSION, tableHasColumn} from '../index';

describe('database migrations', () => {
  beforeEach(() => {
    syncMetaStore.clear();
    mockExecuteSql.mockClear();
  });

  it('tableHasColumn returns true when column exists', async () => {
    const database = {
      executeSql: jest.fn(async () => [
        {
          rows: {
            length: 2,
            item: (i: number) => (i === 0 ? {name: 'id'} : {name: 'trigger_type'}),
          },
        },
      ]),
    };

    await expect(tableHasColumn(database, 'hc_sync_runs', 'trigger_type')).resolves.toBe(true);
    expect(database.executeSql).toHaveBeenCalledWith('PRAGMA table_info(hc_sync_runs)');
  });

  it('ensureColumn skips ALTER when column already exists', async () => {
    const database = {
      executeSql: jest.fn(async (sql: string) => {
        if (sql.startsWith('PRAGMA')) {
          return [
            {
              rows: {
                length: 1,
                item: () => ({name: 'trigger_type'}),
              },
            },
          ];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };

    await ensureColumn(
      database,
      'hc_sync_runs',
      'trigger_type',
      "ALTER TABLE hc_sync_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'",
    );

    expect(database.executeSql).toHaveBeenCalledTimes(1);
  });

  it('ensureColumn runs ALTER when column is missing', async () => {
    const database = {
      executeSql: jest.fn(async (sql: string) => {
        if (sql.startsWith('PRAGMA')) {
          return [{rows: {length: 0, item: () => ({})}}];
        }
        return [{}];
      }),
    };

    await ensureColumn(
      database,
      'hc_sync_runs',
      'trigger_type',
      "ALTER TABLE hc_sync_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'",
    );

    expect(database.executeSql).toHaveBeenCalledTimes(2);
    expect(database.executeSql).toHaveBeenLastCalledWith(
      "ALTER TABLE hc_sync_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'",
    );
  });

  it('initDB completes without deadlock and writes schema_version', async () => {
    await retryInitDB();
    await expect(initDB()).resolves.toBeUndefined();
    const version = await getMeta('schema_version');
    expect(version).toBe(String(SCHEMA_VERSION));
    const insertMeta = mockExecuteSql.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        String(call[0]).includes('INSERT OR REPLACE INTO sync_meta') &&
        Array.isArray(call[1]) &&
        call[1][0] === 'schema_version',
    );
    expect(insertMeta).toBeTruthy();
  });
});
