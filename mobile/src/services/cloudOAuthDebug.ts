const OAUTH_DEBUG =
  __DEV__ || process.env.EXPO_PUBLIC_OAUTH_DEBUG?.trim() === '1';

function maskClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 8) {
    return '***';
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function isOAuthDebugEnabled(): boolean {
  return OAUTH_DEBUG;
}

export function logOAuth(stage: string, payload?: Record<string, unknown>): void {
  if (!OAUTH_DEBUG) {
    return;
  }
  const safe = payload ? {...payload} : {};
  if (typeof safe.clientId === 'string') {
    safe.clientId = maskClientId(safe.clientId);
  }
  console.log(`[FormaOAuth] ${stage}`, safe);
}

export function parseOAuthCallbackUrl(url: string): {
  query: Record<string, string>;
  hash: Record<string, string>;
} {
  const query: Record<string, string> = {};
  const hash: Record<string, string> = {};
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');
  const queryPart =
    qIdx >= 0 ? url.slice(qIdx + 1, hIdx >= 0 ? hIdx : undefined) : '';
  const hashPart = hIdx >= 0 ? url.slice(hIdx + 1) : '';
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => {
      query[k] = v;
    });
  }
  if (hashPart) {
    new URLSearchParams(hashPart).forEach((v, k) => {
      hash[k] = v;
    });
  }
  return {query, hash};
}
