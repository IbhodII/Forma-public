import { useQuery } from "@tanstack/react-query";
import { fetchFormaSyncStatus } from "../../../api/cloud";
import { fetchGoogleCloudStatus, fetchYandexCloudStatus } from "../../../api/cloud";
import { fetchPolarConnectionStatus } from "../../../api/polar";
import { fetchHealthConnectHub } from "../../../api/sync";
import { fetchIntegrationSettings } from "../../../api/user";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import { queryKeys } from "../../../hooks/queryKeys";
import { formatSyncTimeShort } from "../../../pages/Home/dashboard/utils";

export type ConnectionTone = "ok" | "warn" | "off" | "future";

export type ConnectionRow = {
  id: string;
  connected: boolean;
  chip: string;
  tone: ConnectionTone;
  lastSync: string | null;
  meta: string;
};

export function useConnectionsStatus() {
  const caps = useClientCapabilities();
  const integrations = useQuery({
    queryKey: queryKeys.integrationSettings,
    queryFn: fetchIntegrationSettings,
  });
  const polar = useQuery({
    queryKey: queryKeys.polarConnectionStatus,
    queryFn: fetchPolarConnectionStatus,
  });
  const yandex = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
  });
  const google = useQuery({
    queryKey: queryKeys.googleCloudStatus,
    queryFn: fetchGoogleCloudStatus,
  });
  const forma = useQuery({
    queryKey: queryKeys.formaSyncStatus,
    queryFn: fetchFormaSyncStatus,
  });
  const hc = useQuery({
    queryKey: queryKeys.healthConnectHub,
    queryFn: fetchHealthConnectHub,
    enabled: caps.enableHealthConnectNav,
  });

  const fitConfigured = Boolean(integrations.data?.effective_fit_folder_path?.trim());
  const hcOverview = hc.data?.overview;
  const hcLast = hcOverview?.last_sync_at ?? null;
  const hcStale =
    hcOverview?.sync_status === "stale" ||
    hcOverview?.sync_status === "partial" ||
    hcOverview?.sync_status === "no_data";

  const polarConnected = Boolean(polar.data?.connected);
  const yandexConnected = Boolean(yandex.data?.connected);
  const googleConnected = Boolean(google.data?.connected);
  const cloudConnected = yandexConnected || googleConnected;

  const formaConnected = Boolean(forma.data?.yandex_connected);
  const formaWarn =
    forma.data?.baseline_required ||
    (forma.data?.conflict_count ?? 0) > 0 ||
    (forma.data?.pending_changes ?? 0) > 0;

  const rows: Record<string, ConnectionRow> = {
    "health-connect": {
      id: "health-connect",
      connected: Boolean(hcLast) && !hcStale,
      chip: !hcLast ? "Нет данных" : hcStale ? "Внимание" : "Подключено",
      tone: !hcLast ? "off" : hcStale ? "warn" : "ok",
      lastSync: hcLast,
      meta: hcLast ? `Обновлено ${formatSyncTimeShort(hcLast)}` : "Синхронизация с телефона",
    },
    polar: {
      id: "polar",
      connected: polarConnected,
      chip: polarConnected ? "Подключено" : "Не подключено",
      tone: polarConnected ? "ok" : "off",
      lastSync: null,
      meta: polarConnected ? "Polar Flow" : "Подключите аккаунт",
    },
    yandex: {
      id: "yandex",
      connected: yandexConnected,
      chip: yandexConnected ? "Подключено" : "Не подключено",
      tone: yandexConnected ? "ok" : "off",
      lastSync: forma.data?.last_upload_at ?? null,
      meta: yandexConnected ? "Яндекс.Диск" : "OAuth для облака",
    },
    google: {
      id: "google",
      connected: googleConnected,
      chip: googleConnected ? "Подключено" : "Скоро",
      tone: googleConnected ? "ok" : "future",
      lastSync: null,
      meta: googleConnected ? "Google Drive" : "В разработке",
    },
    forma: {
      id: "forma",
      connected: formaConnected && !formaWarn,
      chip: !formaConnected
        ? "Выкл"
        : forma.data?.baseline_required
          ? "Старт"
          : (forma.data?.conflict_count ?? 0) > 0
            ? "Конфликт"
            : "OK",
      tone: !formaConnected ? "off" : formaWarn ? "warn" : "ok",
      lastSync: forma.data?.last_upload_at ?? forma.data?.last_download_at ?? null,
      meta: formaConnected ? "FormaSync" : "Нужен Яндекс.Диск",
    },
    fit: {
      id: "fit",
      connected: fitConfigured,
      chip: fitConfigured ? "Папка задана" : "Настроить",
      tone: fitConfigured ? "ok" : "warn",
      lastSync: null,
      meta: fitConfigured ? "Импорт с диска" : "Укажите папку FIT",
    },
  };

  const isLoading =
    integrations.isLoading ||
    polar.isLoading ||
    yandex.isLoading ||
    forma.isLoading ||
    (caps.enableHealthConnectNav && hc.isLoading);

  return { rows, isLoading, fitConfigured, cloudConnected, forma, hc };
}
