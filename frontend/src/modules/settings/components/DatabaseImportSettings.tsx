import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  isBrowserDatabaseImport,
  isDesktopDatabaseImport,
  LARGE_DB_BYTES_THRESHOLD,
} from "../../../api/databaseImport";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";

import { BackgroundJobStatusPanel } from "../../../components/BackgroundJobStatusPanel";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { useDatabaseImportJob } from "../../../hooks/useDatabaseImportJob";
import { useDatabaseWarmupJob } from "../../../hooks/useDatabaseWarmupJob";
import type { DatabaseImportMode } from "../../../api/databaseImport";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { useT } from "../../../i18n";
import { SettingsSubsection } from "./SettingsSection";
import { fetchDatabaseOverview, type DatabaseOverview } from "../../../api/databaseDiagnostics";
import {
  invalidateAfterDataReload,
  workoutVisibilityWarning,
  type WorkoutVisibilityReport,
} from "../../../utils/invalidateAfterDataReload";

function DatabaseOverviewBlock({ overview }: { overview: DatabaseOverview }) {
  const c = overview.counts;
  return (
    <div className="mt-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-muted))] p-3 text-xs space-y-1 font-mono">
      <p className="font-medium text-[rgb(var(--app-text))] font-sans">DB overview</p>
      <p className="text-[rgb(var(--app-text-muted))] break-all">
        workouts: {overview.activeDbPath.workouts}
      </p>
      <p className="text-[rgb(var(--app-text-muted))]">
        user_id={overview.request_user_id}{" "}
        {overview.currentProfile.display_name
          ? `(${overview.currentProfile.display_name})`
          : overview.currentProfile.found
            ? ""
            : "— profile missing"}
      </p>
      <p className="text-[rgb(var(--app-text-muted))]">
        strength={c.strength_workouts} cardio={c.cardio_workouts} food={c.food_entries}{" "}
        body={c.body_metrics} weight={c.daily_weight} steps={c.steps_days}
      </p>
    </div>
  );
}

