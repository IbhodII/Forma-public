import RNFS from 'react-native-fs';

import {CLOUD_BACKUP_FOLDER} from '../../config/cloudOAuth';
import type {CloudBackupFile} from './types';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function driveJson<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Google Drive HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

async function findFolderId(token: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${CLOUD_BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const data = await driveJson<{files?: Array<{id: string}>}>(
    token,
    `${DRIVE}/files?q=${q}&fields=files(id)&pageSize=1`,
  );
  return data.files?.[0]?.id ?? null;
}

async function ensureFolderId(token: string): Promise<string> {
  const existing = await findFolderId(token);
  if (existing) {
    return existing;
  }
  const created = await driveJson<{id: string}>(token, `${DRIVE}/files`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: CLOUD_BACKUP_FOLDER,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  return created.id;
}

export async function uploadGoogleBackup(
  token: string,
  localPath: string,
  filename: string,
): Promise<void> {
  const folderId = await ensureFolderId(token);
  const base64 = await RNFS.readFile(localPath, 'base64');
  const boundary = `forma_${Date.now()}`;
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    mimeType: 'application/octet-stream',
  });
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/octet-stream\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    `${base64}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function listGoogleBackups(token: string): Promise<CloudBackupFile[]> {
  const folderId = await findFolderId(token);
  if (!folderId) {
    return [];
  }
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const data = await driveJson<{
    files?: Array<{id: string; name: string; createdTime?: string; size?: string}>;
  }>(token, `${DRIVE}/files?q=${q}&fields=files(id,name,createdTime,size)&pageSize=100`);
  return (data.files ?? [])
    .filter(f => f.name.endsWith('.db'))
    .map(f => ({
      filename: f.name,
      remotePath: f.id,
      createdAt: f.createdTime ?? null,
      sizeBytes: f.size ? Number(f.size) : null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function downloadGoogleBackup(
  token: string,
  fileId: string,
  destLocalPath: string,
): Promise<void> {
  const url = `${DRIVE}/files/${fileId}?alt=media`;
  const dl = await RNFS.downloadFile({
    fromUrl: url,
    toFile: destLocalPath,
    headers: {Authorization: `Bearer ${token}`},
  }).promise;
  if (dl.statusCode < 200 || dl.statusCode >= 300) {
    throw new Error(`Google download failed: HTTP ${dl.statusCode}`);
  }
}
