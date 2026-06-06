import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { WarmupMode } from "../../../api/accountWarmup";
import { BackgroundJobStatusPanel } from "../../../components/BackgroundJobStatusPanel";
import { useAuth } from "../../../auth/AuthContext";
import { useDatabaseWarmupJob } from "../../../hooks/useDatabaseWarmupJob";
import {
  downloadFullBackup,
  importFullBackup,
  type BackupExportStatus,
  type BackupImportMode,
  type BackupImportReport,
  type BackupImportStatus,
} from "../../../api/backup";
import { ModalFrame } from "../../../components/ui/modal";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { useToast } from "../../../components/Toast";
import { useT } from "../../../i18n";
import { parseApiError } from "../../../utils/validation";
import { invalidateAfterDataReload } from "../../../utils/invalidateAfterDataReload";
import { SettingsSubsection } from "./SettingsSection";

function BackupTaskProgressOverlay({
  progress,
  title,
}: {
  progress: BackupExportStatus | BackupImportStatus | null;
  title: string;
}) {
  const pct = progress?.percent ?? 0;
  const label = progress?.message ?? "…";

  return (
    <ModalFrame
      open
      onClose={() => {}}
      dismissOnOverlay={false}
      zIndex={70}
      role="status"
      panelClassName="max-w-md flex flex-col gap-4 p-6"
    >
      <p className="text-sm font-medium text-center text-[rgb(var(--app-text))]">{title}</p>
      <div
        className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        role="progressbar"
      >
        <div
          className="h-full bg-brand-600 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="text-xs text-center text-[rgb(var(--app-text-muted))] tabular-nums">{label}</p>
      {progress && progress.total > 0 && progress.phase === "merging" ? (
        <p className="text-xs text-center text-[rgb(var(--app-text-muted))]">
          {progress.current}/{progress.total}
          {progress.table ? ` · ${progress.table}` : ""}
        </p>
      ) : null}
    </ModalFrame>
  );
}

function BackupExportProgressOverlay({ progress }: { progress: BackupExportStatus | null }) {
  const t = useT();
  return (
    <BackupTaskProgressOverlay progress={progress} title={t("backup.exportProgressTitle")} />
  );
}

