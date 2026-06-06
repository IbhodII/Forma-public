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

import { SyncButton } from "../../../components/SyncButton";

import {

  fetchIntegrationSettings,

  saveIntegrationSettings,

} from "../../../api/user";

import { ErrorAlert } from "../../../components/ErrorAlert";

import { Loader } from "../../../components/Loader";

import { PolarFileUploadModal } from "../../../components/PolarFileUploadModal";

import { useToast } from "../../../components/Toast";

import { queryKeys } from "../../../hooks/queryKeys";

import { getApiStatus, parseApiError } from "../../../utils/validation";

import { CollapsibleSection } from "./CollapsibleSection";



export function IntegrationSettings({ embedded = false }: { embedded?: boolean }) {

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

      showToast("Настройки интеграций сохранены", "success");

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
        const polarVariant =
          polar.status === "error" ? "error" : newCount > 0 ? "success" : "info";
        showToast(
          polar.status === "error"
            ? `${polar.name}: ${polar.message}`
            : newCount > 0
              ? `Polar: найдено ${newCount} новых тренировок`
              : "Polar: нет новых тренировок",
          polarVariant,
        );
      }

      if (!fit?.stats && !polar) {
        showToast(res.message, res.status === "error" ? "error" : "info");
      }
    },

    onError: (err) => showToast(parseApiError(err), "error"),

  });



  const polarSyncMut = useMutation({

    mutationFn: syncPolarFetch,

    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
      const variant = res.new_count > 0 ? "success" : "info";

      showToast(

        res.new_count > 0

          ? `Найдено ${res.new_count} новых тренировок`

          : "Нет новых тренировок",

        variant,

      );

    },

    onError: (err) => showToast(parseApiError(err), "error"),

  });

  const polarUploadMut = useMutation({
    mutationFn: syncPolarUpload,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
      showToast(
        res.message ||
          "Тренировка успешно импортирована и добавлена в список ожидания. Вы можете привязать её к тренировке в дашборде.",
        "success",
      );
      setPolarUploadOpen(false);
    },
    onError: (err) => {
      const status = getApiStatus(err);
      const msg = parseApiError(err);
      if (status === 409) {
        showToast(msg || "Тренировка уже была загружена ранее", "info");
      } else {
        showToast(msg, "error");
      }
    },
  });



  const submit = (e: React.FormEvent) => {

    e.preventDefault();

    setFormError(null);

    saveMut.mutate({

      fit_folder_path: fitFolderPath.trim() || null,

    });

  };



  const effectiveFolder = fitFolderPath.trim() || data?.fit_folder_path || null;



  return (

    <CollapsibleSection

      title="Интеграции"

      description="Пути к внешним данным и импорт FIT"

      defaultOpen={false}

      embedded={embedded}

    >

      {isLoading && <Loader label="Загрузка…" />}

      {formError && <ErrorAlert message={formError} />}



      <form onSubmit={submit} className="space-y-4">

        <label className="block text-sm space-y-1.5">

          <span className="font-medium text-slate-700 dark:text-slate-200">

            Путь к папке с FIT-файлами

          </span>

          <input

            type="text"

            value={fitFolderPath}

            onChange={(e) => setFitFolderPath(e.target.value)}

            placeholder="E:\fit activity или ./fit_files"

            className="input-field font-mono text-sm"

            disabled={isLoading || saveMut.isPending}

            autoComplete="off"

            spellCheck={false}

          />

        </label>



        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">

          Укажите папку, откуда fit_importer будет читать .fit-файлы. Можно указать абсолютный

          путь (C:\...) или относительный (например, <code className="text-[11px]">fit_files/</code>{" "}

          в папке проекта). Пустое поле — путь по умолчанию (

          <code className="text-[11px]">E:\fit activity</code> или{" "}

          <code className="text-[11px]">./fit_files</code>).

        </p>



        {data?.effective_fit_folder_path && (

          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">

            Сейчас импорт использует:{" "}

            <span className="font-mono text-slate-700 dark:text-slate-300 break-all">

              {data.effective_fit_folder_path}

            </span>

          </p>

        )}



        <button type="submit" disabled={isLoading || saveMut.isPending} className="btn-primary">

          {saveMut.isPending ? "Сохранение…" : "Сохранить"}

        </button>

      </form>



      <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700 space-y-3">

        <div>

          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">

            Синхронизация данных

          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">

            Импорт FIT выполняется в фоне на сервере. Polar AccessLink загружает новые тренировки

            в очередь ожидания — для API нужна авторизация Polar в настройках интеграций.

            Также можно загрузить файл TCX, GPX или FIT вручную.

          </p>

        </div>

        <div className="flex flex-wrap gap-2">

          <SyncButton

            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-60 dark:border-brand-800 dark:text-brand-300 dark:bg-brand-950/40 dark:hover:bg-brand-900/50"

            fitFolderPath={effectiveFolder}

            onBusyChange={setFitImportBusy}
          />

          <button

            type="button"

            onClick={() => syncMut.mutate()}

            disabled={isLoading || syncMut.isPending || fitImportBusy || polarSyncMut.isPending}

            className="btn-secondary text-sm"

          >

            {syncMut.isPending ? "Синхронизация…" : "Все интеграции"}

          </button>

          <button

            type="button"

            onClick={() => polarSyncMut.mutate()}

            disabled={isLoading || syncMut.isPending || fitImportBusy || polarSyncMut.isPending}

            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800"

          >

            {polarSyncMut.isPending && (

              <span

                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"

                aria-hidden

              />

            )}

            {polarSyncMut.isPending ? "Синхронизация…" : "Синхронизировать с Polar"}

          </button>

          <button
            type="button"
            onClick={() => setPolarUploadOpen(true)}
            disabled={
              isLoading ||
              syncMut.isPending ||
              fitImportBusy ||
              polarSyncMut.isPending ||
              polarUploadMut.isPending
            }
            className="btn-secondary text-sm"
          >
            {polarUploadMut.isPending ? "Загрузка…" : "Импортировать тренировку из файла"}
          </button>

        </div>

      </div>



      <PolarFileUploadModal
        open={polarUploadOpen}
        loading={polarUploadMut.isPending}
        onClose={() => setPolarUploadOpen(false)}
        onUpload={(f) => polarUploadMut.mutate(f)}
      />

    </CollapsibleSection>

  );

}


