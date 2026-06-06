import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import {
  downloadFullDatabaseZip,
  type DatabaseExportStatus,
} from "../../../api/databaseExport";
import { useToast } from "../../../components/Toast";
import { useAuth } from "../../../auth/AuthContext";
import { useT } from "../../../i18n";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";

export function EmergencyDatabaseExport({ releaseLayout = false }: { releaseLayout?: boolean }) {
  const t = useT();
  const { showToast } = useToast();
  const { session } = useAuth();
  const userId = session?.userId ?? 1;
  const [progress, setProgress] = useState<DatabaseExportStatus | null>(null);

  const exportMut = useMutation({
    mutationFn: async () => {
      const api = window.electronAPI;
      if (api?.exportDatabaseZip) {
        return api.exportDatabaseZip({ userId });
      }
      await downloadFullDatabaseZip(setProgress);
    },
    onSuccess: (savedPath) => {
      setProgress(null);
      if (typeof savedPath === "string" && savedPath) {
        showToast(t("emergencyBackup.exportDonePath", { path: savedPath }), "success");
      } else {
        showToast(t("emergencyBackup.exportDone"), "success");
      }
    },
    onError: (e) => {
      setProgress(null);
      showToast(parseApiError(e), "error");
    },
  });

  const busy = exportMut.isPending;
  const pct = progress?.percent ?? 0;

  const title = releaseLayout
    ? "Создать резервную копию"
    : t("emergencyBackup.fullExportTitle");
  const description = releaseLayout
    ? "ZIP с workouts.db и shared.db для переноса или восстановления на этом ПК"
    : t("emergencyBackup.fullExportDesc");
  const hint = releaseLayout
    ? "Сохраните архив на диск. Восстановление — кнопкой ниже в этом же разделе."
    : t("emergencyBackup.fullExportHint");
  const buttonLabel = releaseLayout
    ? "Создать резервную копию"
    : t("emergencyBackup.exportButton");

  return (
    <SettingsSubsection title={title} description={description}>
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed mb-3">{hint}</p>
      {busy && progress ? (
        <div className="mb-3 space-y-2">
          <div
            className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-brand-600 transition-all duration-300"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            {progress.message}
            {pct > 0 ? ` · ${pct}%` : ""}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className="btn-primary text-sm"
        disabled={busy}
        onClick={() => exportMut.mutate()}
      >
        {busy ? t("emergencyBackup.exportRunning") : buttonLabel}
      </button>
    </SettingsSubsection>
  );
}
