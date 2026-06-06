import {apiFetch} from './client';
import {isOnline} from '../services/network';
import {requireOnline} from '../services/onlineOnly';

export type CloudProvider = 'yandex' | 'google';

export type CloudBackupEntry = {
  filename: string;
  cloud_path?: string | null;
  created_at?: string | null;
  source_user_id?: number | null;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function fetchCloudBackupList(provider: CloudProvider) {
  await requireOnline();
  const res = await apiFetch(
    `/api/cloud/backup/list?provider=${encodeURIComponent(provider)}`,
  );
  return jsonOrThrow<{backups: CloudBackupEntry[]; user_id: number}>(res);
}

export async function fetchAutoBackupStatus() {
  if (!(await isOnline())) {
    return {enabled: false};
  }
  const res = await apiFetch('/api/cloud/auto-backup');
  return jsonOrThrow<{enabled: boolean}>(res);
}

export async function setAutoBackupEnabled(enable: boolean) {
  await requireOnline();
  const res = await apiFetch('/api/cloud/backup/auto', {
    method: 'POST',
    body: JSON.stringify({enable}),
  });
  return jsonOrThrow<{status: string; enabled: boolean}>(res);
}

export async function restoreCloudBackup(provider: CloudProvider, filename?: string) {
  await requireOnline();
  const res = await apiFetch('/api/cloud/backup/restore', {
    method: 'POST',
    body: JSON.stringify({provider, filename: filename ?? null}),
  });
  return jsonOrThrow<{status: string; message: string; filename?: string}>(res);
}

export async function fetchRemoteBackupStatus(provider: CloudProvider) {
  await requireOnline();
  const res = await apiFetch(
    `/api/cloud/backup/remote-status?provider=${encodeURIComponent(provider)}`,
  );
  return jsonOrThrow<{
    found: boolean;
    count?: number;
    latest?: CloudBackupEntry | null;
    provider: string;
  }>(res);
}
