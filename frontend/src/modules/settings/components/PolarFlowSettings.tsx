import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  disconnectPolar,
  fetchPolarConnectionStatus,
  polarAuthPopupUrl,
} from "../../../api/polar";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";

type PolarOAuthPayload = {
  type?: string;
  status?: string;
  message?: string;
};

export function PolarFlowSettings() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const authWindowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.polarConnectionStatus,
    queryFn: fetchPolarConnectionStatus,
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectPolar,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.polarConnectionStatus });
      showToast("Аккаунт Polar Flow отключён", "success");
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const refreshStatus = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.polarConnectionStatus });
  };

  const stopAuthPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleConnect = () => {
    if (!session?.userId) {
      showToast("Войдите в приложение, чтобы подключить Polar", "error");
      return;
    }
    stopAuthPoll();
    const url = polarAuthPopupUrl(session.userId);
    authWindowRef.current = window.open(url, "polar_auth", "width=600,height=700");
    pollRef.current = setInterval(() => {
      if (authWindowRef.current?.closed) {
        stopAuthPoll();
        refreshStatus();
      }
    }, 800);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as PolarOAuthPayload | null;
      if (data?.type !== "polar-auth") return;
      stopAuthPoll();
      if (authWindowRef.current && !authWindowRef.current.closed) {
        authWindowRef.current.close();
      }
      if (data.status === "success") {
        showToast(data.message || "Polar Flow подключён", "success");
        refreshStatus();
      } else if (data.status === "error") {
        showToast(data.message || "Не удалось подключить Polar", "error");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showToast]);

  useEffect(() => () => stopAuthPoll(), []);

  const connected = statusQuery.data?.connected === true;

  if (statusQuery.isLoading) {
    return (
      <SettingsSubsection
        title="Polar Flow"
        description="Синхронизация тренировок через Polar AccessLink"
      >
        <Loader label="Проверка подключения…" />
      </SettingsSubsection>
    );
  }

  if (statusQuery.isError) {
    return (
      <SettingsSubsection
        title="Polar Flow"
        description="Синхронизация тренировок через Polar AccessLink"
      >
        <ErrorAlert message={parseApiError(statusQuery.error)} />
        <button type="button" className="btn-secondary mt-3" onClick={() => statusQuery.refetch()}>
          Повторить
        </button>
      </SettingsSubsection>
    );
  }

  return (
    <SettingsSubsection
      title="Polar Flow"
      description="Личный аккаунт Polar Flow для этого профиля приложения"
    >
      <div className="settings-status-row mb-4 space-y-2">
        <span
          className={`settings-status-pill ${
            connected ? "settings-status-pill--ok" : "settings-status-pill--idle"
          }`}
        >
          <span className="settings-status-pill__dot" aria-hidden />
          {connected ? "Подключено" : "Не подключено"}
        </span>
        {connected && statusQuery.data?.polar_user_id ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Polar user ID: {statusQuery.data.polar_user_id}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => disconnectMut.mutate()}
            disabled={disconnectMut.isPending}
          >
            {disconnectMut.isPending ? "Отключение…" : "Отключить"}
          </button>
        ) : (
          <button type="button" className="btn-primary text-sm" onClick={handleConnect}>
            Подключить аккаунт Polar
          </button>
        )}
      </div>
    </SettingsSubsection>
  );
}
