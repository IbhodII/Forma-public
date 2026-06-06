import AsyncStorage from '@react-native-async-storage/async-storage';

import {normalizeApiBaseUrl} from '../api/url';

const API_BASE_OVERRIDE_KEY = 'mhd_api_base_url';
const API_ENDPOINTS_KEY = 'mhd_api_endpoints';
const LAST_WORKING_KEY = 'mhd_api_last_working';

export type ApiEndpoints = {
  local: string;
  tailscale: string;
};

const EMPTY_ENDPOINTS: ApiEndpoints = {local: '', tailscale: ''};

function normalizeEndpoint(url: string): string {
  if (!url?.trim()) {
    return '';
  }
  return normalizeApiBaseUrl(url.trim());
}

function parseEndpointsJson(raw: string | null): ApiEndpoints {
  if (!raw?.trim()) {
    return {...EMPTY_ENDPOINTS};
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ApiEndpoints>;
    return {
      local: normalizeEndpoint(parsed.local ?? ''),
      tailscale: normalizeEndpoint(parsed.tailscale ?? ''),
    };
  } catch {
    return {...EMPTY_ENDPOINTS};
  }
}

function classifyLegacyUrl(url: string): keyof ApiEndpoints {
  if (/^https?:\/\/100\./i.test(url)) {
    return 'tailscale';
  }
  return 'local';
}

/** @deprecated single URL — migrated into endpoints */
export async function getStoredApiBaseOverride(): Promise<string> {
  const raw = await AsyncStorage.getItem(API_BASE_OVERRIDE_KEY);
  if (!raw?.trim()) {
    return '';
  }
  return normalizeApiBaseUrl(raw.trim());
}

/** @deprecated — use setStoredApiEndpoints */
export async function setStoredApiBaseOverride(url: string): Promise<void> {
  const normalized = normalizeApiBaseUrl(url.trim());
  if (!normalized) {
    await AsyncStorage.removeItem(API_BASE_OVERRIDE_KEY);
    return;
  }
  await AsyncStorage.setItem(API_BASE_OVERRIDE_KEY, normalized);
  const slot = classifyLegacyUrl(normalized);
  const current = await getStoredApiEndpoints();
  await setStoredApiEndpoints({...current, [slot]: normalized});
}

export async function clearStoredApiBaseOverride(): Promise<void> {
  await AsyncStorage.removeItem(API_BASE_OVERRIDE_KEY);
  await setStoredApiEndpoints(EMPTY_ENDPOINTS);
  await clearLastWorkingApiBase();
}

export async function getStoredApiEndpoints(): Promise<ApiEndpoints> {
  const raw = await AsyncStorage.getItem(API_ENDPOINTS_KEY);
  let endpoints = parseEndpointsJson(raw);

  if (!endpoints.local && !endpoints.tailscale) {
    const legacy = await getStoredApiBaseOverride();
    if (legacy) {
      const slot = classifyLegacyUrl(legacy);
      endpoints = {...endpoints, [slot]: legacy};
    }
  }

  return endpoints;
}

export async function setStoredApiEndpoints(
  endpoints: Partial<ApiEndpoints>,
): Promise<void> {
  const current = await getStoredApiEndpoints();
  const next: ApiEndpoints = {
    local: normalizeEndpoint(endpoints.local ?? current.local),
    tailscale: normalizeEndpoint(endpoints.tailscale ?? current.tailscale),
  };

  if (!next.local && !next.tailscale) {
    await AsyncStorage.removeItem(API_ENDPOINTS_KEY);
    await AsyncStorage.removeItem(API_BASE_OVERRIDE_KEY);
    return;
  }

  await AsyncStorage.setItem(API_ENDPOINTS_KEY, JSON.stringify(next));
  await AsyncStorage.removeItem(API_BASE_OVERRIDE_KEY);
}

export async function getLastWorkingApiBase(): Promise<string> {
  const raw = await AsyncStorage.getItem(LAST_WORKING_KEY);
  if (!raw?.trim()) {
    return '';
  }
  return normalizeApiBaseUrl(raw.trim());
}

export async function setLastWorkingApiBase(url: string): Promise<void> {
  const normalized = normalizeApiBaseUrl(url.trim());
  if (!normalized) {
    await AsyncStorage.removeItem(LAST_WORKING_KEY);
    return;
  }
  await AsyncStorage.setItem(LAST_WORKING_KEY, normalized);
}

export async function clearLastWorkingApiBase(): Promise<void> {
  await AsyncStorage.removeItem(LAST_WORKING_KEY);
}
