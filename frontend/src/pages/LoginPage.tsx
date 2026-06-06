import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { googleAuthPopupUrl, yandexAuthPopupUrl } from "../api/cloud";
import { useAuth } from "../auth/AuthContext";
import { resolveClientMode } from "../config/clientCapabilities";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { useClientCapabilities } from "../hooks/useClientCapabilities";
import { useElectronOAuthPopup, type OAuthPopupPayload } from "../hooks/useElectronOAuthPopup";
import { oauthFlowLog } from "../utils/oauthFlowLog";
import { Loader } from "../components/Loader";

type OAuthPayload = OAuthPopupPayload;

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setSessionFromOAuth, isAuthenticated, isReady, loginLocalDesktop } =
    useAuth();
  const caps = useClientCapabilities();
  const authWindowRef = useRef<Window | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [oauthOpen, setOauthOpen] = useState(false);

  const clientMode = resolveClientMode();
  const isAdminBrowser = clientMode === "admin_browser";
  const showLocalLogin = caps.enableLocalAdminLogin;

  useEffect(() => {
    if (isReady && isAuthenticated) {
      navigate("/workouts", { replace: true });
    }
  }, [isAuthenticated, isReady, navigate]);

  const applyOAuthPayload = useCallback(
    (data: OAuthPayload | null) => {
      if (!data?.type?.endsWith("-auth")) return;
      if (data.status !== "success" || !data.user_id) {
        if (data.status === "error") {
          showToast("Не удалось войти через облако", "error");
        }
        return;
      }
      setSessionFromOAuth({
        user_id: data.user_id,
        email: data.email,
        provider: data.provider,
      });
      showToast("Вход выполнен", "success");
      navigate("/workouts", { replace: true });
    },
    [navigate, setSessionFromOAuth, showToast],
  );

  useElectronOAuthPopup(applyOAuthPayload);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      applyOAuthPayload(event.data as OAuthPayload | null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyOAuthPayload]);

  const openOAuth = (url: string) => {
    oauthFlowLog("oauth_window_opened", { url: url.split("?")[0] });
    authWindowRef.current = window.open(url, "forma_oauth", "width=600,height=700");
  };

  const handleLocalLogin = async () => {
    setLocalLoading(true);
    try {
      await loginLocalDesktop();
      showToast("Локальный вход выполнен", "success");
      navigate("/workouts", { replace: true });
    } catch {
      showToast("Не удалось войти. Проверьте, что backend запущен.", "error");
    } finally {
      setLocalLoading(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[rgb(var(--app-surface))]">
        <Loader label="Запуск Forma…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[rgb(var(--app-surface))]">
      <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface-elevated))] p-8 shadow-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <img
              src="/logo.png"
              alt="Forma"
              className="h-11 w-11 rounded-md bg-white/80 dark:bg-slate-900/60 object-cover scale-[1.18]"
            />
            <h1 className="text-2xl font-semibold">{t("common.appName")}</h1>
          </div>
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            {showLocalLogin
              ? isAdminBrowser
                ? "Админский локальный вход (профиль user_id=1, без OAuth)"
                : "Локальный вход для ежедневной работы на этом компьютере"
              : clientMode === "desktop_app"
                ? "Данные на этом ПК. Облачный вход необязателен."
                : t("auth.subtitle")}
          </p>
        </div>

        {showLocalLogin ? (
          <>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={localLoading}
              onClick={() => void handleLocalLogin()}
            >
              {localLoading ? "Вход…" : t("auth.loginAdmin")}
            </button>

            <details
              className="rounded-xl border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-3 py-2"
              open={oauthOpen}
              onToggle={(e) => setOauthOpen(e.currentTarget.open)}
            >
              <summary className="cursor-pointer text-xs font-semibold text-[rgb(var(--app-text-muted))] select-none py-1">
                Облачный вход (экспериментально)
              </summary>
              <div className="space-y-2 pt-3 pb-1">
                <button
                  type="button"
                  className="btn-secondary w-full text-sm"
                  onClick={() => openOAuth(yandexAuthPopupUrl())}
                >
                  {t("auth.loginYandexServer")}
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full text-sm"
                  onClick={() => openOAuth(googleAuthPopupUrl())}
                >
                  {t("auth.loginGoogleServer")}
                </button>
              </div>
            </details>

            <p className="text-xs text-center text-[rgb(var(--app-text-muted))] leading-relaxed">
              Данные хранятся в локальной базе на этом ПК. Сессия сохраняется между запусками.
              OAuth Яндекс/Google не обязателен и может быть нестабилен.
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => openOAuth(yandexAuthPopupUrl())}
            >
              {t("auth.loginYandexServer")}
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => openOAuth(googleAuthPopupUrl())}
            >
              {t("auth.loginGoogleServer")}
            </button>
            <p className="text-xs text-center text-[rgb(var(--app-text-muted))]">
              Вход через Яндекс или Google для синхронизации между устройствами.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
