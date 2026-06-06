import {pingFirstAvailable} from '../api/ping';
import {
  getLastWorkingApiBase,
  getStoredApiEndpoints,
  setLastWorkingApiBase,
  type ApiEndpoints,
} from './apiBaseStorage';
import {getConfiguredApiEndpoints} from './apiBase';

let cachedBase: string | null = null;

export function invalidateApiBaseCache(): void {
  cachedBase = null;
}

export function mergeApiEndpoints(
  stored: ApiEndpoints,
  defaults: ApiEndpoints,
): ApiEndpoints {
  return {
    local: stored.local || defaults.local,
    tailscale: stored.tailscale || defaults.tailscale,
  };
}

export function listApiBaseCandidates(
  endpoints: ApiEndpoints,
  lastWorking?: string,
): string[] {
  const ordered: string[] = [];
  if (lastWorking) {
    ordered.push(lastWorking);
  }
  if (endpoints.local) {
    ordered.push(endpoints.local);
  }
  if (endpoints.tailscale) {
    ordered.push(endpoints.tailscale);
  }
  return [...new Set(ordered.filter(Boolean))];
}

export async function getMergedApiEndpoints(): Promise<ApiEndpoints> {
  const stored = await getStoredApiEndpoints();
  const defaults = getConfiguredApiEndpoints();
  return mergeApiEndpoints(stored, defaults);
}

export async function getApiBaseCandidates(): Promise<string[]> {
  const merged = await getMergedApiEndpoints();
  const lastWorking = await getLastWorkingApiBase();
  return listApiBaseCandidates(merged, lastWorking);
}

/** Параллельный ping — первый ответивший API. */
export async function resolveWorkingApiBase(opts?: {
  force?: boolean;
}): Promise<string> {
  if (!opts?.force && cachedBase) {
    return cachedBase;
  }

  const candidates = await getApiBaseCandidates();
  if (candidates.length === 0) {
    cachedBase = '';
    return '';
  }

  if (candidates.length === 1) {
    const only = candidates[0]!;
    const ping = await pingFirstAvailable([only]);
    if (ping.ok) {
      cachedBase = ping.base;
      await setLastWorkingApiBase(ping.base);
      return ping.base;
    }
    cachedBase = only;
    return only;
  }

  const ping = await pingFirstAvailable(candidates);
  if (ping.ok) {
    cachedBase = ping.base;
    await setLastWorkingApiBase(ping.base);
    return ping.base;
  }

  cachedBase = candidates[0]!;
  return cachedBase;
}
