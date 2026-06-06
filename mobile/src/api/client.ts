import AsyncStorage from '@react-native-async-storage/async-storage';

import {clientModeHeaderValue} from '../config/clientCapabilities';
import {getApiBaseUrl as resolveApiBaseUrl} from '../config/apiBase';
import {invalidateApiBaseCache, resolveWorkingApiBase} from '../config/apiBaseResolver';
import {isOnline} from '../services/network';
import {buildApiUrl} from './url';

const USER_ID_KEY = 'user_id';
const FETCH_TIMEOUT_MS = 5000;
const OFFLINE_ERROR = 'OFFLINE';

export {getConfiguredApiBaseUrl, getApiBaseUrl} from '../config/apiBase';
export {normalizeApiBaseUrl} from './url';

export async function getUserId(): Promise<string | null> {
  const mhd = await AsyncStorage.getItem('mhd_user_id');
  if (mhd) {
    return mhd;
  }
  const stored = await AsyncStorage.getItem(USER_ID_KEY);
  return stored || null;
}

export async function setUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(USER_ID_KEY, userId);
}

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof TypeError)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error')
  );
}

async function apiFetchOnce(
  base: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const userId = await getUserId();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (userId) {
    headers.set('X-User-ID', userId);
  }
  headers.set('X-Forma-Client', clientModeHeaderValue());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(buildApiUrl(base, path), {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isOfflineFetchError(err: unknown): boolean {
  return err instanceof Error && err.message === OFFLINE_ERROR;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!(await isOnline())) {
    throw new Error(OFFLINE_ERROR);
  }

  let base = await resolveApiBaseUrl();
  if (!base) {
    throw new Error(
      'Не задан адрес API. Укажите локальный и/или Tailscale URL в настройках или в mobile/.env.',
    );
  }

  try {
    return await apiFetchOnce(base, path, init);
  } catch (err) {
    if (!isNetworkFailure(err)) {
      throw err;
    }
    invalidateApiBaseCache();
    const next = await resolveWorkingApiBase({force: true});
    if (!next || next === base) {
      throw err;
    }
    base = next;
    return apiFetchOnce(base, path, init);
  }
}
