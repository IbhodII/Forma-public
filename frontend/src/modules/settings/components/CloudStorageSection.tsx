import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  fetchAutoBackupStatus,
  fetchCloudBackupList,
  fetchGoogleCloudStatus,
  fetchYandexCloudStatus,
  googleAuthPopupUrl,
  restoreCloudBackup,
  revokeGoogleCloud,
  revokeYandexCloud,
  setAutoBackupEnabled,
  startCloudBackup,
  syncCloudWorkouts,
  yandexAuthPopupUrl,
  type CloudBackupEntry,
  type CloudProvider,
} from "../../../api/cloud";
import { ModalShell } from "../../../components/ui/modal";
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
import { SettingsSubsection } from "./SettingsSection";

type OAuthMessageType = "yandex-disk-auth" | "google-drive-auth";

type OAuthPayload = OAuthPopupPayload;

export function CloudFirstSyncModal({
  provider,
  backups,
  busy,
  onUpload,
  onRestore,
  onSkip,
}: {
  provider: CloudProvider;
  backups: CloudBackupEntry[];
  busy: boolean;
  onUpload: () => void;
  onRestore: (filename: string) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState(backups[0]?.filename ?? "");

  const label = provider === "yandex" ? "Яндекс.Диск" : "Google Drive";

  return (
    <ModalShell
      open
      onClose={onSkip}
      title={`Синхронизация с ${label}`}
      description="Облако привязано к аккаунту. Данные в облаке общие для всех локальных профилей с этим входом."
      size="md"
      zIndex={55}
      footer={
        <button type="button" className="btn-secondary text-sm" onClick={onSkip}>
          Позже
        </button>
      }
    >
      <div className="space-y-4">
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={onUpload}>
          Загрузить текущие данные в облако
        </button>
        <div className="space-y-2 border-t border-[rgb(var(--app-border)/0.45)] pt-4">
          <p className="text-sm font-medium">Восстановить данные из облака</p>
          {backups.length === 0 ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))]">
              В облаке пока нет бэкапов. Сначала загрузите данные с другого профиля или сделайте
              бэкап.
            </p>
          ) : (
            <>
              <select
                className="input-field w-full text-sm"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {backups.map((b) => (
                  <option key={b.filename} value={b.filename}>
                    {b.filename}
                    {b.source_user_id != null ? ` (профиль ${b.source_user_id})` : ""}
                    {b.legacy ? " (старый формат)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary w-full"
                disabled={busy || !selected}
                onClick={() => onRestore(selected)}
              >
                Восстановить выбранный бэкап
              </button>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Локальная база будет полностью заменена. Перезапустите API после восстановления.
              </p>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function CloudProviderPanel({
  title,
  description,
  workoutsFolderHint,
  connected,
  accountLabel,
  isLoading,
  isError,
  error,
  onRetry,
  authPopupUrl,
  authMessageType,
  onAuthSuccess,
  onRefreshStatus,
  onRevoke,
  revokePending,
  busy,
  onRunAction,
  showToast,
  provider,
  extraConnectedContent,
}: {
  title: string;
  description: string;
  workoutsFolderHint: ReactNode;
  connected: boolean;
  accountLabel?: string | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  authPopupUrl: string;
  authMessageType: OAuthMessageType;
  onAuthSuccess: (payload?: OAuthPayload) => void;
  onRefreshStatus: () => void;
  onRevoke: () => void;
  revokePending: boolean;
  busy: boolean;
  onRunAction: (fn: () => Promise<void>, successMessage?: string) => void;
  showToast: (message: string, tone?: "success" | "error" | "info" | "warning") => void;
  provider: CloudProvider;
  extraConnectedContent?: ReactNode;
}) {
  const authWindowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAuthPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleConnect = () => {
    stopAuthPoll();
    oauthFlowLog("oauth_window_opened", { provider, url: authPopupUrl.split("?")[0] });
    authWindowRef.current = window.open(authPopupUrl, `${provider}_auth`, "width=600,height=700");
    pollRef.current = setInterval(() => {
      if (authWindowRef.current?.closed) {
        stopAuthPoll();
        onRefreshStatus();
      }
    }, 800);
  };

  const handleOAuthPayload = useCallback(
    (data: OAuthPayload) => {
      if (data?.type !== authMessageType) return;
      void onAuthSuccess(data);
    },
    [authMessageType, onAuthSuccess],
  );

  useElectronOAuthPopup(handleOAuthPayload);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      handleOAuthPayload((event.data as OAuthPayload | null) ?? {});
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleOAuthPayload]);

  useEffect(() => () => stopAuthPoll(), []);

  if (isLoading) {
    return (
      <SettingsSubsection title={title} description={description}>
        <Loader label="Проверка подключения…" />
      </SettingsSubsection>
    );
  }

  if (isError) {
    return (
      <SettingsSubsection title={title} description={description}>
        <ErrorAlert message={parseApiError(error)} />
        <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
          Повторить
        </button>
      </SettingsSubsection>
    );
  }

  return (
    <SettingsSubsection title={title} description={description}>
      <div className="settings-status-row mb-4 space-y-2">
        <span
          className={`settings-status-pill ${
            connected ? "settings-status-pill--ok" : "settings-status-pill--idle"
          }`}
        >
          <span className="settings-status-pill__dot" aria-hidden />
          {connected ? "Подключён" : "Не подключён"}
        </span>
        {connected && accountLabel && (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Аккаунт: <span className="font-medium text-[rgb(var(--app-text))]">{accountLabel}</span>
          </p>
        )}
      </div>

      {!connected ? (
        <button type="button" className="btn-primary" onClick={handleConnect}>
          Подключить {title}
        </button>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onRevoke}
              disabled={revokePending}
            >
              {revokePending ? "Отключение…" : "Отключить"}
            </button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Резервное копирование</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  onRunAction(
                    async () => {
                      await startCloudBackup(provider, "database");
                    },
                    "Бэкап базы данных запущен в фоне",
                  )
                }
              >
                Бэкап БД
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  onRunAction(
                    async () => {
                      await startCloudBackup(provider, "workouts");
                    },
                    "Бэкап тренировок запущен в фоне",
                  )
                }
              >
                Бэкап тренировок
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Синхронизация файлов тренировок (FIT/GPX)</h4>
            <p className="text-xs text-[rgb(var(--app-text-muted))]">
              {workoutsFolderHint} Не заменяет FormaSync (сущности БД).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy}
                onClick={() =>
                  onRunAction(async () => {
                    const res = await syncCloudWorkouts(provider, "upload");
                    const n = res.uploaded ?? 0;
                    showToast(
                      n === 0
                        ? "Нет новых FIT/GPX файлов для загрузки"
                        : `Загружено файлов тренировок: ${n}`,
                      n === 0 ? "info" : "success",
                    );
                  })
                }
              >
                Отправить FIT/GPX в облако
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  onRunAction(async () => {
                    const res = await syncCloudWorkouts(provider, "download");
                    const n = res.downloaded ?? 0;
                    showToast(
                      n === 0
                        ? "В облаке нет новых файлов тренировок для загрузки"
                        : `Скачано файлов тренировок: ${n}`,
                      n === 0 ? "info" : "success",
                    );
                  })
                }
              >
                Загрузить FIT/GPX из облака
              </button>
            </div>
          </div>

          {extraConnectedContent}
        </div>
      )}
    </SettingsSubsection>
  );
}

