import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {AppState, InteractionManager} from 'react-native';

import {
  DB_INIT_TIMEOUT_MS,
  getDbInitError,
  initDB,
  resetInitAfterTimeout,
  retryInitDB,
} from '../database/index';
import {withTimeout} from '../utils/asyncTimeout';
import {logLoadEnd, logLoadError, logLoadStart, logLoadTimeout} from '../utils/loadDebug';
import {runInitialSyncIfNeeded} from '../services/SyncService';
import {subscribeNetwork} from '../services/network';
import {
  manualSyncNow,
  notifyLocalChange,
  onAppForeground,
  onNetworkReconnect,
  refreshBannerCounts,
} from '../sync/syncOrchestrator';

type OfflineContextValue = {
  isOnline: boolean;
  dbReady: boolean;
  dbInitError: string | null;
  retryDbInit: () => Promise<void>;
  syncMessage: string;
  syncing: boolean;
  syncNow: () => Promise<{ok: boolean; message?: string}>;
  notifyLocalChange: () => void;
};

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  dbReady: false,
  dbInitError: null,
  retryDbInit: async () => undefined,
  syncMessage: '',
  syncing: false,
  syncNow: async () => ({ok: false, message: 'База не готова'}),
  notifyLocalChange: () => undefined,
});

export function OfflineProvider({children}: {children: React.ReactNode}) {
  const [isOnline, setIsOnline] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const [dbInitError, setDbInitError] = useState<string | null>(null);

  const runDbInit = useCallback(async () => {
    logLoadStart('db.init');
    try {
      await withTimeout(initDB(), DB_INIT_TIMEOUT_MS, 'db.init');
      setDbReady(true);
      setDbInitError(null);
      logLoadEnd('db.init');
    } catch (err) {
      const isTimeout =
        err != null &&
        typeof err === 'object' &&
        'name' in err &&
        (err as {name?: string}).name === 'TimeoutError';
      if (isTimeout) {
        const msg = 'Таймаут инициализации БД. Повторите или перезапустите приложение.';
        resetInitAfterTimeout(msg);
        setDbInitError(msg);
        logLoadTimeout('db.init', DB_INIT_TIMEOUT_MS);
      } else {
        setDbInitError(getDbInitError());
        logLoadError('db.init', err);
      }
      setDbReady(false);
    }
  }, []);

  useEffect(() => {
    void runDbInit();
  }, [runDbInit]);

  const retryDbInit = useCallback(async () => {
    logLoadStart('db.init.retry');
    try {
      await withTimeout(retryInitDB(), DB_INIT_TIMEOUT_MS, 'db.init.retry');
      setDbReady(true);
      setDbInitError(null);
      logLoadEnd('db.init.retry');
    } catch (err) {
      const isTimeout =
        err != null &&
        typeof err === 'object' &&
        'name' in err &&
        (err as {name?: string}).name === 'TimeoutError';
      if (isTimeout) {
        const msg = 'Таймаут инициализации БД. Повторите или перезапустите приложение.';
        resetInitAfterTimeout(msg);
        setDbInitError(msg);
        logLoadTimeout('db.init.retry', DB_INIT_TIMEOUT_MS);
      } else {
        setDbInitError(getDbInitError());
        logLoadError('db.init.retry', err);
      }
      setDbReady(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!dbReady) {
      return {ok: false, message: dbInitError ?? 'База данных не готова'};
    }
    return manualSyncNow();
  }, [dbReady, dbInitError]);

  useEffect(() => {
    if (!dbReady) {
      return;
    }
    const unsubNet = subscribeNetwork(online => {
      setIsOnline(online);
      if (online) {
        void onNetworkReconnect();
      } else {
        void refreshBannerCounts();
      }
    });
    let syncCancelled = false;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const afterInteractions = InteractionManager.runAfterInteractions(() => {
      syncTimer = setTimeout(() => {
        if (!syncCancelled) {
          void runInitialSyncIfNeeded().then(() => notifyLocalChange());
        }
      }, 3000);
    });
    void refreshBannerCounts();

    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void onAppForeground();
      }
    });

    return () => {
      syncCancelled = true;
      if (syncTimer != null) {
        clearTimeout(syncTimer);
      }
      afterInteractions.cancel();
      unsubNet();
      appSub.remove();
    };
  }, [dbReady]);

  const onLocalChange = useCallback(() => {
    if (!dbReady) {
      return;
    }
    notifyLocalChange();
  }, [dbReady]);

  const value = useMemo(
    () => ({
      isOnline,
      dbReady,
      dbInitError,
      retryDbInit,
      syncMessage: '',
      syncing: false,
      syncNow,
      notifyLocalChange: onLocalChange,
    }),
    [isOnline, dbReady, dbInitError, retryDbInit, syncNow, onLocalChange],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext);
}
