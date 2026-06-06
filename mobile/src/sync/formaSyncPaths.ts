export const FORMA_SYNC_ROOT = 'FormaSync';

export function formaSyncRootPath(yandexUid: string): string {
  return `app:/${FORMA_SYNC_ROOT}/${yandexUid}`;
}

export function formaSyncManifestPath(yandexUid: string): string {
  return `${formaSyncRootPath(yandexUid)}/manifest.json`;
}

export function formaSyncPackagesDir(yandexUid: string): string {
  return `${formaSyncRootPath(yandexUid)}/packages`;
}

export function formaSyncHistoryDir(yandexUid: string): string {
  return `${formaSyncRootPath(yandexUid)}/history`;
}

export function formaSyncPackagePath(
  yandexUid: string,
  revision: number,
  sourceDevice: 'mobile' | 'desktop' = 'mobile',
): string {
  const padded = String(revision).padStart(6, '0');
  return `${formaSyncPackagesDir(yandexUid)}/${padded}-${sourceDevice}.zip`;
}

export function formaSyncPackageRelativePath(
  revision: number,
  sourceDevice: 'mobile' | 'desktop' = 'mobile',
): string {
  const padded = String(revision).padStart(6, '0');
  return `packages/${padded}-${sourceDevice}.zip`;
}

export function formaSyncHistoryManifestPath(yandexUid: string, revision: number): string {
  return `${formaSyncHistoryDir(yandexUid)}/manifest-${revision}.json`;
}
