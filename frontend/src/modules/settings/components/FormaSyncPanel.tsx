import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { fetchApiHealth } from "../../../api/health";

import {

  fetchFormaSyncConflicts,

  fetchFormaSyncStatus,

  formaSyncDownload,

  formaSyncSync,

  formaSyncUpload,

  resolveFormaSyncConflict,

  setFormaSyncAutoEnabled,

  type FormaSyncConflict,

  type FormaSyncStatus,

} from "../../../api/cloud";

import { ErrorAlert } from "../../../components/ErrorAlert";

import { Loader } from "../../../components/Loader";

import { useToast } from "../../../components/Toast";

import { queryKeys } from "../../../hooks/queryKeys";

import { SETTINGS_STALE_MS } from "../../../hooks/queryStaleTimes";

import { parseApiError } from "../../../utils/validation";

import { useClientCapabilities } from "../../../hooks/useClientCapabilities";

import { SettingsSubsection } from "./SettingsSection";

import { YandexDiskConnectBlock } from "./YandexDiskConnectBlock";
import {
  FormaSyncProgressOverlay,
  type FormaSyncProgressOperation,
} from "./FormaSyncProgressOverlay";



function formatTs(iso: string | null | undefined): string {

  if (!iso) return "—";

  try {

    return new Date(iso).toLocaleString("ru-RU");

  } catch {

    return iso;

  }

}



function maskUid(uid: string | null | undefined): string {

  if (!uid) return "—";

  if (uid.length <= 6) return uid;

  return `${uid.slice(0, 3)}…${uid.slice(-3)}`;

}



