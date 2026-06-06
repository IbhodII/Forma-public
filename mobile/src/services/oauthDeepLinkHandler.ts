import {Linking} from 'react-native';

import {logOAuth, parseOAuthCallbackUrl} from './cloudOAuthDebug';

export type OAuthDeepLinkMatch = {
  url: string;
  provider: 'yandex' | 'google';
  accessToken?: string;
  expiresIn?: number;
  error?: string;
  errorDescription?: string;
  code?: string;
};

type PendingOAuth = {
  provider: 'yandex' | 'google';
  redirectUri: string;
  resolve: (match: OAuthDeepLinkMatch | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

let listenerRegistered = false;
let pending: PendingOAuth | null = null;

function providerFromUrl(url: string): 'yandex' | 'google' | null {
  const lower = url.toLowerCase();
  if (lower.includes('/yandex') || lower.includes('oauth.yandex')) {
    return 'yandex';
  }
  if (lower.includes('/google') || lower.includes('oauth.google') || lower.includes('oauth2redirect')) {
    return 'google';
  }
  return null;
}

function normalizeRedirectBase(url: string): string {
  const noHash = url.split('#')[0] ?? url;
  return (noHash.split('?')[0] ?? noHash).toLowerCase();
}

function matchFromUrl(
  url: string,
  expectedProvider: 'yandex' | 'google',
  expectedRedirectUri: string,
): OAuthDeepLinkMatch | null {
  const provider = providerFromUrl(url);
  if (provider !== expectedProvider) {
    return null;
  }
  if (normalizeRedirectBase(url) !== normalizeRedirectBase(expectedRedirectUri)) {
    logOAuth('deepLink.redirectMismatch', {
      url,
      expectedRedirectUri,
    });
    return null;
  }
  const {query, hash} = parseOAuthCallbackUrl(url);
  logOAuth('deepLink.parsed', {url, queryKeys: Object.keys(query), hashKeys: Object.keys(hash)});

  const accessToken = hash.access_token || query.access_token;
  const code = query.code;
  const error = query.error || hash.error;
  const errorDescription = query.error_description || hash.error_description;
  const expiresRaw = hash.expires_in || query.expires_in;
  const expiresIn = expiresRaw != null ? Number(expiresRaw) : undefined;

  if (!accessToken && !code && !error) {
    return null;
  }

  return {
    url,
    provider,
    accessToken: accessToken || undefined,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    error: error || undefined,
    errorDescription: errorDescription || undefined,
    code: code || undefined,
  };
}

function handleIncomingUrl(url: string | null): void {
  if (!url || !pending) {
    return;
  }
  logOAuth('deepLink.received', {url});
  const match = matchFromUrl(url, pending.provider, pending.redirectUri);
  if (!match) {
    return;
  }
  clearTimeout(pending.timer);
  const resolve = pending.resolve;
  pending = null;
  resolve(match);
}

export function registerOAuthDeepLinkListener(): void {
  if (listenerRegistered) {
    return;
  }
  listenerRegistered = true;
  Linking.addEventListener('url', event => {
    handleIncomingUrl(event.url);
  });
  void Linking.getInitialURL().then(handleIncomingUrl);
}

export function waitForOAuthDeepLink(
  provider: 'yandex' | 'google',
  redirectUri: string,
  timeoutMs = 120_000,
): Promise<OAuthDeepLinkMatch | null> {
  registerOAuthDeepLinkListener();
  if (pending) {
    clearTimeout(pending.timer);
    pending.resolve(null);
    pending = null;
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      if (pending?.resolve === resolve) {
        pending = null;
      }
      logOAuth('deepLink.timeout', {provider, redirectUri});
      resolve(null);
    }, timeoutMs);

    pending = {provider, redirectUri, resolve, timer};

    void Linking.getInitialURL().then(url => {
      if (!url) {
        return;
      }
      const match = matchFromUrl(url, provider, redirectUri);
      if (match && pending?.resolve === resolve) {
        clearTimeout(pending.timer);
        pending = null;
        resolve(match);
      }
    });
  });
}

export function cancelOAuthDeepLinkWait(): void {
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pending.resolve(null);
  pending = null;
}
