import {
  formatFitProgressLabel,
  formatFitSyncToast,
  fitImportToastVariant,
  fitStatsFromTaskStatus,
  type FitSyncTaskStatus,
} from "../api/sync";
import { MessageModal } from "./MessageModal";
import { ModalFrame } from "./ui/modal";
import { useEffect } from "react";
import { useFitImport } from "../hooks/useFitImport";
import { useToast } from "./Toast";

type Props = {
  className?: string;
  label?: string;
  loadingLabel?: string;
  fitFolderPath?: string | null;
  reimport?: boolean;
  onSuccess?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

function ProgressOverlay({
  progress,
  loadingLabel,
}: {
  progress: FitSyncTaskStatus | null;
  loadingLabel: string;
}) {
  const total = progress?.files_total ?? 0;
  const done = progress?.files_processed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <ModalFrame
      open
      onClose={() => {}}
      dismissOnOverlay={false}
      zIndex={70}
      role="status"
      panelClassName="max-w-md flex flex-col gap-4 p-6"
    >
      <p className="text-sm font-medium text-center text-[rgb(var(--app-text))]">{loadingLabel}</p>
      <div
        className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        role="progressbar"
      >
        <div
          className="h-full bg-brand-600 transition-all duration-300 ease-out"
          style={{ width: total > 0 ? `${pct}%` : "30%" }}
        />
      </div>
      <p className="text-xs text-center text-[rgb(var(--app-text-muted))] tabular-nums">
        {progress ? formatFitProgressLabel(progress) : "Запуск…"}
      </p>
      <p className="text-xs text-center text-[rgb(var(--app-text-muted))]">
        Можно переключаться по разделам — импорт продолжится на сервере.
      </p>
    </ModalFrame>
  );
}

/** Кнопка фонового импорта FIT с прогрессом и опросом статуса. */
export function SyncButton({
  className = "btn-secondary text-sm shrink-0",
  label = "Импорт FIT",
  loadingLabel = "Импорт FIT…",
  fitFolderPath,
  reimport = false,
  onSuccess,
  onBusyChange,
}: Props) {
  const { showToast } = useToast();
  const { loading, progress, validationError, setValidationError, runImport } = useFitImport({
    fitFolderPath,
    reimport,
    onSuccess,
  });

  useEffect(() => {
    onBusyChange?.(loading);
  }, [loading, onBusyChange]);

  const handleClick = async () => {
    try {
      const finalStatus = await runImport();
      if (!finalStatus) return;
      const stats = fitStatsFromTaskStatus(finalStatus);
      const variant = fitImportToastVariant(finalStatus.status, stats);
      showToast(formatFitSyncToast(stats, variant), variant);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ошибка импорта", "error");
    }
  };

  return (
    <>
      {loading && <ProgressOverlay progress={progress} loadingLabel={loadingLabel} />}
      <button
        type="button"
        className={className}
        disabled={loading}
        onClick={() => void handleClick()}
      >
        {loading ? loadingLabel : label}
      </button>
      <MessageModal
        open={validationError != null}
        title="Импорт FIT"
        message={validationError ?? ""}
        confirmLabel="ОК"
        onClose={() => setValidationError(null)}
      />
    </>
  );
}
