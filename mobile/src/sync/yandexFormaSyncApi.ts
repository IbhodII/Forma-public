import {CloudSyncService} from '../services/CloudSyncService';
import {
  downloadDiskFile,
  ensureDiskFolder,
  listDiskFolder,
  readDiskTextFile,
  uploadDiskFile,
  writeDiskTextFile,
} from '../services/cloud/yandexDiskApi';
import {getStoredYandexUid} from '../mode/yandexIdentity';
import {
  formaSyncHistoryManifestPath,
  formaSyncManifestPath,
  formaSyncPackagePath,
  formaSyncPackagesDir,
  formaSyncRootPath,
} from './formaSyncPaths';
import {parseManifest, type FormaSyncManifest} from './manifest';

async function requireToken(): Promise<string> {
  const token = await CloudSyncService.getToken('yandex');
  if (!token) {
    throw new Error('Яндекс.Диск не подключён');
  }
  return token;
}

export async function requireYandexUid(): Promise<string> {
  const uid = await getStoredYandexUid();
  if (!uid) {
    throw new Error('yandex_uid не найден. Войдите через Яндекс (автономно).');
  }
  return uid;
}

export async function ensureFormaSyncFolders(yandexUid: string): Promise<void> {
  const token = await requireToken();
  await ensureDiskFolder(token, formaSyncRootPath(yandexUid));
  await ensureDiskFolder(token, formaSyncPackagesDir(yandexUid));
  await ensureDiskFolder(token, `${formaSyncRootPath(yandexUid)}/history`);
}

export type RemoteManifestResult =
  | {status: 'ok'; manifest: FormaSyncManifest}
  | {status: 'missing'}
  | {status: 'invalid'};

export async function fetchRemoteManifestDetailed(
  yandexUid: string,
): Promise<RemoteManifestResult> {
  const token = await requireToken();
  const text = await readDiskTextFile(token, formaSyncManifestPath(yandexUid));
  if (!text?.trim()) {
    return {status: 'missing'};
  }
  const manifest = parseManifest(text);
  if (!manifest) {
    return {status: 'invalid'};
  }
  return {status: 'ok', manifest};
}

export async function fetchRemoteManifest(yandexUid: string): Promise<FormaSyncManifest | null> {
  const result = await fetchRemoteManifestDetailed(yandexUid);
  return result.status === 'ok' ? result.manifest : null;
}

export async function uploadManifest(
  yandexUid: string,
  manifest: FormaSyncManifest,
  previousManifest?: FormaSyncManifest | null,
): Promise<void> {
  const token = await requireToken();
  await ensureFormaSyncFolders(yandexUid);
  if (previousManifest) {
    await writeDiskTextFile(
      token,
      formaSyncHistoryManifestPath(yandexUid, previousManifest.revision),
      JSON.stringify(previousManifest, null, 2),
    );
  }
  await writeDiskTextFile(
    token,
    formaSyncManifestPath(yandexUid),
    JSON.stringify(manifest, null, 2),
  );
}

export async function uploadFormaSyncPackage(
  yandexUid: string,
  revision: number,
  localZipPath: string,
): Promise<void> {
  const token = await requireToken();
  await ensureFormaSyncFolders(yandexUid);
  const diskPath = formaSyncPackagePath(yandexUid, revision, 'mobile');
  const filename = `${String(revision).padStart(6, '0')}-mobile.zip`;
  await uploadDiskFile(token, diskPath, localZipPath, filename);
}

export async function downloadFormaSyncPackage(
  yandexUid: string,
  manifest: FormaSyncManifest,
  destLocalPath: string,
): Promise<void> {
  const token = await requireToken();
  const diskPath = `${formaSyncRootPath(yandexUid)}/${manifest.package}`;
  await downloadDiskFile(token, diskPath, destLocalPath);
}

export async function listFormaSyncPackages(yandexUid: string) {
  const token = await requireToken();
  return listDiskFolder(token, formaSyncPackagesDir(yandexUid));
}
