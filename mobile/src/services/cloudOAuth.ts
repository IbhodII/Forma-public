import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {Platform} from 'react-native';

import {
  getGoogleAndroidRedirectScheme,
  getGoogleClientId,
  getYandexClientId,
  getYandexRedirectUri,
  GOOGLE_REDIRECT_URI,
  type CloudProvider,
} from '../config/cloudOAuth';
import {withTimeout} from '../utils/asyncTimeout';
import {CloudSyncService} from './CloudSyncService';
import {logOAuth} from './cloudOAuthDebug';
import {CloudOAuthError} from './cloudOAuthErrors';
import {
  cancelOAuthDeepLinkWait,
  type OAuthDeepLinkMatch,
  waitForOAuthDeepLink,
} from './oauthDeepLinkHandler';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_FLOW_TIMEOUT_MS = 90_000;
const DISMISS_DEEP_LINK_WAIT_MS = 15_000;

const YANDEX_SCOPES = [
  'cloud_api:disk.app_folder',
  'cloud_api:disk.read',
  'cloud_api:disk.write',
];

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function validateYandexRedirectUri(redirectUri: string): void {
  const trimmed = redirectUri.trim();
  if (!trimmed) {
    throw new CloudOAuthError(
      'misconfigured',
      'Не задан EXPO_PUBLIC_YANDEX_REDIRECT_URI',
    );
  }
  if (!/^myhealthdashboard:\/\/oauth\/yandex$/i.test(trimmed)) {
    throw new CloudOAuthError(
      'misconfigured',
      `Некорректный EXPO_PUBLIC_YANDEX_REDIRECT_URI: ${trimmed}. Ожидается myhealthdashboard://oauth/yandex`,
    );
  }
}

function googleRedirectUri(): string {
  const scheme = getGoogleAndroidRedirectScheme();
  if (scheme) {
    return `${scheme}:/oauth2redirect`;
  }
  return GOOGLE_REDIRECT_URI;
}

export function getCloudRedirectUris(): {yandex: string; google: string} {
  return {yandex: getYandexRedirectUri(), google: googleRedirectUri()};
}

function throwOAuthProviderError(
  provider: CloudProvider,
  error?: string,
  errorDescription?: string,
  redirectUri?: string,
): never {
  const code = (error || '').toLowerCase();
  if (code === 'access_denied') {
    throw new CloudOAuthError('access_denied', 'Доступ отклонён в Яндекс OAuth');
  }
  if (code.includes('redirect') || code.includes('uri')) {
    throw new CloudOAuthError(
      'redirect_mismatch',
      `Redirect URI не совпадает с oauth.yandex.ru. Зарегистрируйте: ${redirectUri ?? getYandexRedirectUri()}`,
      errorDescription,
    );
  }
  const detail = [error, errorDescription].filter(Boolean).join(': ');
  throw new CloudOAuthError(
    'provider_error',
    `Ошибка ${provider === 'yandex' ? 'Яндекс' : 'Google'} OAuth${detail ? `: ${detail}` : ''}`,
    detail || undefined,
  );
}

function resolveYandexDismiss(redirectUri: string): never {
  throw new CloudOAuthError(
    'dismiss_no_callback',
    `Не получен callback от Яндекс OAuth. Проверьте Redirect URI в oauth.yandex.ru: ${redirectUri}`,
  );
}

async function awaitDismissDeepLink(
  provider: 'yandex' | 'google',
  redirectUri: string,
): Promise<OAuthDeepLinkMatch | null> {
  logOAuth('deepLink.waitAfterDismiss', {provider, timeoutMs: DISMISS_DEEP_LINK_WAIT_MS});
  return waitForOAuthDeepLink(provider, redirectUri, DISMISS_DEEP_LINK_WAIT_MS);
}

async function runYandexImplicitOAuth(clientId: string): Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
}> {
  return withTimeout(
    runYandexOAuthInner(clientId),
    OAUTH_FLOW_TIMEOUT_MS,
    'yandex.oauth',
  );
}