function WorkoutVisibilityBlock({ vis }: { vis: WorkoutVisibilityReport }) {
  const t = useT();
  return (
    <div className="mt-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-muted))] p-3 text-xs space-y-1">
      <p className="font-medium text-[rgb(var(--app-text))]">{t("dbImport.visibilityTitle")}</p>
      <p className="text-[rgb(var(--app-text-muted))]">
        {t("dbImport.visibilityRows", {
          rows: vis.rows_for_current_user ?? 0,
          ui: vis.ui_visible_sessions ?? 0,
          all: vis.ui_visible_sessions_all_time ?? 0,
        })}
      </p>
      {vis.likely_causes?.length ? (
        <ul className="list-disc pl-4 text-amber-700 dark:text-amber-400">
          {vis.likely_causes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DatabaseImportSettings({
  embedded = false,
  zipOnly = false,
}: {
  embedded?: boolean;
  zipOnly?: boolean;
}) {
  const t = useT();
  const caps = useClientCapabilities();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { session } = useAuth();
  const userId = session?.userId ?? 1;
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dbFilesInputRef = useRef<HTMLInputElement>(null);

  const importJob = useDatabaseImportJob(userId);
  const warmupJob = useDatabaseWarmupJob(userId);

  const overviewQuery = useQuery({
    queryKey: ["database", "diagnostics", "overview"],
    queryFn: fetchDatabaseOverview,
    enabled: false,
  });

  const [mode, setMode] = useState<DatabaseImportMode>("replace");
  const [pickedBytes, setPickedBytes] = useState<number | null>(null);
  const [stagingProgress, setStagingProgress] = useState<{
    percent?: number;
    message?: string;
  } | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDatabaseImportStageProgress) return undefined;
    return api.onDatabaseImportStageProgress((payload) => {
      setStagingProgress({
        percent: typeof payload?.percent === "number" ? payload.percent : undefined,
        message: typeof payload?.message === "string" ? payload.message : undefined,
      });
    });
  }, []);
  const [pendingSource, setPendingSource] = useState<
    | { kind: "zip"; path: string }
    | { kind: "files"; workoutsPath: string; sharedPath: string }
    | { kind: "zip-file"; file: File }
    | { kind: "files-blob"; workouts: File; shared: File }
    | null
  >(null);

  const importAvailable = isDesktopDatabaseImport() || caps.enableDatabaseImport;

  const importMut = useMutation({
    mutationFn: (source: NonNullable<typeof pendingSource>) =>
      importJob.startImport(source, mode),
    onSuccess: (status) => {
      if (status.status === "failed") {
        const verify = status.report?.verification as
          | { ok?: boolean; checks?: Array<{ label: string; error?: string }> }
          | undefined;
        const verifyHint =
          verify && verify.ok === false && verify.checks?.length
            ? verify.checks
                .filter((c) => c.error)
                .map((c) => `${c.label}: ${c.error}`)
                .slice(0, 2)
                .join("; ")
            : "";
        const msg =
          status.error ||
          verifyHint ||
          status.message ||
          t("dbImport.verifyFailed");
        showToast(msg, "error");
        return;
      }
      showToast(t("dbImport.done"), "success");
      invalidateAfterDataReload(qc);
      void overviewQuery.refetch();
      const vis = status.report?.workout_visibility as WorkoutVisibilityReport | undefined;
      const warn = workoutVisibilityWarning(vis);
      if (warn) {
        showToast(warn, "warning");
      }
      if (status.backendRestartError) {
        showToast(status.backendRestartError, "error");
      }
      const warmupId =
        status.report &&
        typeof status.report === "object" &&
        "warmup_task_id" in status.report &&
        typeof (status.report as { warmup_task_id?: unknown }).warmup_task_id === "string"
          ? (status.report as { warmup_task_id: string }).warmup_task_id
          : null;
      if (warmupId) {
        void warmupJob
          .attachWarmup(warmupId, "light")
          .then((warmupStatus) => {
            invalidateAfterDataReload(qc);
            void overviewQuery.refetch();
            showToast(t("warmup.done"), "success");
            const wVis = warmupStatus.summary?.workout_visibility as
              | WorkoutVisibilityReport
              | undefined;
            const wWarn = workoutVisibilityWarning(wVis);
            if (wWarn) {
              showToast(wWarn, "warning");
            }
          })
          .catch((e) =>
            showToast(e instanceof Error ? e.message : String(e), "error"),
          );
      }
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), "error");
    },
  });

  const runImport = (source: NonNullable<typeof pendingSource>) => {
    setPendingSource(null);
    setReplaceOpen(false);
    importMut.mutate(source);
  };

  const applyPickedSize = (bytes: number | undefined) => {
    if (bytes && bytes > 0) {
      setPickedBytes(bytes);
      if (bytes >= LARGE_DB_BYTES_THRESHOLD) {
        setMode("replace");
      }
    }
  };

  const queueSource = (
    source: NonNullable<typeof pendingSource>,
  ) => {
    let bytes = 0;
    if (source.kind === "zip-file") {
      bytes = source.file.size;
    } else if (source.kind === "files-blob") {
      bytes = source.workouts.size + source.shared.size;
    } else if ("sizeBytes" in source && typeof source.sizeBytes === "number") {
      bytes = source.sizeBytes;
    }
    if (bytes > 0) {
      applyPickedSize(bytes);
    }
    const forceReplace = bytes >= LARGE_DB_BYTES_THRESHOLD;
    const effectiveMode = mode === "merge" && forceReplace ? "replace" : mode;
    if (effectiveMode === "replace") {
      setPendingSource(source);
      setReplaceOpen(true);
      return;
    }
    runImport(source);
  };

  const onPick = async (kind: "zip" | "files") => {
    importJob.clearJob();
    try {
      if (isDesktopDatabaseImport()) {
        const api = window.electronAPI;
        if (!api?.pickDatabaseImportFiles) {
          throw new Error("Импорт базы доступен только в desktop-приложении");
        }
        const picked = await api.pickDatabaseImportFiles(kind);
        if (!picked) return;
        if ("sizeBytes" in picked && typeof picked.sizeBytes === "number") {
          applyPickedSize(picked.sizeBytes);
        }
        queueSource(picked);
        return;
      }
      if (isBrowserDatabaseImport()) {
        if (kind === "zip") {
          zipInputRef.current?.click();
        } else {
          dbFilesInputRef.current?.click();
        }
        return;
      }
      throw new Error("Импорт базы недоступен в этом режиме клиента");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    queueSource({ kind: "zip-file", file });
  };

  const onDbFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    const workouts = list.find((f) => f.name.toLowerCase() === "workouts.db");
    const shared = list.find((f) => f.name.toLowerCase() === "shared.db");
    if (!workouts || !shared) {
      showToast("Выберите оба файла: workouts.db и shared.db", "error");
      return;
    }
    queueSource({ kind: "files-blob", workouts, shared });
  };

  const importVisibility = importJob.view?.report?.workout_visibility as
    | WorkoutVisibilityReport
    | undefined;
  const showImportVisibility =
    importVisibility &&
    (importJob.view?.status === "completed" || importJob.view?.status === "failed");

  const showImportPanel =
    importJob.view &&
    (importJob.isActive ||
      importJob.isPolling ||
      importJob.view.status === "failed");
  const showWarmupPanel =
    warmupJob.view &&
    (warmupJob.isActive ||
      warmupJob.isPolling ||
      warmupJob.view.status === "failed" ||
      warmupJob.view.status === "cancelled");

  const importBusy = importMut.isPending || importJob.isActive || importJob.isPolling;
  const warmupBusy = warmupJob.isActive || warmupJob.isPolling;
  const largeDbPicked =
    pickedBytes !== null && pickedBytes >= LARGE_DB_BYTES_THRESHOLD;
  const mergeDisabledForSize = largeDbPicked;

  const showImportModal =
    importJob.isPolling &&
    importJob.view &&
    (importJob.view.status === "running" ||
      importJob.view.status === "pending" ||
      importJob.view.stage === "backup_current");

  if (!importAvailable) {
    return null;
  }

  const importBody = (
    <>
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed mb-2">
          {t("dbImport.hint")}
        </p>
        <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3">
          Импорт привязан к текущему пользователю{" "}
          <span className="font-mono font-medium text-[rgb(var(--app-text))]">user_id={userId}</span>
          {isBrowserDatabaseImport()
            ? " · загрузка ZIP или пары .db через браузер (dev)"
            : " · выбор файлов через desktop"}
        </p>
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={onZipFileChange}
        />
        <input
          ref={dbFilesInputRef}
          type="file"
          accept=".db,.sqlite"
          multiple
          className="hidden"
          onChange={onDbFilesChange}
        />
        {!embedded ? (
          <button
            type="button"
            className="btn-secondary text-sm mb-3"
            onClick={() => void overviewQuery.refetch()}
            disabled={overviewQuery.isFetching}
          >
            {overviewQuery.data ? "Refresh DB overview" : "Load DB overview"}
          </button>
        ) : null}
        {largeDbPicked ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
            Большая база ({Math.round((pickedBytes ?? 0) / (1024 * 1024))} МБ): рекомендуется режим{" "}
            <strong>Replace</strong> — слияние (Merge) может занимать очень долго.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="db-import-mode"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
              disabled={importBusy || mergeDisabledForSize}
            />
            {t("backup.importMerge")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="db-import-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
              disabled={importBusy}
            />
            {t("backup.importReplace")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={importBusy || warmupBusy}
            onClick={() => void onPick("zip")}
          >
            {importBusy ? t("dbImport.running") : t("dbImport.pickZip")}
          </button>
          {!zipOnly ? (
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={importBusy || warmupBusy}
              onClick={() => void onPick("files")}
            >
              {importBusy ? t("dbImport.running") : t("dbImport.pickFiles")}
            </button>
          ) : null}
        </div>
        {importMut.isPending && stagingProgress?.message ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))] mb-2">
            {stagingProgress.message}
            {typeof stagingProgress.percent === "number"
              ? ` (${stagingProgress.percent}%)`
              : ""}
          </p>
        ) : null}
        {importJob.pollError ? <ErrorAlert message={importJob.pollError} /> : null}
        {showImportPanel ? (
          <BackgroundJobStatusPanel
            variant="inline"
            title={t("dbImport.progressTitle")}
            jobKindLabel={t("dbImport.jobLabel")}
            view={importJob.view}
            showRetry={importJob.showRetry}
            onRetry={() => importJob.clearJob()}
            extra={
              <>
                {showImportVisibility ? (
                  <WorkoutVisibilityBlock vis={importVisibility} />
                ) : null}
                {importJob.view?.status === "failed" ? (
                  <p className="text-xs text-center text-[rgb(var(--app-text-muted))]">
                    {t("dbImport.retryHint")}
                  </p>
                ) : null}
              </>
            }
          />
        ) : null}
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="space-y-3">{importBody}</div>
      ) : (
        <SettingsSubsection title={t("dbImport.title")} description={t("dbImport.desc")}>
          {importBody}
        </SettingsSubsection>
      )}

      {showWarmupPanel ? (
        <BackgroundJobStatusPanel
          variant="inline"
          title={t("warmup.progressTitle")}
          jobKindLabel={t("warmup.jobLabel")}
          view={warmupJob.view}
          showCancel={warmupJob.showCancel}
          showRetry={warmupJob.showRetry}
          onCancel={() => void warmupJob.cancelWarmup()}
          onRetry={() => {
            void warmupJob.retryWarmup("full").then(() => {
              invalidateAfterDataReload(qc);
              void overviewQuery.refetch();
            });
          }}
        />
      ) : null}

      {!embedded && overviewQuery.data ? (
        <SettingsSubsection title="DB diagnostics" description="Active database and row counts (API)">
          <DatabaseOverviewBlock overview={overviewQuery.data} />
          <button
            type="button"
            className="btn-secondary mt-2 text-sm"
            onClick={() => void overviewQuery.refetch()}
          >
            Refresh counts
          </button>
        </SettingsSubsection>
      ) : null}

      {showImportModal ? (
        <BackgroundJobStatusPanel
          variant="modal"
          open
          title={t("dbImport.progressTitle")}
          jobKindLabel={t("dbImport.jobLabel")}
          view={importJob.view}
        />
      ) : null}

      {warmupJob.isPolling && warmupJob.view?.status === "running" ? (
        <BackgroundJobStatusPanel
          variant="modal"
          open
          title={t("warmup.progressTitle")}
          jobKindLabel={t("warmup.jobLabel")}
          view={warmupJob.view}
          showCancel={warmupJob.showCancel}
          onCancel={() => void warmupJob.cancelWarmup()}
        />
      ) : null}

      <ConfirmModal
        open={replaceOpen}
        title={t("dbImport.replaceConfirmTitle")}
        message={t("dbImport.replaceConfirmMessage")}
        confirmLabel={t("dbImport.replaceConfirmAction")}
        onConfirm={() => pendingSource && runImport(pendingSource)}
        onCancel={() => {
          setReplaceOpen(false);
          setPendingSource(null);
        }}
      />
    </>
  );
}