const PROVIDER_LABEL: Record<string, string> = {
  yandex: "Яндекс",
  google: "Google",
  local: "локальный",
};

export function CloudStorageSection() {
  const { showToast } = useToast();
  const { session, setSessionFromOAuth, logout, refreshSession } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<"yandex" | "google" | null>(null);
  const [firstSyncProvider, setFirstSyncProvider] = useState<CloudProvider | null>(null);
  const [firstSyncBackups, setFirstSyncBackups] = useState<CloudBackupEntry[]>([]);

  const yandexStatusQuery = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
  });

  const googleStatusQuery = useQuery({
    queryKey: queryKeys.googleCloudStatus,
    queryFn: fetchGoogleCloudStatus,
  });

  const autoBackupQuery = useQuery({
    queryKey: queryKeys.cloudAutoBackup,
    queryFn: fetchAutoBackupStatus,
    enabled: yandexStatusQuery.data?.connected === true,
  });

  const refreshYandex = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.yandexCloudStatus });
    void qc.invalidateQueries({ queryKey: queryKeys.cloudAutoBackup });
  }, [qc]);

  const refreshGoogle = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.googleCloudStatus });
  }, [qc]);

  const openFirstSyncDialog = async (provider: CloudProvider) => {
    try {
      const { backups } = await fetchCloudBackupList(provider);
      setFirstSyncBackups(backups);
      setFirstSyncProvider(provider);
    } catch (err) {
      showToast(parseApiError(err), "error");
    }
  };

  const handleOAuthFromSettings = (
    payload: OAuthPayload | undefined,
    provider: CloudProvider,
    refresh: () => void,
  ) => {
    void (async () => {
      const expectedType = provider === "yandex" ? "yandex-disk-auth" : "google-drive-auth";
      const label = provider === "yandex" ? "Яндекс.Диск" : "Google Drive";
      const applied = await applyCloudOAuthResult(payload, {
        expectedType,
        providerLabel: label,
        setSessionFromOAuth,
        refreshSession,
        showToast,
        queryClient: qc,
        invalidateKeys:
          provider === "yandex"
            ? [queryKeys.yandexCloudStatus, queryKeys.cloudAutoBackup, queryKeys.formaSyncStatus]
            : [queryKeys.googleCloudStatus, queryKeys.formaSyncStatus],
        onConnected: () => {
          refresh();
          void openFirstSyncDialog(provider);
        },
      });
      if (!applied && payload?.status === "success") {
        showToast("Облако подключено, но ответ OAuth не распознан", "error");
      }
    })();
  };

  const runAction = async (fn: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    try {
      await fn();
      if (successMessage) {
        showToast(successMessage, "success");
      }
    } catch (err) {
      showToast(parseApiError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const yandexRevokeMut = useMutation({
    mutationFn: revokeYandexCloud,
    onSuccess: () => {
      showToast("Аккаунт Яндекс.Диска отключён", "success");
      refreshYandex();
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const googleRevokeMut = useMutation({
    mutationFn: revokeGoogleCloud,
    onSuccess: () => {
      showToast("Аккаунт Google Drive отключён", "success");
      refreshGoogle();
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const autoBackupMut = useMutation({
    mutationFn: setAutoBackupEnabled,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.cloudAutoBackup, { enabled: data.enabled });
      showToast(
        data.enabled ? "Ежедневный бэкап БД включён" : "Автоматический бэкап отключён",
        "success",
      );
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const yandexAutoBackupBlock =
    yandexStatusQuery.data?.connected === true ? (
      <div className="rounded-xl border border-[rgb(var(--app-border)/0.85)] p-4 space-y-2">
        <h4 className="text-sm font-semibold">Автобэкап БД (раз в сутки)</h4>
        <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed">
          При включении сразу создаётся копия базы; далее — каждые 24 часа, пока работает сервер
          API.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-[rgb(var(--app-border))]"
            checked={autoBackupQuery.data?.enabled === true}
            disabled={autoBackupMut.isPending || autoBackupQuery.isLoading}
            onChange={(e) => autoBackupMut.mutate(e.target.checked)}
          />
          <span>Ежедневный бэкап базы в Яндекс.Диск</span>
        </label>
      </div>
    ) : null;

  const providerLabel = session?.cloudProvider
    ? PROVIDER_LABEL[session.cloudProvider] ?? session.cloudProvider
    : null;

  return (
    <div className="space-y-6">
      {session && (
        <div className="rounded-xl border border-[rgb(var(--app-border)/0.85)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-[rgb(var(--app-text-muted))]">Вход в приложение: </span>
              <span className="font-medium">
                {session.email || `user #${session.userId}`}
                {providerLabel ? ` (${providerLabel})` : ""}
              </span>
            </div>
            <button type="button" className="btn-secondary text-sm" onClick={logout}>
              Выйти
            </button>
          </div>
          {(yandexStatusQuery.data?.connected || googleStatusQuery.data?.connected) && (
            <div className="text-xs text-[rgb(var(--app-text-muted))] space-y-1 border-t border-[rgb(var(--app-border)/0.45)] pt-3">
              <p className="font-medium text-[rgb(var(--app-text))]">Облачные аккаунты</p>
              {yandexStatusQuery.data?.connected && (
                <p>
                  Яндекс.Диск —{" "}
                  <span className="text-[rgb(var(--app-text))]">
                    {yandexStatusQuery.data.account_label ?? "подключён"}
                  </span>
                </p>
              )}
              {googleStatusQuery.data?.connected && (
                <p>
                  Google Drive —{" "}
                  <span className="text-[rgb(var(--app-text))]">
                    {googleStatusQuery.data.account_label ?? "подключён"}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <CloudProviderPanel
        title="Яндекс.Диск"
        description="OAuth, бэкап базы и синхронизация FIT/GPX/TCX"
        workoutsFolderHint={
          <>
            Папка на диске:{" "}
            <code className="text-[11px]">/Health_Dashboard_Workouts/</code>
          </>
        }
        connected={yandexStatusQuery.data?.connected === true}
        accountLabel={yandexStatusQuery.data?.account_label}
        isLoading={yandexStatusQuery.isLoading}
        isError={yandexStatusQuery.isError}
        error={yandexStatusQuery.error}
        onRetry={() => void yandexStatusQuery.refetch()}
        authPopupUrl={yandexAuthPopupUrl(session?.userId)}
        authMessageType="yandex-disk-auth"
        onAuthSuccess={(payload) => handleOAuthFromSettings(payload, "yandex", refreshYandex)}
        onRefreshStatus={refreshYandex}
        onRevoke={() => setRevokeConfirm("yandex")}
        revokePending={yandexRevokeMut.isPending}
        busy={busy}
        onRunAction={runAction}
        showToast={showToast}
        provider="yandex"
        extraConnectedContent={yandexAutoBackupBlock}
      />

      <CloudProviderPanel
        title="Google Drive"
        description="OAuth, бэкап базы и синхронизация FIT/GPX/TCX"
        workoutsFolderHint={
          <>
            Папка на диске:{" "}
            <code className="text-[11px]">Health_Dashboard_Workouts</code>
          </>
        }
        connected={googleStatusQuery.data?.connected === true}
        accountLabel={googleStatusQuery.data?.account_label}
        isLoading={googleStatusQuery.isLoading}
        isError={googleStatusQuery.isError}
        error={googleStatusQuery.error}
        onRetry={() => void googleStatusQuery.refetch()}
        authPopupUrl={googleAuthPopupUrl(session?.userId)}
        authMessageType="google-drive-auth"
        onAuthSuccess={(payload) => handleOAuthFromSettings(payload, "google", refreshGoogle)}
        onRefreshStatus={refreshGoogle}
        onRevoke={() => setRevokeConfirm("google")}
        revokePending={googleRevokeMut.isPending}
        busy={busy}
        onRunAction={runAction}
        showToast={showToast}
        provider="google"
      />

      <ConfirmModal
        open={revokeConfirm === "yandex"}
        title="Отключить Яндекс.Диск?"
        message="Вы действительно хотите отключить аккаунт Яндекс.Диска?"
        confirmLabel="Отключить"
        danger
        loading={yandexRevokeMut.isPending}
        onCancel={() => setRevokeConfirm(null)}
        onConfirm={() => {
          yandexRevokeMut.mutate();
          setRevokeConfirm(null);
        }}
      />

      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        Полное восстановление из бэкапа — в настройках →{" "}
        <strong className="font-medium">Данные → Восстановление</strong>.
      </p>

      {firstSyncProvider ? (
        <CloudFirstSyncModal
          provider={firstSyncProvider}
          backups={firstSyncBackups}
          busy={busy}
          onSkip={() => setFirstSyncProvider(null)}
          onUpload={() => {
            void runAction(async () => {
              await startCloudBackup(firstSyncProvider, "database");
              const res = await syncCloudWorkouts(firstSyncProvider, "upload");
              showToast(
                `Бэкап запущен. Загружено тренировок: ${res.uploaded ?? 0}`,
                "success",
              );
              setFirstSyncProvider(null);
            });
          }}
          onRestore={(filename) => {
            void runAction(async () => {
              const res = await restoreCloudBackup(firstSyncProvider, filename);
              showToast(res.message, "success");
              setFirstSyncProvider(null);
              await refreshSession();
            });
          }}
        />
      ) : null}

      <ConfirmModal
        open={revokeConfirm === "google"}
        title="Отключить Google Drive?"
        message="Вы действительно хотите отключить аккаунт Google Drive?"
        confirmLabel="Отключить"
        danger
        loading={googleRevokeMut.isPending}
        onCancel={() => setRevokeConfirm(null)}
        onConfirm={() => {
          googleRevokeMut.mutate();
          setRevokeConfirm(null);
        }}
      />
    </div>
  );
}
