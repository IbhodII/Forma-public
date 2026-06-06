import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { WarmupMode } from "../../../api/accountWarmup";
import { BackgroundJobStatusPanel } from "../../../components/BackgroundJobStatusPanel";
import { ModalFrame } from "../../../components/ui/modal";
import { useAuth } from "../../../auth/AuthContext";
import { useDatabaseWarmupJob } from "../../../hooks/useDatabaseWarmupJob";
import { useToast } from "../../../components/Toast";
import { useT } from "../../../i18n";
import { parseApiError } from "../../../utils/validation";
import { invalidateAfterDataReload } from "../../../utils/invalidateAfterDataReload";
import { ErrorAlert } from "../../../components/ErrorAlert";

export function WarmupControls({
  disabled = false,
  compact = false,
}: {
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.userId ?? 1;
  const warmupJob = useDatabaseWarmupJob(userId);
  const [warmupPromptOpen, setWarmupPromptOpen] = useState(false);

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
      invalidateAfterDataReload(qc);
      showToast(t("warmup.done"), "success");
    },
    onError: (e) => {
      showToast(parseApiError(e) || t("warmup.verifyFailed"), "error");
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

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
        {t("warmup.sectionDesc")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={warmupBusy || disabled}
          onClick={() => startWarmup("full")}
        >
          {warmupBusy ? t("warmup.running") : t("warmup.startButton")}
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={warmupBusy || disabled}
          onClick={() => startWarmup("light")}
        >
          Быстрый прогрев
        </button>
      </div>
      {warmupJob.pollError ? (
        <div className="mt-2">
          <ErrorAlert message={warmupJob.pollError} />
        </div>
      ) : null}
      {showWarmupPanel ? (
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
      <ModalFrame
        open={warmupPromptOpen}
        onClose={() => setWarmupPromptOpen(false)}
        panelClassName="max-w-md flex flex-col gap-4 p-6"
      >
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">{t("warmup.promptTitle")}</p>
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

/** Вызывается после JSON-импорта с рекомендацией прогрева. */
export function useWarmupAfterImport(userId: number) {
  const warmupJob = useDatabaseWarmupJob(userId);
  const [promptOpen, setPromptOpen] = useState(false);
  return { warmupJob, promptOpen, setPromptOpen };
}
