/** Браузер сам добавляет http://; React Native fetch — нет. */
export function normalizeApiBaseUrl(url: string): string {
  let trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) {
    return trimmed;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  trimmed = trimmed.replace(/(?:\/api)+$/i, '');
  trimmed = trimmed.replace(/\/$/, '');
  return trimmed;
}

export const HC_SYNC_PATH = '/api/sync/health-connect';

/** Собирает полный URL; base без суффикса /api, path начинается с /api/... */
export function buildApiUrl(base: string, path: string): string {
  const normalizedBase = normalizeApiBaseUrl(base);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const full = `${normalizedBase}${normalizedPath}`;
  if (/\/api\/api\//i.test(full)) {
    console.warn('[buildApiUrl] double /api detected:', full);
  }
  return full;
}
