import { useQuery } from "@tanstack/react-query";
import { fetchGoogleCloudStatus, fetchYandexCloudStatus } from "../../../api/cloud";
import { fetchIntegrationSettings } from "../../../api/user";
import { queryKeys } from "../../../hooks/queryKeys";
import { useUserProfile } from "../../../hooks/useUserProfile";

function StatusPill({
  label,
  state,
}: {
  label: string;
  state: "ok" | "warn" | "idle";
}) {
  return (
    <span className={`settings-status-pill settings-status-pill--${state}`}>
      <span className="settings-status-pill__dot" aria-hidden />
      {label}
    </span>
  );
}

export function SystemStatusBar() {
  const { data: profile } = useUserProfile();
  const { data: integrations } = useQuery({
    queryKey: queryKeys.integrationSettings,
    queryFn: fetchIntegrationSettings,
  });
  const { data: yandexCloud } = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
  });
  const { data: googleCloud } = useQuery({
    queryKey: queryKeys.googleCloudStatus,
    queryFn: fetchGoogleCloudStatus,
  });

  const fitPath = integrations?.effective_fit_folder_path?.trim();
  const cloudProvider = profile?.cloud_sync_provider ?? "yandex";
  const cloudActive =
    yandexCloud?.connected === true || googleCloud?.connected === true;

  return (
    <div className="settings-status-row" role="status" aria-label="Состояние системы">
      <StatusPill label="Локальное хранилище" state="ok" />
      <StatusPill
        label={fitPath ? "FIT импорт настроен" : "FIT: укажите папку"}
        state={fitPath ? "ok" : "warn"}
      />
      <StatusPill label="Polar: файлы / API" state="idle" />
      <StatusPill
        label={
          cloudActive
            ? `Облако: ${
                yandexCloud?.connected && googleCloud?.connected
                  ? "Yandex + Google"
                  : googleCloud?.connected
                    ? "Google"
                    : "Yandex"
              }`
            : `Облако: не подключено (${cloudProvider === "google" ? "Google" : "Yandex"} по умолч.)`
        }
        state={cloudActive ? "ok" : "idle"}
      />
    </div>
  );
}
