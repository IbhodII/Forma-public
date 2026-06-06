import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fitStatsFromRecord,
  formatFitSyncToast,
  fitImportToastVariant,
  syncAllIntegrations,
  syncPolarFetch,
  syncPolarUpload,
} from "../../../api/sync";
import { fetchIntegrationSettings, saveIntegrationSettings } from "../../../api/user";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { PolarFileUploadModal } from "../../../components/PolarFileUploadModal";
import { SyncButton } from "../../../components/SyncButton";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { getApiStatus, parseApiError } from "../../../utils/validation";
import { FitFolderField } from "./FitFolderField";
import { SettingsSubsection } from "./SettingsSection";

/** Импорт FIT/GPX и Polar-файлов — без облачной синхронизации. */
export function FitImportBlock({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.integrationSettings,
    queryFn: fetchIntegrationSettings,
  });

  const [fitFolderPath, setFitFolderPath] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fitImportBusy, setFitImportBusy] = useState(false);
  const [polarUploadOpen, setPolarUploadOpen] = useState(false);

  useEffect(() => {
    if (data === undefined) return;
    setFitFolderPath(data.fit_folder_path ?? "");
  }, [data]);

  const saveMut = useMutation({
    mutationFn: saveIntegrationSettings,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.integrationSettings, saved);
      setFitFolderPath(saved.fit_folder_path ?? "");
      showToast("Путь сохранён", "success");
    },
    onError: (err) => {
      const msg = parseApiError(err);
      setFormError(msg);
      showToast(msg, "error");
    },
  });

  const syncMut = useMutation({
    mutationFn: () =>
      syncAllIntegrations({
        fitFolderPath: fitFolderPath.trim() || data?.fit_folder_path || null,
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["cardio"] });
      await qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
      const fit = res.items.find((item) => item.id === "fit");
      const polar = res.items.find((item) => item.id === "polar");
      if (fit?.stats) {
        const stats = fitStatsFromRecord(fit.stats);
        const variant = fitImportToastVariant(fit.status ?? "ok", stats);
        showToast(formatFitSyncToast(stats, variant), variant);
      }
      if (polar) {
        const newCount = Number((polar.stats as { new_count?: number } | undefined)?.new_count ?? 0);
        showToast(
          polar.status === "error"
            ? `${polar.name}: ${polar.message}`
            : newCount > 0
              ? `Polar: ${newCount} новых`
              : "Polar: нет новых",
          polar.status === "error" ? "error" : newCount > 0 ? "success" : "info",
        );
      }
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const polarSyncMut = useMutation({
    mutationFn: syncPolarFetch,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
      showToast(
        res.new_count > 0 ? `Найдено ${res.new_count} тренировок` : "Нет новых тренировок",
        res.new_count > 0 ? "success" : "info",
      );
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const polarUploadMut = useMutation({
    mutationFn: syncPolarUpload,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
      showToast(res.message || "Файл в очереди", "success");
      setPolarUploadOpen(false);
    },
    onError: (err) => {
      const status = getApiStatus(err);
      showToast(parseApiError(err), status === 409 ? "info" : "error");
    },
  });

  const effectiveFolder = fitFolderPath.trim() || data?.fit_folder_path || null;

  const body = (
    <div className="space-y-4">
      {formError ? <ErrorAlert message={formError} /> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          saveMut.mutate({ fit_folder_path: fitFolderPath.trim() || null });
        }}
        className="space-y-3"
      >
        <FitFolderField
          value={fitFolderPath}
          onChange={setFitFolderPath}
          effectivePath={data?.effective_fit_folder_path}
          disabled={saveMut.isPending || isLoading}
        />
        <button type="submit" className="btn-secondary text-sm" disabled={saveMut.isPending}>
          {saveMut.isPending ? "Сохранение…" : "Сохранить папку"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <SyncButton
          className="btn-secondary text-sm"
          fitFolderPath={effectiveFolder}
          onBusyChange={setFitImportBusy}
        />
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => polarSyncMut.mutate()}
          disabled={polarSyncMut.isPending || syncMut.isPending || fitImportBusy}
        >
          {polarSyncMut.isPending ? "Polar…" : "Синхронизация Polar"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => setPolarUploadOpen(true)}
          disabled={polarUploadMut.isPending}
        >
          Загрузить файл…
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending || fitImportBusy || polarSyncMut.isPending}
        >
          {syncMut.isPending ? "Импорт…" : "Импортировать всё"}
        </button>
      </div>
      <PolarFileUploadModal
        open={polarUploadOpen}
        loading={polarUploadMut.isPending}
        onClose={() => setPolarUploadOpen(false)}
        onUpload={(f) => polarUploadMut.mutate(f)}
      />
    </div>
  );

  if (embedded) return body;

  return (
    <SettingsSubsection
      title="FIT и файлы тренировок"
      description="Папка на диске, импорт .fit и загрузка файлов Polar"
    >
      {body}
    </SettingsSubsection>
  );
}