export function FormaSyncPanel() {

  const { showToast } = useToast();

  const qc = useQueryClient();

  const caps = useClientCapabilities();

  const [conflictsOpen, setConflictsOpen] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  const [apiReachable, setApiReachable] = useState<boolean | null>(null);



  useEffect(() => {

    let cancelled = false;

    void fetchApiHealth().then((h) => {

      if (!cancelled) setApiReachable(h.ok);

    });

    return () => {

      cancelled = true;

    };

  }, []);



  const statusQuery = useQuery({

    queryKey: queryKeys.formaSyncStatus,

    queryFn: fetchFormaSyncStatus,

    staleTime: SETTINGS_STALE_MS,

    refetchInterval: (q) =>

      document.visibilityState === "visible" && q.state.data?.sync_in_flight ? 2000 : false,

  });



  const conflictsQuery = useQuery({

    queryKey: queryKeys.formaSyncConflicts,

    queryFn: fetchFormaSyncConflicts,

    enabled: conflictsOpen,

  });



  const invalidate = () => {

    void qc.invalidateQueries({ queryKey: queryKeys.formaSyncStatus });

    void qc.invalidateQueries({ queryKey: queryKeys.formaSyncConflicts });

  };



  const syncMut = useMutation({

    mutationFn: formaSyncSync,

    onSuccess: (data) => {

      invalidate();

      showToast(data.message, "success");

    },

    onError: (err) => {

      const msg = parseApiError(err);

      setFormError(msg);

      showToast(msg, "error");

      invalidate();

    },

  });



  const uploadMut = useMutation({

    mutationFn: () => formaSyncUpload(false),

    onSuccess: (data) => {

      invalidate();

      showToast(data.message, data.uploaded ? "success" : "info");

    },

    onError: (err) => showToast(parseApiError(err), "error"),

  });



  const downloadMut = useMutation({

    mutationFn: formaSyncDownload,

    onSuccess: (data) => {

      invalidate();

      showToast(data.message, data.downloaded ? "success" : "info");

    },

    onError: (err) => showToast(parseApiError(err), "error"),

  });



  const autoMut = useMutation({

    mutationFn: setFormaSyncAutoEnabled,

    onSuccess: () => invalidate(),

  });



  const resolveMut = useMutation({

    mutationFn: resolveFormaSyncConflict,

    onSuccess: () => {

      invalidate();

      showToast("Конфликт отмечен как решённый", "success");

    },

  });



  const status: FormaSyncStatus | undefined = statusQuery.data;

  const busy =

    syncMut.isPending ||

    uploadMut.isPending ||

    downloadMut.isPending ||

    status?.sync_in_flight;

  const progressOp: FormaSyncProgressOperation | null = syncMut.isPending
    ? "sync"
    : uploadMut.isPending
      ? "upload"
      : downloadMut.isPending
        ? "download"
        : status?.sync_in_flight
          ? "sync"
          : null;

  const folderOnDisk = status?.cloud_folder_web;

  const hasUploadedOnce = Boolean(status?.last_upload_at);



  return (

    <>

      {progressOp ? <FormaSyncProgressOverlay operation={progressOp} /> : null}

    <SettingsSubsection

      title="FormaSync"

      description="Облачная синхронизация данных приложения (тренировки, питание, замеры) между устройствами."

    >

      <YandexDiskConnectBlock />



      <details className="text-sm border border-[rgb(var(--app-border))] rounded-lg p-3 mt-4">

        <summary className="cursor-pointer font-medium text-[rgb(var(--app-text))]">

          Как это работает

        </summary>

        <ol className="mt-3 space-y-2 text-[rgb(var(--app-text-muted))] list-decimal list-inside leading-relaxed">

          <li>Подключите Яндекс.Диск кнопкой выше (нужны права на запись).</li>

          <li>

            Нажмите «Синхронизировать» — приложение создаст папку на Диске и отправит данные.

            До первой успешной отправки папки <strong className="text-[rgb(var(--app-text))]">FormaSync</strong>{" "}

            на disk.yandex.ru может не быть — это нормально.

          </li>

          <li>

            После отправки на Диске:{" "}

            <strong className="text-[rgb(var(--app-text))]">Файлы → FormaSync →</strong> подпапка с

            вашим ID Яндекса.

          </li>

        </ol>

        <p className="mt-3 text-xs text-[rgb(var(--app-text-muted))]">

          Вкладка «Данные» — это экспорт JSON в файл на компьютер, не FormaSync. Полные копии базы

          (.db) для разработчиков — в{" "}

          <code className="text-[11px]">MyHealthDashboard/Backups</code>, отдельно от FormaSync.

        </p>

      </details>



      {formError ? (
        <div className="mt-4">
          <ErrorAlert message={formError} />
        </div>
      ) : null}

      {apiReachable === false ? (
        <div className="mt-4">
          <ErrorAlert message="API недоступен. Запустите бэкенд (uvicorn) и проверьте порт в .api-port / VITE_API_PORT." />
        </div>
      ) : null}



      {statusQuery.isLoading ? (

        <Loader label="Загрузка статуса FormaSync…" className="mt-4" />

      ) : status ? (

        <div className="space-y-4 mt-4">

          {status.sync_in_flight && (

            <span className="settings-status-pill settings-status-pill--warn">

              Синхронизация…

            </span>

          )}



          {folderOnDisk && status.yandex_connected ? (

            <p className="text-sm text-[rgb(var(--app-text-muted))]">

              Папка на Диске после отправки:{" "}

              <code className="text-xs break-all">{folderOnDisk}</code>

              {!hasUploadedOnce ? (

                <span className="block mt-1 text-amber-600 dark:text-amber-400">

                  Пока не было успешной отправки — на Диске папка может отсутствовать.

                </span>

              ) : null}

            </p>

          ) : null}



          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">ID Яндекса</dt>

              <dd>{maskUid(status.yandex_uid)}</dd>

            </div>

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Локальная ревизия</dt>

              <dd>{status.local_revision}</dd>

            </div>

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Облачная ревизия</dt>

              <dd>{status.remote_revision ?? "—"}</dd>

            </div>

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Ожидают отправки</dt>

              <dd>{status.pending_changes}</dd>

            </div>

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Конфликты</dt>

              <dd>{status.conflict_count}</dd>

            </div>

            {status.baseline_required && (

              <div className="sm:col-span-2">

                <dt className="text-[rgb(var(--app-text-muted))]">Первичная отправка</dt>

                <dd className="text-amber-600 dark:text-amber-400">

                  В облаке ещё нет данных — нажмите «Синхронизировать» для первой выгрузки.

                </dd>

              </div>

            )}

            {caps.enableRawSyncViews && status.debug_plan?.cloud_path && (

              <div className="sm:col-span-2">

                <dt className="text-[rgb(var(--app-text-muted))]">Путь API</dt>

                <dd className="font-mono text-xs break-all">{status.debug_plan.cloud_path}</dd>

              </div>

            )}

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Последняя отправка</dt>

              <dd>{formatTs(status.last_upload_at)}</dd>

            </div>

            <div>

              <dt className="text-[rgb(var(--app-text-muted))]">Последняя загрузка</dt>

              <dd>{formatTs(status.last_download_at)}</dd>

            </div>

          </dl>



          {status.last_error && (

            <ErrorAlert message={status.last_error} />

          )}



          <div className="flex flex-wrap gap-2">

            <button

              type="button"

              className="btn-primary"

              disabled={busy || !status.yandex_connected || apiReachable === false}

              onClick={() => {

                setFormError(null);

                syncMut.mutate();

              }}

            >

              {syncMut.isPending ? "Синхронизация…" : "Синхронизировать"}

            </button>

            <button

              type="button"

              className="btn-secondary"

              disabled={busy || !status.yandex_connected}

              onClick={() => uploadMut.mutate()}

            >

              Только отправить

            </button>

            <button

              type="button"

              className="btn-secondary"

              disabled={busy || !status.yandex_connected}

              onClick={() => downloadMut.mutate()}

            >

              Только загрузить

            </button>

            {status.conflict_count > 0 && (

              <button

                type="button"

                className="btn-secondary"

                onClick={() => setConflictsOpen((v) => !v)}

              >

                {conflictsOpen ? "Скрыть конфликты" : "Конфликты"}

              </button>

            )}

          </div>



          {caps.enableRawSyncViews && status.debug_plan && (

            <details className="text-xs border border-[rgb(var(--app-border))] rounded-lg p-2">

              <summary className="cursor-pointer font-medium">Sync plan (developer)</summary>

              <pre className="mt-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">

                {JSON.stringify(status.debug_plan, null, 2)}

              </pre>

            </details>

          )}



          <label className="flex items-center gap-2 text-sm cursor-pointer">

            <input

              type="checkbox"

              checked={status.auto_enabled}

              disabled={autoMut.isPending}

              onChange={(e) => autoMut.mutate(e.target.checked)}

            />

            Автозагрузка при запуске

          </label>



          {conflictsOpen && (

            <div className="border border-[rgb(var(--app-border))] rounded-lg p-3 space-y-2">

              {conflictsQuery.isLoading ? (

                <Loader label="Конфликты…" />

              ) : (conflictsQuery.data?.length ?? 0) === 0 ? (

                <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет нерешённых конфликтов</p>

              ) : (

                conflictsQuery.data?.map((c: FormaSyncConflict) => (

                  <div

                    key={c.id}

                    className="text-sm border-b border-[rgb(var(--app-border))] pb-2 last:border-0"

                  >

                    <p className="font-medium">{c.entity_label}</p>

                    <p className="text-[rgb(var(--app-text-muted))]">{c.entity_type}</p>

                    <button

                      type="button"

                      className="text-xs text-[rgb(var(--app-accent))] mt-1"

                      disabled={resolveMut.isPending}

                      onClick={() => resolveMut.mutate(c.id)}

                    >

                      Отметить решённым

                    </button>

                  </div>

                ))

              )}

            </div>

          )}

        </div>

      ) : null}

    </SettingsSubsection>

    </>

  );

}

