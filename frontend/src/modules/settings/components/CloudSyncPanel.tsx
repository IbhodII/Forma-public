import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchGoogleCloudStatus, fetchYandexCloudStatus } from "../../../api/cloud";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { useSaveUserProfile, useUserProfile } from "../../../hooks/useUserProfile";
import { parseApiError } from "../../../utils/validation";
import { CLOUD_SYNC_OPTIONS } from "../types";
import { SettingsSubsection } from "./SettingsSection";

export function CloudSyncPanel() {
  const { showToast } = useToast();
  const { data, isLoading } = useUserProfile();
  const yandexStatus = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
  });
  const googleStatus = useQuery({
    queryKey: queryKeys.googleCloudStatus,
    queryFn: fetchGoogleCloudStatus,
  });
  const saveMut = useSaveUserProfile();
  const [provider, setProvider] = useState<"yandex" | "google">("yandex");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setProvider(data.cloud_sync_provider === "google" ? "google" : "yandex");
  }, [data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMut.mutate(
      { cloud_sync_provider: provider },
      {
        onSuccess: () => showToast("Провайдер облака сохранён", "success"),
        onError: (err) => {
          const msg = parseApiError(err);
          setFormError(msg);
          showToast(msg, "error");
        },
      },
    );
  };

  return (
    <SettingsSubsection
      title="Облачная синхронизация"
      description="Провайдер по умолчанию для бэкапа и синхронизации тренировок"
    >
      {formError && <ErrorAlert message={formError} />}

      <p className="text-sm text-[rgb(var(--app-text-muted))] mb-3 leading-relaxed">
        Какой облачный провайдер использовать для бэкапа тренировок (FIT) и полных копий БД.
        Подключение Яндекс.Диска для FormaSync — в блоке FormaSync выше.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="settings-provider-grid">
          {CLOUD_SYNC_OPTIONS.map((opt) => {
            const active = provider === opt.id;
            const connected =
              opt.id === "google"
                ? googleStatus.data?.connected === true
                : yandexStatus.data?.connected === true;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setProvider(opt.id)}
                disabled={isLoading || saveMut.isPending}
                className={`settings-provider-card ${active ? "settings-provider-card--active" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{opt.label}</p>
                  {active ? (
                    <span className="settings-integration-card__badge settings-integration-card__badge--ok">
                      Выбран
                    </span>
                  ) : connected ? (
                    <span className="settings-integration-card__badge settings-integration-card__badge--ok">
                      Подключён
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1.5">{opt.description}</p>
                <p className="text-[11px] text-[rgb(var(--app-text-muted))] mt-2">
                  Статус: {active ? "провайдер по умолчанию" : "доступен для выбора"}
                </p>
              </button>
            );
          })}
        </div>

        <button type="submit" disabled={isLoading || saveMut.isPending} className="btn-primary">
          {saveMut.isPending ? "Сохранение…" : "Сохранить провайдер"}
        </button>
      </form>
    </SettingsSubsection>
  );
}
