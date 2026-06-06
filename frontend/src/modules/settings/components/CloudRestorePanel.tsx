import { useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import {
  fetchCloudBackupList,
  restoreCloudBackup,
  startCloudBackup,
  syncCloudWorkouts,
  type CloudBackupEntry,
  type CloudProvider,
} from "../../../api/cloud";
import { useToast } from "../../../components/Toast";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";
import { CloudFirstSyncModal } from "./CloudStorageSection";

export function CloudRestorePanel() {
  const { showToast } = useToast();
  const { refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [firstSyncProvider, setFirstSyncProvider] = useState<CloudProvider | null>(null);
  const [firstSyncBackups, setFirstSyncBackups] = useState<CloudBackupEntry[]>([]);

  const runAction = async (fn: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    try {
      await fn();
      if (successMessage) showToast(successMessage, "success");
    } catch (err) {
      showToast(parseApiError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const openRestore = async (provider: CloudProvider) => {
    try {
      const { backups } = await fetchCloudBackupList(provider);
      if (!backups.length) {
        showToast(
          provider === "yandex"
            ? "Бэкапы в Яндекс.Диске не найдены"
            : "Бэкапы в Google Drive не найдены",
          "error",
        );
        return;
      }
      setFirstSyncBackups(backups);
      setFirstSyncProvider(provider);
    } catch (e) {
      showToast(parseApiError(e), "error");
    }
  };

  return (
    <SettingsSubsection
      title="Из облака"
      description="Выберите файл backup_*.db — локальная база будет заменена"
    >
      <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed mb-3">
        Бэкапы в папке <code className="text-[11px]">Forma/Backups</code>. Перед восстановлением
        сделайте аварийный экспорт в разделе «Резервные копии».
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={() => void openRestore("yandex")}
        >
          Восстановить из Яндекс.Диска
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={() => void openRestore("google")}
        >
          Восстановить из Google Drive
        </button>
      </div>

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
    </SettingsSubsection>
  );
}
