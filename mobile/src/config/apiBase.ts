import Constants from 'expo-constants';

import {normalizeApiBaseUrl} from '../api/url';
import {getStoredApiEndpoints, type ApiEndpoints} from './apiBaseStorage';
import {invalidateApiBaseCache, resolveWorkingApiBase} from './apiBaseResolver';

export type {ApiEndpoints} from './apiBaseStorage';
export {invalidateApiBaseCache, getApiBaseCandidates, getMergedApiEndpoints} from './apiBaseResolver';

/** Эмулятор Android → localhost на ПК (только dev без EXPO_PUBLIC_API_BASE_URL). */
export const DEV_EMULATOR_API_BASE = 'http://10.0.2.2:8000';

function readEnv(name: string): string {
  const v = process.env[name]?.trim() ?? '';
  return v ? normalizeApiBaseUrl(v) : '';
}

function readLegacyEnvApiBase(): string {
  const fromPublic = readEnv('EXPO_PUBLIC_API_BASE_URL') || readEnv('EXPO_PUBLIC_API_BASE');
  if (fromPublic) {
    return fromPublic;
  }
  const extra = Constants.expoConfig?.extra as {apiBaseUrl?: string} | undefined;
  return normalizeApiBaseUrl(extra?.apiBaseUrl?.trim() ?? '');
}

function slotForUrl(url: string): keyof ApiEndpoints {
  if (/^https?:\/\/100\./i.test(url)) {
    return 'tailscale';
  }
  return 'local';
}

/** URL из .env при сборке (локальная сеть + Tailscale). */
export function getConfiguredApiEndpoints(): ApiEndpoints {
  const local = readEnv('EXPO_PUBLIC_API_BASE_URL_LOCAL');
  const tailscale = readEnv('EXPO_PUBLIC_API_BASE_URL_TAILSCALE');
  const legacy = readLegacyEnvApiBase();

  const out: ApiEndpoints = {local, tailscale};

  if (legacy && !out.local && !out.tailscale) {
    out[slotForUrl(legacy)] = legacy;
  } else if (legacy) {
    const slot = slotForUrl(legacy);
    if (!out[slot]) {
      out[slot] = legacy;
    }
  }

  if (!out.local && !out.tailscale && __DEV__) {
    out.local = DEV_EMULATOR_API_BASE;
  }

  return out;
}

/** Первый непустой URL из сборки (для подсказок). */
export function getConfiguredApiBaseUrl(): string {
  const endpoints = getConfiguredApiEndpoints();
  return endpoints.local || endpoints.tailscale || '';
}

/** Активный URL: последний рабочий или первый доступный из пары адресов. */
export async function getApiBaseUrl(): Promise<string> {
  const stored = await getStoredApiEndpoints();
  const configured = getConfiguredApiEndpoints();
  const hasAny =
    stored.local ||
    stored.tailscale ||
    configured.local ||
    configured.tailscale;

  if (!hasAny) {
    return '';
  }

  return resolveWorkingApiBase();
}

/** Подсказка, если URL заведомо не подходит для телефона или не задан. */
export function getApiBaseUrlHint(base: string): string | null {
  if (!base) {
    return (
      'Укажите адреса API: локальная сеть (Wi‑Fi) и/или Tailscale. ' +
      'Приложение подключится к тому, что доступен.'
    );
  }
  if (/127\.0\.0\.1|localhost/i.test(base)) {
    return 'С телефона 127.0.0.1 недоступен. Укажите IP ПК в Wi‑Fi, например http://192.168.1.10:8002.';
  }
  if (/10\.0\.2\.2/.test(base) && !__DEV__) {
    return '10.0.2.2 только для эмулятора. В .env укажите LAN-IP ПК и пересоберите APK.';
  }
  if (/^https?:\/\/100\./i.test(base)) {
    return (
      'Адрес Tailscale (100.x.x.x): на телефоне нужен установленный и включённый Tailscale. ' +
      'В одной Wi‑Fi сети без Tailscale используйте локальный адрес.'
    );
  }
  if (
    /^https?:\/\/192\.168\./i.test(base) ||
    /^https?:\/\/10\./i.test(base) ||
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i.test(base)
  ) {
    return (
      'Проверьте: на ПК запущен API (start.ps1), в логе порт 8000/8002, брандмауэр разрешает вход.'
    );
  }
  return null;
}
