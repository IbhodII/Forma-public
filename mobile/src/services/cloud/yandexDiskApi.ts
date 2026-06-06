import RNFS from 'react-native-fs';

import {CLOUD_BACKUP_FOLDER} from '../../config/cloudOAuth';
import type {CloudBackupFile} from './types';

const API = 'https://cloud-api.yandex.net/v1/disk';

async function apiJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      const err = new Error('YANDEX_TOKEN_EXPIRED');
      (err as Error & {status?: number}).status = 401;
      throw err;
    }
    throw new Error(text || `Yandex Disk HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

function backupDiskPath(filename: string): string {
  return `app:/${CLOUD_BACKUP_FOLDER}/${filename}`;
}

function backupFolderPath(): string {
  return `app:/${CLOUD_BACKUP_FOLDER}`;
}

export async function ensureDiskFolder(token: string, diskPath: string): Promise<void> {
  try {
    await apiJson(token, `/resources?path=${encodeURIComponent(diskPath)}`);
  } catch {
    await apiJson(token, `/resources?path=${encodeURIComponent(diskPath)}`, {
      method: 'PUT',
    });
  }
}

export async function uploadDiskFile(
  token: string,
  diskPath: string,
  localPath: string,
  filename: string,
): Promise<void> {
  const meta = await apiJson<{href: string}>(
    token,
    `/resources/upload?path=${encodeURIComponent(diskPath)}&overwrite=true`,
  );
  const upload = await RNFS.uploadFiles({
    toUrl: meta.href,
    files: [
      {
        name: 'file',
        filename,
        filepath: localPath,
        filetype: 'application/octet-stream',
      },
    ],
    method: 'PUT',
    binaryStreamOnly: true,
  }).promise;
  if (upload.statusCode < 200 || upload.statusCode >= 300) {
    throw new Error(`Yandex upload failed: HTTP ${upload.statusCode}`);
  }
}

export async function downloadDiskFile(
  token: string,
  diskPath: string,
  destLocalPath: string,
): Promise<void> {
  const meta = await apiJson<{href: string}>(
    token,
    `/resources/download?path=${encodeURIComponent(diskPath)}`,
  );
  const dl = await RNFS.downloadFile({fromUrl: meta.href, toFile: destLocalPath}).promise;
  if (dl.statusCode < 200 || dl.statusCode >= 300) {
    throw new Error(`Yandex download failed: HTTP ${dl.statusCode}`);
  }
}

export async function readDiskTextFile(token: string, diskPath: string): Promise<string | null> {
  try {
    const meta = await apiJson<{href: string}>(
      token,
      `/resources/download?path=${encodeURIComponent(diskPath)}`,
    );
    const res = await fetch(meta.href);
    if (!res.ok) {
      return null;
    }
    return res.text();
  } catch {
    return null;
  }
}

export async function writeDiskTextFile(
  token: string,
  diskPath: string,
  content: string,
): Promise<void> {
  const dir = diskPath.slice(0, diskPath.lastIndexOf('/'));
  if (dir) {
    await ensureDiskFolder(token, dir);
  }
  const tempPath = `${RNFS.CachesDirectoryPath}/yandex-upload-${Date.now()}.txt`;
  await RNFS.writeFile(tempPath, content, 'utf8');
  const filename = diskPath.split('/').pop() ?? 'file.txt';
  try {
    await uploadDiskFile(token, diskPath, tempPath, filename);
  } finally {
    await RNFS.unlink(tempPath).catch(() => undefined);
  }
}

export type DiskFolderItem = {
  name: string;
  path: string;
  modified?: string | null;
  sizeBytes?: number | null;
};

export async function listDiskFolder(
  token: string,
  diskPath: string,
  limit = 100,
): Promise<DiskFolderItem[]> {
  try {
    const data = await apiJson<{
      _embedded?: {items?: Array<{name: string; path: string; modified?: string; size?: number}>};
    }>(token, `/resources?path=${encodeURIComponent(diskPath)}&limit=${limit}`);
    const items = data._embedded?.items ?? [];
    return items.map(i => ({
      name: i.name,
      path: i.path,
      modified: i.modified ?? null,
      sizeBytes: i.size ?? null,
    }));
  } catch {
    return [];
  }
}

// --- Legacy FormaBackups API (unchanged behavior) ---

export async function ensureYandexBackupFolder(token: string): Promise<void> {
  await ensureDiskFolder(token, backupFolderPath());
}

export async function uploadYandexBackup(
  token: string,
  localPath: string,
  filename: string,
): Promise<void> {
  await ensureYandexBackupFolder(token);
  await uploadDiskFile(token, backupDiskPath(filename), localPath, filename);
}

export async function listYandexBackups(token: string): Promise<CloudBackupFile[]> {
  const items = await listDiskFolder(token, backupFolderPath());
  return items
    .filter(i => i.name.endsWith('.db'))
    .map(i => ({
      filename: i.name,
      remotePath: i.path,
      createdAt: i.modified ?? null,
      sizeBytes: i.sizeBytes ?? null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function downloadYandexBackup(
  token: string,
  filename: string,
  destLocalPath: string,
): Promise<void> {
  await downloadDiskFile(token, backupDiskPath(filename), destLocalPath);
}
