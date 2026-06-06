import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  downloadCloudDatabaseBackup,
  remarkStrengthForSync,
} from "../../../api/backup";
import {
  fetchCloudBackupList,
  formaSyncUpload,
  startCloudBackup,
  type CloudProvider,
} from "../../../api/cloud";
import { useToast } from "../../../components/Toast";
import { useDeveloperTools } from "../../../hooks/useDeveloperTools";
import { useT } from "../../../i18n";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";

/** Диагностика облака и принудительная загрузка — только при включённых developer tools. */
export function DataBackupAdvancedPanel() {
  const t = useT();
  const { showToast } = useToast();
  const { developerToolsEnabled } = useDeveloperTools();
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>("yandex");
  const [cloudFilename, setCloudFilename] = useState("");

  const cloudListQuery = useQuery({
    queryKey: ["cloudBackupList", cloudProvider],
    queryFn: () => fetchCloudBackupList(cloudProvider),
    enabled: developerToolsEnabled,
  });

  const remarkMut = useMutation({
    mutationFn: remarkStrengthForSync,
    onSuccess: (r) =>
      showToast(
        `Помечено для синхронизации: ${r.rows_marked} строк, ${r.sessions} сессий`,
        "success",
      ),
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const forceCloudMut = useMutation({
    mutationFn: async (provider: CloudProvider) => {
      await startCloudBackup(provider, "database");
      await formaSyncUpload(true);
    },
    onSuccess: () => showToast(t("backup.cloudUploadDone"), "success"),
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  if (!developerToolsEnabled) {
    return (
      <p className="text-sm text-[rgb(var(--app-text-muted))]">
        Включите Developer Tools в разделе «О приложении», чтобы открыть диагностику облака.
      </p>
    );
  }

  const backups = cloudListQuery.data?.backups ?? [];

  return (
    <SettingsSubsection
      title={t("dev.cloudDiagnostics")}
      description={t("sync.emergencyDbBackup")}
    >
      <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3">
        Яндекс: <code className="text-xs">/MyHealthDashboard/Backups</code>. Мобильные бэкапы могут
        лежать в <code className="text-xs">FormaBackups/</code> (другой путь).
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={remarkMut.isPending}
          onClick={() => remarkMut.mutate()}
        >
          {t("dev.markStrengthSync")}
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={forceCloudMut.isPending}
          onClick={() => forceCloudMut.mutate("yandex")}
        >
          {t("dev.forceUploadDb")} (Яндекс)
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={forceCloudMut.isPending}
          onClick={() => forceCloudMut.mutate("google")}
        >
          {t("dev.forceUploadDb")} (Google)
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <span className="block text-[rgb(var(--app-text-muted))] mb-1">Провайдер</span>
          <select
            className="input-field text-sm"
            value={cloudProvider}
            onChange={(e) => setCloudProvider(e.target.value as CloudProvider)}
          >
            <option value="yandex">Yandex</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="block text-[rgb(var(--app-text-muted))] mb-1">Файл .db</span>
          <select
            className="input-field text-sm w-full"
            value={cloudFilename}
            onChange={(e) => setCloudFilename(e.target.value)}
          >
            <option value="">— выберите —</option>
            {backups.map((b) => (
              <option key={b.filename} value={b.filename}>
                {b.filename}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={!cloudFilename}
          onClick={() => {
            void downloadCloudDatabaseBackup(cloudProvider, cloudFilename).catch((e) =>
              showToast(parseApiError(e), "error"),
            );
          }}
        >
          Download Cloud Database
        </button>
      </div>
    </SettingsSubsection>
  );
}
