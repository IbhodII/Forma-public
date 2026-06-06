import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import * as Keychain from 'react-native-keychain';

import type {CloudProvider} from '../config/cloudOAuth';
import {closeDb, getDb, initDB, setMeta} from '../database/index';
import {
  downloadGoogleBackup,
  listGoogleBackups,
  uploadGoogleBackup,
} from './cloud/googleDriveApi';
import {
  downloadYandexBackup,
  listYandexBackups,
  uploadYandexBackup,
} from './cloud/yandexDiskApi';
import type {CloudBackupFile, CloudConnectionInfo} from './cloud/types';

const KEYCHAIN_SERVICE_PREFIX = 'forma_cloud_';
const META_LAST_BACKUP_PREFIX = 'cloud:last_backup:';

type StoredToken = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
};

function serviceName(provider: CloudProvider): string {
  return `${KEYCHAIN_SERVICE_PREFIX}${provider}`;
}

function backupFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `backup_${stamp}.db`;
}

export class CloudSyncService {
  /** Android SQLite path (react-native-sqlite-storage, location default). */
  static getDatabasePath(): string {
    if (Platform.OS === 'android') {
      return `${RNFS.DocumentDirectoryPath}/../databases/myhealth.db`;
    }
    return `${RNFS.LibraryDirectoryPath}/LocalDatabase/myhealth.db`;
  }

  static async saveToken(
    provider: CloudProvider,
    accessToken: string,
    extra?: {refreshToken?: string | null; expiresAt?: string | null},
  ): Promise<void> {
    const payload: StoredToken = {
      accessToken,
      refreshToken: extra?.refreshToken ?? null,
      expiresAt: extra?.expiresAt ?? null,
    };
    await Keychain.setInternetCredentials(
      serviceName(provider),
      provider,
      JSON.stringify(payload),
    );
  }

  static async getToken(provider: CloudProvider): Promise<string | null> {
    const creds = await Keychain.getInternetCredentials(serviceName(provider));
    if (creds === false || !creds.password) {
      return null;
    }
    try {
      const parsed = JSON.parse(creds.password) as StoredToken;
      return parsed.accessToken || null;
    } catch {
      return creds.password;
    }
  }

  static async getConnectionInfo(provider: CloudProvider): Promise<CloudConnectionInfo> {
    const creds = await Keychain.getInternetCredentials(serviceName(provider));
    if (creds === false || !creds.password) {
      return {connected: false, provider};
    }
    try {
      const parsed = JSON.parse(creds.password) as StoredToken;
      return {
        connected: Boolean(parsed.accessToken),
        provider,
        expiresAt: parsed.expiresAt ?? null,
      };
    } catch {
      return {connected: true, provider};
    }
  }

  static async deleteToken(provider: CloudProvider): Promise<void> {
    await Keychain.resetInternetCredentials({service: serviceName(provider)});
  }

  static async listBackups(provider: CloudProvider): Promise<CloudBackupFile[]> {
    const token = await this.getToken(provider);
    if (!token) {
      throw new Error('Облако не подключено');
    }
    if (provider === 'yandex') {
      return listYandexBackups(token);
    }
    return listGoogleBackups(token);
  }

  static async backupToCloud(provider: CloudProvider): Promise<string> {
    const token = await this.getToken(provider);
    if (!token) {
      throw new Error('Не авторизован в облаке');
    }

    const dbPath = this.getDatabasePath();
    const exists = await RNFS.exists(dbPath);
    if (!exists) {
      throw new Error(`База данных не найдена: ${dbPath}`);
    }

    await getDb();
    const tempPath = `${RNFS.CachesDirectoryPath}/${backupFilename()}`;
    await RNFS.copyFile(dbPath, tempPath);
    const remoteName = backupFilename();

    try {
      if (provider === 'yandex') {
        await uploadYandexBackup(token, tempPath, remoteName);
      } else {
        await uploadGoogleBackup(token, tempPath, remoteName);
      }
      await setMeta(`${META_LAST_BACKUP_PREFIX}${provider}`, new Date().toISOString());
      return remoteName;
    } finally {
      try {
        await RNFS.unlink(tempPath);
      } catch {
        /* ignore */
      }
    }
  }

  static async restoreFromCloud(
    provider: CloudProvider,
    filename?: string,
  ): Promise<string> {
    const token = await this.getToken(provider);
    if (!token) {
      throw new Error('Не авторизован в облаке');
    }

    const backups = await this.listBackups(provider);
    if (!backups.length) {
      throw new Error('В облаке нет файлов бэкапа (.db)');
    }

    const target =
      filename != null
        ? backups.find(b => b.filename === filename)
        : backups[0];
    if (!target) {
      throw new Error(filename ? `Бэкап не найден: ${filename}` : 'Бэкап не найден');
    }

    const tempPath = `${RNFS.CachesDirectoryPath}/restore_${Date.now()}.db`;
    const dbPath = this.getDatabasePath();

    try {
      if (provider === 'yandex') {
        await downloadYandexBackup(token, target.filename, tempPath);
      } else {
        if (!target.remotePath) {
          throw new Error('Нет id файла Google Drive');
        }
        await downloadGoogleBackup(token, target.remotePath, tempPath);
      }

      await closeDb();
      if (await RNFS.exists(dbPath)) {
        await RNFS.unlink(dbPath);
      }
      await RNFS.copyFile(tempPath, dbPath);
      await initDB();
      await setMeta(`${META_LAST_BACKUP_PREFIX}${provider}:restored`, target.filename);
      return target.filename;
    } finally {
      try {
        await RNFS.unlink(tempPath);
      } catch {
        /* ignore */
      }
    }
  }
}