function ReportTable({ report }: { report: BackupImportReport }) {
  const t = useT();
  const tables = new Set([
    ...Object.keys(report.imported),
    ...Object.keys(report.updated),
    ...Object.keys(report.skipped),
  ]);
  if (tables.size === 0 && report.errors.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--app-text-muted))]">{t("backup.noReportRows")}</p>
    );
  }
  return (
    <div className="space-y-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-[rgb(var(--app-text-muted))]">
            <th className="py-1 pr-2">{t("common.table")}</th>
            <th className="py-1 pr-2">{t("common.added")}</th>
            <th className="py-1 pr-2">{t("common.updated")}</th>
            <th className="py-1">{t("common.skipped")}</th>
          </tr>
        </thead>
        <tbody>
          {[...tables].sort().map((t) => (
            <tr key={t} className="border-t border-[rgb(var(--app-border)/0.4)]">
              <td className="py-1 pr-2 font-mono">{t}</td>
              <td className="py-1 pr-2">{report.imported[t] ?? 0}</td>
              <td className="py-1 pr-2">{report.updated[t] ?? 0}</td>
              <td className="py-1">{report.skipped[t] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.skipped_tables.length > 0 ? (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          {t("backup.skippedTables", {list: report.skipped_tables.join(", ")})}
        </p>
      ) : null}
      {report.errors.length > 0 ? (
        <ErrorAlert message={report.errors.join("\n")} />
      ) : null}
    </div>
  );
}

export function DataBackupSettings({ jsonOnly = false }: { jsonOnly?: boolean }) {
  const t = useT();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<BackupImportMode>("merge");
  const [importReport, setImportReport] = useState<BackupImportReport | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [exportProgress, setExportProgress] = useState<BackupExportStatus | null>(null);
  const [importProgress, setImportProgress] = useState<BackupImportStatus | null>(null);
  const [warmupPromptOpen, setWarmupPromptOpen] = useState(false);
  const { session } = useAuth();
  const userId = session?.userId ?? 1;
  const warmupJob = useDatabaseWarmupJob(userId);

  const exportMut = useMutation({
    mutationFn: () => downloadFullBackup(setExportProgress),
    onSuccess: () => showToast(t("backup.exportDone"), "success"),
    onError: (e) => showToast(parseApiError(e), "error"),
    onSettled: () => setExportProgress(null),
  });

  const invalidateAfterWarmup = () => {
    invalidateAfterDataReload(qc);
  };

  const warmupMut = useMutation({
    mutationFn: async ({
      warmupMode,
      existingTaskId,
      resume = true,
    }: {
      warmupMode: WarmupMode;
      existingTaskId?: string;
      resume?: boolean;
    }) => {
      if (existingTaskId) {
        return warmupJob.attachWarmup(existingTaskId, warmupMode);
      }
      return warmupJob.startWarmup(warmupMode, resume);
    },
    onSuccess: () => {
      invalidateAfterWarmup();
      showToast(t("warmup.done"), "success");
    },
    onError: (e) => {
      const msg = parseApiError(e);
      showToast(msg || t("warmup.verifyFailed"), "error");
    },
  });

  const startWarmup = (warmupMode: WarmupMode, existingTaskId?: string) => {
    setWarmupPromptOpen(false);
    warmupMut.mutate({ warmupMode, existingTaskId });
  };

  const warmupBusy = warmupMut.isPending || warmupJob.isActive || warmupJob.isPolling;
  const showWarmupPanel =
    warmupJob.view &&
    (warmupJob.isActive ||
      warmupJob.isPolling ||
      warmupJob.view.status === "failed" ||
      warmupJob.view.status === "cancelled");

  const importMut = useMutation({
    mutationFn: ({ file, importMode }: { file: File; importMode: BackupImportMode }) =>
      importFullBackup(file, importMode, setImportProgress),
    onSuccess: (report) => {
      setImportReport(report);
      showToast(t("backup.importDone"), "success");
      if (report.warmup_recommended) {
        setWarmupPromptOpen(true);
        if (report.warmup_task_id) {
          warmupMut.mutate({ warmupMode: "light", existingTaskId: report.warmup_task_id });
        }
      }
    },
    onError: (e) => showToast(parseApiError(e), "error"),
    onSettled: () => setImportProgress(null),
  });

  const runImport = (file: File, importMode: BackupImportMode) => {
    importMut.mutate({ file, importMode });
  };

  const onFileChange = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (mode === "replace") {
      setPendingFile(file);
      setReplaceOpen(true);
      return;
    }
    runImport(file, mode);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      {!jsonOnly ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
          Здесь — экспорт и импорт файла <code className="text-xs">forma_backup_v1.json</code> на
          компьютер. Синхронизация с телефоном и другим ПК через Яндекс.Диск — во вкладке{" "}
          <strong className="font-medium text-[rgb(var(--app-text))]">Данные → Облачная синхронизация</strong>.
        </p>
      ) : null}
      {exportMut.isPending ? <BackupExportProgressOverlay progress={exportProgress} /> : null}
      {importMut.isPending ? (
        <BackupTaskProgressOverlay
          progress={importProgress}
          title={t("backup.importProgressTitle")}
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
      {!jsonOnly ? (
        <SettingsSubsection
          title={t("warmup.sectionTitle")}
          description={t("warmup.sectionDesc")}
        >
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={warmupBusy || importMut.isPending}
            onClick={() => startWarmup("full")}
          >
            {warmupBusy ? t("warmup.running") : t("warmup.startButton")}
          </button>
          {warmupJob.pollError ? (
            <div className="mt-3">
              <ErrorAlert message={warmupJob.pollError} />
            </div>
          ) : null}
          {showWarmupPanel ? (
            <div className="mt-3">
              <BackgroundJobStatusPanel
                variant="inline"
                title={t("warmup.progressTitle")}
                jobKindLabel={t("warmup.jobLabel")}
                view={warmupJob.view}
                showCancel={warmupJob.showCancel && warmupJob.view?.status === "running"}
                showRetry={warmupJob.showRetry}
                onCancel={() => void warmupJob.cancelWarmup()}
                onRetry={() => warmupMut.mutate({ warmupMode: "full", resume: true })}
              />
            </div>
          ) : null}
        </SettingsSubsection>
      ) : null}
      <SettingsSubsection
        title={t("backup.fullExportTitle")}
        description={t("backup.fullExportDesc")}
      >
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed mb-3">
          {t("backup.formatHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            {exportMut.isPending ? t("backup.exporting") : t("backup.exportButton")}
          </button>
        </div>
      </SettingsSubsection>

      <SettingsSubsection title={t("backup.importTitle")} description={t("backup.importDesc")}>
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="backup-import-mode"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
            />
            {t("backup.importMerge")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="backup-import-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            {t("backup.importReplace")}
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={importMut.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {importMut.isPending ? t("backup.importing") : t("backup.chooseFile")}
        </button>
        {importReport ? (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">{t("backup.importReportTitle")}</p>
            <ReportTable report={importReport} />
          </div>
        ) : null}
      </SettingsSubsection>

      <ConfirmModal
        open={replaceOpen}
        title={t("backup.replaceConfirmTitle")}
        message={t("backup.replaceConfirmMessage")}
        confirmLabel={t("backup.replaceConfirmAction")}
        onConfirm={() => {
          if (pendingFile) {
            runImport(pendingFile, "replace");
          }
          setReplaceOpen(false);
          setPendingFile(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
        onCancel={() => {
          setReplaceOpen(false);
          setPendingFile(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <ModalFrame
        open={warmupPromptOpen}
        onClose={() => setWarmupPromptOpen(false)}
        panelClassName="max-w-md flex flex-col gap-4 p-6"
      >
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">
          {t("warmup.promptTitle")}
        </p>
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
          {t("warmup.promptMessage")}
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setWarmupPromptOpen(false)}
          >
            {t("warmup.later")}
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={warmupMut.isPending}
            onClick={() => startWarmup("full")}
          >
            {t("warmup.now")}
          </button>
        </div>
      </ModalFrame>
    </div>
  );
}
