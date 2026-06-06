import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {Linking} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import {cloudAuthUrl, fetchAuthMe, type AuthSession} from '../api/auth';
import {getApiBaseUrl} from '../config/apiBase';
import {setUserId} from '../api/client';
import {fetchYandexIdentity} from '../mode/yandexIdentity';
import {withTimeout} from '../utils/asyncTimeout';
import {logStartup} from '../debug/startupLog';
import {
  BOOTSTRAP_AUTH_MS,
} from '../startup/startupWatchdog';
import {
  isLocalFirstMode,
  LOCAL_DEVICE_USER_ID,
  operatingModeFromSession,
  sessionUserIdForMode,
  type OperatingMode,
} from '../mode/operatingMode';
import {getStoredYandexUid} from '../mode/yandexIdentity';
import {authorizeCloudProvider} from '../services/cloudOAuth';
import {CloudSyncService} from '../services/CloudSyncService';
import {
  clearSession,
  getStoredSession,
  isLocalHcTestMode as checkLocalHcTestMode,
  isApiMode as checkApiMode,
  saveSession,
  type StoredSession,
} from './session';
import {bootstrapStoredSession} from './sessionBootstrap';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  bootstrapped: boolean;
  session: StoredSession | null;
  isAuthenticated: boolean;
  isLocalHcTestMode: boolean;
  isApiMode: boolean;
  apiReachable: boolean;
  setSessionFromOAuth: (payload: {
    user_id: number;
    email?: string | null;
    provider?: string | null;
    operatingMode?: OperatingMode;
    yandexUid?: string | null;
  }) => Promise<void>;
  openCloudLogin: (provider: 'yandex' | 'google') => Promise<void>;
  loginAutonomousYandex: (mode?: 'autonomous' | 'cloud') => Promise<void>;
  loginAutonomousLocal: (mode?: 'autonomous' | 'cloud') => Promise<void>;
  loginLocalAdmin: () => Promise<void>;
  loginLocalHcTest: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseOAuthUrl(url: string): {
  user_id?: number;
  email?: string;
  provider?: string;
  status?: string;
} | null {
  if (!url.includes('auth/login')) {
    return null;
  }
  try {
    const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const params = new URLSearchParams(q);
    const uid = params.get('user_id');
    return {
      user_id: uid ? Number(uid) : undefined,
      email: params.get('email') ?? undefined,
      provider: params.get('provider') ?? undefined,
      status: params.get('status') ?? undefined,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [apiReachable, setApiReachable] = useState(true);

  const applyServerSession = useCallback(async (data: AuthSession) => {
    const next: StoredSession = {
      userId: data.user_id,
      email: data.email ?? null,
      cloudProvider: data.cloud_provider ?? null,
      appMode: 'api',
      operatingMode: 'legacy_api',
    };
    await saveSession(next);
    await setUserId(String(data.user_id));
    setSession(next);
    setApiReachable(true);
  }, []);

  const setSessionFromOAuth = useCallback(
    async (payload: {
      user_id: number;
      email?: string | null;
      provider?: string | null;
      appMode?: StoredSession['appMode'];
      operatingMode?: OperatingMode;
      yandexUid?: string | null;
    }) => {
      const operatingMode: OperatingMode =
        payload.operatingMode ??
        (payload.appMode === 'local_hc_test' ? 'local_hc_test' : 'legacy_api');
      const userId = sessionUserIdForMode(operatingMode, payload.user_id);
      const next: StoredSession = {
        userId,
        email: payload.email ?? null,
        cloudProvider: payload.provider ?? null,
        appMode: operatingMode === 'local_hc_test' ? 'local_hc_test' : 'api',
        operatingMode,
        yandexUid: payload.yandexUid ?? null,
      };
      await saveSession(next);
      await setUserId(String(userId));
      setSession(next);
    },
    [],
  );

  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (!url) {
        return;
      }
      const parsed = parseOAuthUrl(url);
      if (!parsed || parsed.status !== 'success' || !parsed.user_id) {
        return;
      }
      await setSessionFromOAuth({
        user_id: parsed.user_id,
        email: parsed.email,
        provider: parsed.provider,
        operatingMode: 'legacy_api',
      });
    },
    [setSessionFromOAuth],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      logStartup('auth', 'cold bootstrap started');
      try {
        const storedSession = await withTimeout(
          getStoredSession(),
          BOOTSTRAP_AUTH_MS,
          'get_stored_session',
        );
        if (!mounted) {
          return;
        }
        if (storedSession) {
          await setUserId(String(storedSession.userId));
          const fetchMeWithTimeout = () =>
            withTimeout(fetchAuthMe(), BOOTSTRAP_AUTH_MS, 'fetch_auth_me');
          let bootstrap;
          try {
            bootstrap = await withTimeout(
              bootstrapStoredSession(storedSession, fetchMeWithTimeout),
              BOOTSTRAP_AUTH_MS,
              'session_bootstrap',
            );
          } catch (err) {
            logStartup(
              'auth',
              `bootstrap timeout — keep local session: ${err instanceof Error ? err.message : err}`,
            );
            bootstrap = {action: 'keep_offline' as const, session: storedSession};
          }
          if (!mounted) {
            return;
          }
          if (bootstrap.action === 'apply_server') {
            await applyServerSession(bootstrap.auth);
            logStartup('auth', 'session restored via PC API');
          } else {
            setSession(bootstrap.session);
            setApiReachable(false);
            logStartup(
              'auth',
              `local session restored mode=${operatingModeFromSession(bootstrap.session)}`,
            );
          }
        }
      } catch (err) {
        logStartup(
          'auth',
          `init_blocker bootstrap: ${err instanceof Error ? err.message : err}`,
        );
      }
      if (mounted) {
        setBootstrapped(true);
        logStartup('auth', 'bootstrapped=true');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyServerSession]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({url}) => {
      void handleDeepLink(url);
    });
    Linking.getInitialURL()
      .then(u => handleDeepLink(u))
      .catch(() => undefined);
    return () => sub.remove();
  }, [handleDeepLink]);

  const loginAutonomousYandex = useCallback(
    async (mode: 'autonomous' | 'cloud' = 'autonomous') => {
      const tokens = await authorizeCloudProvider('yandex');
      await CloudSyncService.saveToken('yandex', tokens.accessToken, {
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      const identity = await withTimeout(
        fetchYandexIdentity(tokens.accessToken),
        15_000,
        'yandex.identity',
      );
      const previousUid = await getStoredYandexUid();
      if (previousUid && previousUid !== identity.yandexUid) {
        // Cloud identity changed; local SQLite rows stay under LOCAL_DEVICE_USER_ID.
        console.warn(
          `[auth] Yandex uid changed ${previousUid} → ${identity.yandexUid}; local DB unchanged`,
        );
      }
      const email =
        identity.login && !identity.login.includes('@')
          ? `${identity.login}@yandex.ru`
          : identity.login ?? null;
      await setSessionFromOAuth({
        user_id: LOCAL_DEVICE_USER_ID,
        email,
        provider: 'yandex',
        operatingMode: mode,
        yandexUid: identity.yandexUid,
      });
      setApiReachable(false);
    },
    [setSessionFromOAuth],
  );

  const loginAutonomousLocal = useCallback(
    async (mode: 'autonomous' | 'cloud' = 'autonomous') => {
      logStartup('auth', `local_login_started mode=${mode}`);
      await setSessionFromOAuth({
        user_id: LOCAL_DEVICE_USER_ID,
        email: null,
        provider: null,
        operatingMode: mode,
        yandexUid: null,
      });
      setApiReachable(false);
      logStartup('auth', 'local_session_created');
      logStartup('auth', 'navigation_target MainTabs|Onboarding');
      logStartup('auth', 'cloud_sync_skipped local mode');
    },
    [setSessionFromOAuth],
  );

  const loginLocalAdmin = useCallback(async () => {
    const base = await getApiBaseUrl();
    if (!base) {
      throw new Error('Укажите адрес API ПК перед входом.');
    }
    await setUserId('1');
    try {
      const me = await fetchAuthMe();
      await applyServerSession(me);
    } catch {
      await setSessionFromOAuth({
        user_id: 1,
        email: null,
        provider: 'local',
        operatingMode: 'legacy_api',
      });
      setApiReachable(false);
    }
  }, [applyServerSession, setSessionFromOAuth]);

  const loginLocalHcTest = useCallback(async () => {
    await setSessionFromOAuth({
      user_id: 1,
      email: null,
      provider: 'local_hc',
      operatingMode: 'local_hc_test',
    });
  }, [setSessionFromOAuth]);

  const openCloudLogin = useCallback(
    async (provider: 'yandex' | 'google') => {
      const base = await getApiBaseUrl();
      if (!base) {
        throw new Error('Укажите адрес API ПК в настройках или mobile/.env.');
      }
      const authUrl = cloudAuthUrl(provider, base);
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'myhealthdashboard://auth/login',
      );
      if (result.type === 'success' && result.url) {
        const parsed = parseOAuthUrl(result.url);
        if (parsed?.status === 'success' && parsed.user_id) {
          await setSessionFromOAuth({
            user_id: parsed.user_id,
            email: parsed.email,
            provider: parsed.provider,
            operatingMode: 'legacy_api',
          });
          setApiReachable(true);
          return;
        }
        throw new Error(
          'Вход не завершён. Добавьте в oauth.yandex.ru Redirect URI: ' +
            `${base}/api/cloud/callback/yandex`,
        );
      }
      if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('Вход отменён');
      }
      throw new Error(
        'Не удалось вернуться в приложение после авторизации. Проверьте Redirect URI в консоли OAuth.',
      );
    },
    [setSessionFromOAuth],
  );

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
    setApiReachable(true);
  }, []);

  const refreshSession = useCallback(async () => {
    const stored = await getStoredSession();
    if (!stored || checkLocalHcTestMode(stored) || isLocalFirstMode(stored)) {
      return;
    }
    const data = await fetchAuthMe();
    await applyServerSession(data);
  }, [applyServerSession]);

  const value = useMemo(
    () => ({
      bootstrapped,
      session,
      isAuthenticated: session != null,
      isLocalHcTestMode: checkLocalHcTestMode(session),
      isApiMode: checkApiMode(session),
      apiReachable,
      setSessionFromOAuth,
      openCloudLogin,
      loginAutonomousYandex,
      loginAutonomousLocal,
      loginLocalAdmin,
      loginLocalHcTest,
      logout,
      refreshSession,
    }),
    [
      bootstrapped,
      session,
      apiReachable,
      setSessionFromOAuth,
      openCloudLogin,
      loginAutonomousYandex,
      loginAutonomousLocal,
      loginLocalAdmin,
      loginLocalHcTest,
      logout,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