async function runYandexOAuthInner(clientId: string): Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
}> {
  const redirectUri = getYandexRedirectUri();
  validateYandexRedirectUri(redirectUri);
  const discovery = {
    authorizationEndpoint: 'https://oauth.yandex.ru/authorize',
    tokenEndpoint: 'https://oauth.yandex.ru/token',
  };
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: YANDEX_SCOPES,
    usePKCE: true,
  });

  const authorizeUrl = await request.makeAuthUrlAsync(discovery);
  logOAuth('yandex.start', {
    clientId,
    redirectUri,
    scopes: YANDEX_SCOPES,
    responseType: 'code',
    usePKCE: true,
    authorizeUrl,
  });

  let result: AuthSession.AuthSessionResult;
  try {
    result = await request.promptAsync(discovery, {showInRecents: true});
  } catch (err) {
    cancelOAuthDeepLinkWait();
    logOAuth('yandex.promptError', {error: String(err)});
    throw err;
  }

  logOAuth('yandex.promptResult', {type: result.type, url: 'url' in result ? result.url : undefined});

  let code = result.type === 'success' ? (result.params.code as string | undefined) : undefined;
  let callbackError = result.type === 'success' ? (result.params.error as string | undefined) : undefined;
  let callbackErrorDescription =
    result.type === 'success' ? (result.params.error_description as string | undefined) : undefined;
  if (!code && (result.type === 'dismiss' || result.type === 'cancel')) {
    const deepLink = await awaitDismissDeepLink('yandex', redirectUri);
    logOAuth('yandex.deepLinkFallback', {match: deepLink?.url});
    if (deepLink) {
      code = deepLink.code;
      callbackError = deepLink.error;
      callbackErrorDescription = deepLink.errorDescription;
    } else {
      cancelOAuthDeepLinkWait();
      if (result.type === 'cancel') {
        throw new CloudOAuthError('user_cancelled', 'Вход отменён пользователем');
      }
      resolveYandexDismiss(redirectUri);
    }
  } else {
    cancelOAuthDeepLinkWait();
  }

  if (callbackError) {
    throwOAuthProviderError('yandex', callbackError, callbackErrorDescription, redirectUri);
  }

  if (result.type === 'cancel' && !code) {
    throw new CloudOAuthError('user_cancelled', 'Вход отменён пользователем');
  }

  if (result.type === 'dismiss' && !code) {
    resolveYandexDismiss(redirectUri);
  }

  if (!code) {
    throw new CloudOAuthError(
      'no_token',
      'Яндекс не вернул authorization code. Проверьте Redirect URI и права OAuth приложения.',
    );
  }

  let tokenRes: AuthSession.TokenResponse;
  try {
    tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {code_verifier: request.codeVerifier || ''},
      },
      discovery,
    );
  } catch (err) {
    logOAuth('yandex.tokenExchangeFailed', {
      error: err instanceof Error ? err.message : String(err),
      redirectUri,
      hasCodeVerifier: Boolean(request.codeVerifier),
    });
    throw new CloudOAuthError(
      'token_exchange_failed',
      'Не удалось обменять code на token (Яндекс). Проверьте, что OAuth-приложение поддерживает PKCE и верный Redirect URI.',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!tokenRes.accessToken) {
    throw new CloudOAuthError('no_token', 'Яндекс не вернул access_token');
  }

  const expiresAt =
    tokenRes.expiresIn != null
      ? new Date(Date.now() + tokenRes.expiresIn * 1000).toISOString()
      : null;

  logOAuth('yandex.token', {
    hasToken: true,
    hasRefreshToken: Boolean(tokenRes.refreshToken),
    expiresAt,
  });
  await CloudSyncService.saveToken('yandex', tokenRes.accessToken, {
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  });
  return {
    accessToken: tokenRes.accessToken,
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  };
}

async function runGoogleOAuth(clientId: string): Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}> {
  return withTimeout(runGoogleOAuthInner(clientId), OAUTH_FLOW_TIMEOUT_MS, 'google.oauth');
}

async function runGoogleOAuthInner(clientId: string): Promise<{
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}> {
  const redirectUri = googleRedirectUri();
  const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: {access_type: 'offline', prompt: 'consent'},
  });

  const authorizeUrl = await request.makeAuthUrlAsync(discovery);
  logOAuth('google.start', {clientId, redirectUri, authorizeUrl});

  let result: AuthSession.AuthSessionResult;
  try {
    result = await request.promptAsync(discovery, {showInRecents: true});
  } catch (err) {
    cancelOAuthDeepLinkWait();
    logOAuth('google.promptError', {error: String(err)});
    throw err;
  }

  logOAuth('google.promptResult', {type: result.type, url: 'url' in result ? result.url : undefined});

  let code = result.type === 'success' ? (result.params.code as string | undefined) : undefined;
  if (!code && (result.type === 'dismiss' || result.type === 'cancel')) {
    const deepLink = await awaitDismissDeepLink('google', redirectUri);
    code = deepLink?.code;
    if (!code) {
      cancelOAuthDeepLinkWait();
      if (result.type === 'cancel') {
        throw new CloudOAuthError('user_cancelled', 'Вход отменён пользователем');
      }
      throw new CloudOAuthError(
        'dismiss_no_callback',
        `Не получен callback Google OAuth. Redirect URI: ${redirectUri}`,
      );
    }
  } else {
    cancelOAuthDeepLinkWait();
  }

  if (result.type === 'cancel' && !code) {
    throw new CloudOAuthError('user_cancelled', 'Вход отменён пользователем');
  }

  if (!code) {
    throw new CloudOAuthError('no_token', 'Google не вернул authorization code');
  }

  let tokenRes: AuthSession.TokenResponse;
  try {
    tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {code_verifier: request.codeVerifier || ''},
      },
      discovery,
    );
  } catch (err) {
    logOAuth('google.tokenExchangeFailed', {error: String(err)});
    throw new CloudOAuthError(
      'token_exchange_failed',
      'Не удалось обменять code на token (Google)',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!tokenRes.accessToken) {
    throw new CloudOAuthError('no_token', 'Google не вернул access_token');
  }

  const expiresAt = tokenRes.expiresIn
    ? new Date(Date.now() + tokenRes.expiresIn * 1000).toISOString()
    : null;

  await CloudSyncService.saveToken('google', tokenRes.accessToken, {
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  });

  return {
    accessToken: tokenRes.accessToken,
    refreshToken: tokenRes.refreshToken ?? null,
    expiresAt,
  };
}

export async function authorizeCloudProvider(
  provider: CloudProvider,
): Promise<{accessToken: string; refreshToken?: string | null; expiresAt?: string | null}> {
  if (Platform.OS !== 'android') {
    throw new CloudOAuthError(
      'misconfigured',
      'Нативная облачная авторизация доступна только на Android',
    );
  }

  if (provider === 'yandex') {
    const clientId = getYandexClientId();
    if (!clientId) {
      throw new CloudOAuthError(
        'misconfigured',
        'Не задан EXPO_PUBLIC_YANDEX_CLIENT_ID',
      );
    }
    return runYandexImplicitOAuth(clientId);
  }

  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new CloudOAuthError('misconfigured', 'Не задан EXPO_PUBLIC_GOOGLE_CLIENT_ID');
  }

  return runGoogleOAuth(clientId);
}
