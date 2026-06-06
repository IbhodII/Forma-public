import {normalizeApiBaseUrl} from './url';
import {apiFetch} from './client';

export type {PingServerResult} from './ping';
export {pingFirstAvailable, pingServer} from './ping';

export type AuthSession = {
  user_id: number;
  username: string;
  cloud_provider?: string | null;
  cloud_user_id?: string | null;
  email?: string | null;
  last_sync?: string | null;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAuthMe(): Promise<AuthSession> {
  const res = await apiFetch('/api/auth/me');
  return jsonOrThrow(res);
}

export function cloudAuthUrl(provider: 'yandex' | 'google', baseUrl: string): string {
  const base = normalizeApiBaseUrl(baseUrl);
  const q = new URLSearchParams({redirect_base: base});
  return `${base}/api/cloud/auth/${provider}?${q.toString()}`;
}
