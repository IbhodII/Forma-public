import {getMeta, setMeta} from '../database/index';

export const SYNC_META_KEYS = {
  lastSeenRevision: 'forma_sync:last_seen_revision',
  lastUploadAt: 'forma_sync:last_upload_at',
  lastDownloadAt: 'forma_sync:last_download_at',
  exportWatermark: 'forma_sync:export_watermark',
  deviceId: 'forma_sync:device_id',
  lastError: 'forma_sync:last_error',
  tokenExpired: 'forma_sync:token_expired',
} as const;

export async function getLastSeenRevision(): Promise<number> {
  const raw = await getMeta(SYNC_META_KEYS.lastSeenRevision);
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setLastSeenRevision(revision: number): Promise<void> {
  await setMeta(SYNC_META_KEYS.lastSeenRevision, String(revision));
}

export async function getExportWatermark(): Promise<string | null> {
  return getMeta(SYNC_META_KEYS.exportWatermark);
}

export async function setExportWatermark(iso: string): Promise<void> {
  await setMeta(SYNC_META_KEYS.exportWatermark, iso);
}

export async function getLastUploadAt(): Promise<string | null> {
  return getMeta(SYNC_META_KEYS.lastUploadAt);
}

export async function setLastUploadAt(iso: string): Promise<void> {
  await setMeta(SYNC_META_KEYS.lastUploadAt, iso);
}

export async function getLastDownloadAt(): Promise<string | null> {
  return getMeta(SYNC_META_KEYS.lastDownloadAt);
}

export async function setLastDownloadAt(iso: string): Promise<void> {
  await setMeta(SYNC_META_KEYS.lastDownloadAt, iso);
}

export async function getFormaSyncDeviceId(): Promise<string | null> {
  return getMeta(SYNC_META_KEYS.deviceId);
}

export async function setFormaSyncDeviceId(deviceId: string): Promise<void> {
  await setMeta(SYNC_META_KEYS.deviceId, deviceId);
}

export async function getFormaSyncLastError(): Promise<string | null> {
  const raw = await getMeta(SYNC_META_KEYS.lastError);
  return raw && raw.trim() ? raw : null;
}

export async function setFormaSyncLastError(message: string | null): Promise<void> {
  if (message) {
    await setMeta(SYNC_META_KEYS.lastError, message);
  } else {
    await setMeta(SYNC_META_KEYS.lastError, '');
  }
}

export async function isFormaSyncTokenExpired(): Promise<boolean> {
  return (await getMeta(SYNC_META_KEYS.tokenExpired)) === '1';
}

export async function setFormaSyncTokenExpired(expired: boolean): Promise<void> {
  await setMeta(SYNC_META_KEYS.tokenExpired, expired ? '1' : '0');
  if (expired) {
    await setFormaSyncLastError('Токен Яндекс.Диска истёк — переподключите облако в настройках');
  }
}
