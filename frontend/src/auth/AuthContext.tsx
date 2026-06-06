import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchAuthMe, fetchDesktopLogin, type AuthSession } from "../api/auth";
import { resolveClientMode } from "../config/clientCapabilities";
import {
  clearSession,
  getStoredSession,
  saveSession,
  type StoredSession,
} from "./session";

type AuthContextValue = {
  session: StoredSession | null;
  isAuthenticated: boolean;
  /** false до проверки сохранённой сессии при старте */
  isReady: boolean;
  setSessionFromOAuth: (payload: {
    user_id: number;
    email?: string | null;
    provider?: string | null;
  }) => void;
  loginLocalDesktop: () => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());
  const [isReady, setIsReady] = useState(false);

  const applyServerSession = useCallback((data: AuthSession) => {
    const next: StoredSession = {
      userId: data.user_id,
      email: data.email ?? null,
      cloudProvider: data.cloud_provider ?? null,
    };
    saveSession(next);
    setSession(next);
  }, []);

  const setSessionFromOAuth = useCallback(
    (payload: { user_id: number; email?: string | null; provider?: string | null }) => {
      const next: StoredSession = {
        userId: payload.user_id,
        email: payload.email ?? null,
        cloudProvider: payload.provider ?? null,
      };
      saveSession(next);
      setSession(next);
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!getStoredSession()) return;
    const data = await fetchAuthMe();
    applyServerSession(data);
  }, [applyServerSession]);

  const loginLocalDesktop = useCallback(async () => {
    const data = await fetchDesktopLogin();
    applyServerSession(data);
  }, [applyServerSession]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = getStoredSession();
      if (stored) {
        try {
          const data = await fetchAuthMe();
          if (!cancelled) applyServerSession(data);
        } catch {
          if (!cancelled) {
            clearSession();
            setSession(null);
          }
        } finally {
          if (!cancelled) setIsReady(true);
        }
        return;
      }
      if (resolveClientMode() === "desktop_app") {
        try {
          const data = await fetchDesktopLogin();
          if (!cancelled) applyServerSession(data);
        } catch {
          if (!cancelled) setSession(null);
        }
      }
      if (!cancelled) setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyServerSession]);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: session != null,
      isReady,
      setSessionFromOAuth,
      loginLocalDesktop,
      logout,
      refreshSession,
    }),
    [session, isReady, setSessionFromOAuth, loginLocalDesktop, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
