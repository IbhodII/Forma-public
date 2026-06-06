import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchYandexCloudStatus, fetchOAuthStatus, revokeYandexCloud, yandexAuthPopupUrl } from "../../../api/cloud";
import { useAuth } from "../../../auth/AuthContext";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { useElectronOAuthPopup, type OAuthPopupPayload } from "../../../hooks/useElectronOAuthPopup";
import { queryKeys } from "../../../hooks/queryKeys";
import { applyCloudOAuthResult } from "../../../utils/applyCloudOAuthResult";
import { oauthFlowLog } from "../../../utils/oauthFlowLog";
import { parseApiError } from "../../../utils/validation";

type OAuthPayload = OAuthPopupPayload;

export function YandexDiskConnectBlock({ compact = false }: { compact?: boolean }) {
  const { showToast } = useToast();
  const { session, setSessionFromOAuth, refreshSession } = useAuth();
  const qc = useQueryClient();
  const authWindowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.yandexCloudStatus });
    void qc.invalidateQueries({ queryKey: queryKeys.formaSyncStatus });
  }, [qc]);

  const revokeMut = useMutation({
    mutationFn: revokeYandexCloud,
    onSuccess: () => {
      refresh();
      showToast("Яндекс.Диск отключён", "success");
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const stopAuthPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleConnect = () => {
    stopAuthPoll();
    oauthFlowLog("oauth_window_opened", { provider: "yandex" });
    authWindowRef.current = window.open(
      yandexAuthPopupUrl(session?.userId),
      "yandex_auth",
      "width=600,height=700",
    );
    pollRef.current = setInterval(() => {
      if (authWindowRef.current?.closed) {
        stopAuthPoll();
        refresh();
        void fetchOAuthStatus()
          .then((status) => oauthFlowLog("oauth_post_close_status", status))
          .catch((err) => oauthFlowLog("oauth_post_close_status_failed", err));
      }
    }, 800);
  };

  const handleOAuthSuccess = useCallback(
    (data: OAuthPayload) => {
      if (data?.type !== "yandex-disk-auth") return;
      void applyCloudOAuthResult(data, {
        expectedType: "yandex-disk-auth",
        providerLabel: "Яндекс.Диск",
        setSessionFromOAuth,
        refreshSession,
        showToast,
        queryClient: qc,
        invalidateKeys: [queryKeys.yandexCloudStatus, queryKeys.formaSyncStatus],
        onConnected: refresh,
      });
    },
    [qc, refresh, refreshSession, setSessionFromOAuth, showToast],
  );

  useElectronOAuthPopup(handleOAuthSuccess);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      void handleOAuthSuccess((event.data as OAuthPayload | null) ?? {});
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleOAuthSuccess]);

  useEffect(() => () => stopAuthPoll(), []);

  if (statusQuery.isLoading) {
    return compact ? <Loader label="Яндекс.Диск…" /> : <Loader label="Проверка Яндекс.Диска…" />;
  }

  if (statusQuery.isError) {
    return (
      <div className="space-y-2">
        <ErrorAlert message={parseApiError(statusQuery.error)} />
        <button type="button" className="btn-secondary text-sm" onClick={() => void statusQuery.refetch()}>
          Повторить
        </button>
      </div>
    );
  }

  const connected = statusQuery.data?.connected === true;
  const label = statusQuery.data?.account_label;

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-[rgb(var(--app-border)/0.85)] p-4 space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`settings-status-pill ${
            connected ? "settings-status-pill--ok" : "settings-status-pill--idle"
          }`}
        >
          <span className="settings-status-pill__dot" aria-hidden />
          {connected ? "Яндекс.Диск подключён" : "Яндекс.Диск не подключён"}
        </span>
        {connected && label ? (
          <span className="text-sm text-[rgb(var(--app-text-muted))]">
            {label}
          </span>
        ) : null}
      </div>

      {!connected ? (
        <>
          <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
            Для FormaSync нужен доступ к Яндекс.Диску. Нажмите кнопку и подтвердите права приложения
            (чтение и запись на Диск).
          </p>
          <button type="button" className="btn-primary" onClick={handleConnect}>
            Подключить Яндекс.Диск
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={revokeMut.isPending}
          onClick={() => setRevokeOpen(true)}
        >
          {revokeMut.isPending ? "Отключение…" : "Отключить Яндекс.Диск"}
        </button>
      )}

      <ConfirmModal
        open={revokeOpen}
        title="Отключить Яндекс.Диск?"
        message="FormaSync и облачные бэкапы перестанут работать, пока вы не подключите Диск снова."
        confirmLabel="Отключить"
        danger
        loading={revokeMut.isPending}
        onCancel={() => setRevokeOpen(false)}
        onConfirm={() => {
          revokeMut.mutate();
          setRevokeOpen(false);
        }}
      />
    </div>
  );
}
