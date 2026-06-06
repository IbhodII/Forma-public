import {getApiBaseUrlHint, getConfiguredApiBaseUrl} from '../config/apiBase';
import {normalizeApiBaseUrl} from './url';

export type PingServerResult =
  | {ok: true; base: string}
  | {ok: false; error: string; base: string};

const PING_TIMEOUT_MS = 10_000;

export async function pingServer(baseUrl?: string): Promise<PingServerResult> {
  const base = normalizeApiBaseUrl(baseUrl ?? getConfiguredApiBaseUrl());
  if (!base) {
    return {
      ok: false,
      base: '',
      error: getApiBaseUrlHint('') ?? 'Не задан адрес API',
    };
  }

  const configHint = getApiBaseUrlHint(base);
  if (configHint && (/127\.0\.0\.1|localhost|10\.0\.2\.2/i.test(base) || !base)) {
    return {ok: false, base, error: configHint};
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    if (!res.ok) {
      const hint = getApiBaseUrlHint(base);
      return {
        ok: false,
        base,
        error: `API ответил HTTP ${res.status}${hint ? `. ${hint}` : ''}`,
      };
    }
    return {ok: true, base};
  } catch (e) {
    const core =
      e instanceof Error
        ? e.name === 'AbortError'
          ? `Таймаут (${PING_TIMEOUT_MS / 1000} с)`
          : e.message
        : 'Не удалось подключиться';
    const hint = getApiBaseUrlHint(base);
    return {
      ok: false,
      base,
      error: hint ? `${core}. ${hint}` : core,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Проверяет несколько адресов параллельно; возвращает первый доступный. */
export async function pingFirstAvailable(bases: string[]): Promise<PingServerResult> {
  const unique = [...new Set(bases.map(b => normalizeApiBaseUrl(b.trim())).filter(Boolean))];
  if (unique.length === 0) {
    return {
      ok: false,
      base: '',
      error: getApiBaseUrlHint('') ?? 'Не задан адрес API',
    };
  }
  if (unique.length === 1) {
    return pingServer(unique[0]);
  }

  const results = await Promise.all(unique.map(base => pingServer(base)));
  const winner = results.find(r => r.ok);
  if (winner) {
    return winner;
  }

  const tried = unique.join(', ');
  const failed = results.find((r): r is Extract<PingServerResult, {ok: false}> => !r.ok);
  const firstErr = failed?.error ?? 'Ни один адрес не ответил';
  return {ok: false, base: unique[0]!, error: `${firstErr} (проверено: ${tried})`};
}
