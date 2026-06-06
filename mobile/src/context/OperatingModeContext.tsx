import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {useAuth} from '../auth/AuthContext';
import {pingFirstAvailable} from '../api/ping';
import {getApiBaseUrl} from '../config/apiBase';
import {useOffline} from './OfflineContext';
import {
  isLegacyApiMode,
  isLocalFirstMode,
  modeLabel,
  operatingModeFromSession,
  requiresPcApi,
  type OperatingMode,
} from '../mode/operatingMode';

type OperatingModeContextValue = {
  mode: OperatingMode;
  modeLabel: string;
  apiReachable: boolean;
  dbReady: boolean;
  isLegacyApi: boolean;
  isLocalFirst: boolean;
  requiresPcApi: boolean;
  refreshApiReachability: () => Promise<void>;
};

const OperatingModeContext = createContext<OperatingModeContextValue | null>(null);
const PING_TIMEOUT_MS = 4000;

async function withPingTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ping timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function OperatingModeProvider({children}: {children: ReactNode}) {
  const {session, apiReachable: authApiReachable} = useAuth();
  const [apiReachable, setApiReachable] = useState(true);
  const {dbReady} = useOffline();

  const mode = operatingModeFromSession(session);

  useEffect(() => {
    if (!requiresPcApi(mode)) {
      setApiReachable(true);
      return;
    }
    setApiReachable(authApiReachable);
  }, [mode, authApiReachable]);

  const refreshApiReachability = useCallback(async () => {
    if (!requiresPcApi(mode)) {
      setApiReachable(true);
      return;
    }
    const base = await getApiBaseUrl();
    if (!base) {
      setApiReachable(false);
      return;
    }
    try {
      const ping = await withPingTimeout(pingFirstAvailable([base]), PING_TIMEOUT_MS);
      setApiReachable(ping.ok);
    } catch {
      setApiReachable(false);
    }
  }, [mode]);

  useEffect(() => {
    void refreshApiReachability();
  }, [refreshApiReachability, session?.userId]);

  const value = useMemo(
    (): OperatingModeContextValue => ({
      mode,
      modeLabel: modeLabel(mode),
      apiReachable,
      dbReady,
      isLegacyApi: isLegacyApiMode(session),
      isLocalFirst: isLocalFirstMode(session),
      requiresPcApi: requiresPcApi(mode),
      refreshApiReachability,
    }),
    [mode, apiReachable, dbReady, session, refreshApiReachability],
  );

  return (
    <OperatingModeContext.Provider value={value}>{children}</OperatingModeContext.Provider>
  );
}

export function useOperatingMode(): OperatingModeContextValue {
  const ctx = useContext(OperatingModeContext);
  if (!ctx) {
    throw new Error('useOperatingMode must be used within OperatingModeProvider');
  }
  return ctx;
}
