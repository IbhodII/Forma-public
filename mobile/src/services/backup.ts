import {Share} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import {unzip, zip} from 'react-native-zip-archive';

import {executeSql, initDB} from '../database/index';

async function dumpTable(table: string) {
  const rs = await executeSql(`SELECT * FROM ${table}`);
  const rows: unknown[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    rows.push(rs.rows.item(i));
  }
  return rows;
}

export async function createLocalBackupZip(): Promise<string> {
  await initDB();
  const dir = `${RNFS.DocumentDirectoryPath}/backup-temp`;
  const outDir = `${RNFS.DocumentDirectoryPath}/exports`;
  await RNFS.mkdir(dir);
  await RNFS.mkdir(outDir);

  const snapshot = {
    created_at: new Date().toISOString(),
    tables: {
      workouts: await dumpTable('workouts'),
      food_entries: await dumpTable('food_entries'),
      body_metrics: await dumpTable('body_metrics'),
      stretching_log: await dumpTable('stretching_log'),
      strength_sessions_cache: await dumpTable('strength_sessions_cache'),
      food_cache: await dumpTable('food_cache'),
      body_metrics_cache: await dumpTable('body_metrics_cache'),
      stretching_log_cache: await dumpTable('stretching_log_cache'),
      sync_meta: await dumpTable('sync_meta'),
    },
  };

  const jsonPath = `${dir}/snapshot.json`;
  await RNFS.writeFile(jsonPath, JSON.stringify(snapshot), 'utf8');
  const zipPath = `${outDir}/myhealth-backup-${Date.now()}.zip`;
  await zip(dir, zipPath);
  return zipPath;
}

export async function shareBackup(zipPath: string): Promise<void> {
  await Share.share({url: `file://${zipPath}`});
}

async function restoreTable(table: string, rows: any[]): Promise<void> {
  await executeSql(`DELETE FROM ${table}`);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (!keys.length) {
      continue;
    }
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    await executeSql(sql, keys.map(k => row[k] as string | number | null));
  }
}

export async function importLocalBackupZip(): Promise<{ok: boolean; message?: string}> {
  await initDB();
  const file = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.zip],
    copyTo: 'cachesDirectory',
  });

  const source = file.fileCopyUri || file.uri;
  if (!source) {
    return {ok: false, message: 'Файл не выбран'};
  }
  const dest = `${RNFS.CachesDirectoryPath}/backup-import-${Date.now()}`;
  await RNFS.mkdir(dest);
  const unzippedPath = await unzip(source.replace('file://', ''), dest);
  const snapshotPath = `${unzippedPath}/snapshot.json`;
  const exists = await RNFS.exists(snapshotPath);
  if (!exists) {
    return {ok: false, message: 'В архиве нет snapshot.json'};
  }
  const raw = await RNFS.readFile(snapshotPath, 'utf8');
  let parsed: {tables?: Record<string, any[]>};
  try {
    parsed = JSON.parse(raw) as {tables?: Record<string, any[]>};
  } catch {
    return {ok: false, message: 'snapshot.json повреждён'};
  }
  const tables = parsed.tables || {};

  await executeSql('BEGIN TRANSACTION');
  try {
    for (const [name, rows] of Object.entries(tables)) {
      await restoreTable(name, rows || []);
    }
    await executeSql('COMMIT');
    return {ok: true};
  } catch (e) {
    await executeSql('ROLLBACK');
    const msg = e instanceof Error ? e.message : 'Ошибка восстановления';
    return {ok: false, message: msg};
  }
}

