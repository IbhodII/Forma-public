import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchStrengthHrAnalysis } from "../../../api/strength";
import { queryKeys } from "../../../hooks/queryKeys";
import { ErrorAlert } from "../../ErrorAlert";
import { Loader } from "../../Loader";
import { parseApiError } from "../../../utils/validation";
import { cn } from "../../../lib/utils";
import { shouldAutoShowSetMapping } from "../../../utils/hrChart";
import { formatBlockTableSetLabel } from "../../../utils/strengthHrBlockLabels";
import type {
  StrengthHrAnalysisResponse,
  StrengthHrDetectedBlock,
} from "../../../types";

function formatTimeRange(startSec: number, endSec: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return `${fmt(startSec)}–${fmt(endSec)}`;
}

function confidenceLabel(confidence: string | null | undefined): string {
  if (confidence === "high") return "высокая";
  if (confidence === "medium") return "средняя";
  if (confidence === "low") return "низкая";
  return "—";
}

function confidenceBadgeClass(confidence: string | null | undefined): string {
  if (confidence === "high") {
    return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  if (confidence === "medium") {
    return "bg-amber-500/12 text-amber-800 dark:text-amber-200";
  }
  return "bg-slate-500/10 text-[rgb(var(--app-text-muted))]";
}

export function MappingStatusPill({
  mappingStatus,
  overridesApplied,
}: {
  mappingStatus?: StrengthHrAnalysisResponse["mapping_status"];
  overridesApplied?: boolean;
}) {
  const status = mappingStatus ?? (overridesApplied ? "manual" : "auto");
  const label =
    status === "verified" ? "Проверено" : status === "manual" ? "Исправлено вручную" : "Авто";
  const className =
    status === "verified"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : status === "manual"
        ? "bg-amber-500/12 text-amber-800 dark:text-amber-200"
        : "bg-slate-500/10 text-[rgb(var(--app-text-muted))]";
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ConfidencePill({ confidence }: { confidence: string | null | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        confidenceBadgeClass(confidence),
      )}
    >
      {confidenceLabel(confidence)}
    </span>
  );
}

function avgRecoveryDrop(blocks: StrengthHrDetectedBlock[]): number | null {
  const vals = blocks.map((b) => b.recovery_drop).filter((v): v is number => v != null && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const HR_MANUAL_OVERRIDE_DISCLAIMER =
  "Ручная разметка влияет только на аналитику этой тренировки.";

function compactAlertLines(data: StrengthHrAnalysisResponse): string[] {
  const lines: string[] = [];
  if (data.overrides_applied) {
    lines.push(HR_MANUAL_OVERRIDE_DISCLAIMER);
  }
  if (data.confidence === "low") {
    lines.push("Авторазметка приблизительная — проверьте блоки на графике.");
  }
  if (data.confidence_reasons?.includes("superset_detected")) {
    lines.push("Возможен суперсет — привязка к подходам неточная.");
  }
  if (data.match_quality === "partial") {
    lines.push("Часть блоков не совпала с подходами.");
  } else if (data.match_quality === "blocks_only") {
    lines.push("Блоки только по пульсу, без привязки к подходам.");
  }
  if (data.disclaimer && data.confidence !== "high") {
    lines.push(data.disclaimer);
  }
  return lines;
}

export function useShowSetMapping(
  data: StrengthHrAnalysisResponse | undefined,
  manualOverride: boolean,
): boolean {
  if (!data?.detected_blocks.length) return false;
  return shouldAutoShowSetMapping(data.confidence, manualOverride);
}

export function StrengthHrAnalysisSummary({
  data,
  manualMapping,
  onToggleMapping,
  onVerify,
  verifyPending = false,
}: {
  data: StrengthHrAnalysisResponse;
  manualMapping: boolean;
  onToggleMapping: () => void;
  onVerify?: () => void;
  verifyPending?: boolean;
}) {
  const hasBlocks = data.detected_blocks.length > 0;
  const showSetMapping = useShowSetMapping(data, manualMapping);
  const avgRec = avgRecoveryDrop(data.detected_blocks);
  const alerts = compactAlertLines(data);
  const canManualMap =
    hasBlocks &&
    data.confidence !== "high" &&
    (data.expected_count ?? 0) > 0;

  const canVerify =
    hasBlocks &&
    (data.confidence === "medium" || data.confidence === "high") &&
    data.mapping_status !== "verified" &&
    Boolean(onVerify);

  return (
    <div className="space-y-1 rounded-lg border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface))] px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {data.confidence ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              Точность
            </span>
            <ConfidencePill confidence={data.confidence} />
          </span>
        ) : null}
        <MappingStatusPill
          mappingStatus={data.mapping_status}
          overridesApplied={data.overrides_applied}
        />
        {data.detected_count > 0 ? (
          <span className="tabular-nums text-[rgb(var(--app-text))]">
            <span className="text-[rgb(var(--app-text-muted))]">Блоков </span>
            <span className="font-semibold">{data.detected_count}</span>
            {data.expected_count != null ? (
              <span className="text-[rgb(var(--app-text-muted))]"> / {data.expected_count}</span>
            ) : null}
          </span>
        ) : null}
        {avgRec != null ? (
          <span className="tabular-nums">
            <span className="text-[rgb(var(--app-text-muted))]">Восстановление </span>
            <span className="font-semibold">−{avgRec}</span>
            <span className="text-[rgb(var(--app-text-muted))]"> уд/мин</span>
          </span>
        ) : null}
        {canVerify ? (
          <button
            type="button"
            disabled={verifyPending}
            className="ml-auto rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            onClick={onVerify}
          >
            {verifyPending ? "Сохранение…" : "Подходы верны"}
          </button>
        ) : null}
        {canManualMap ? (
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium",
              !canVerify && "ml-auto",
              manualMapping
                ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
                : "bg-[rgb(var(--app-accent))] text-white hover:opacity-90",
            )}
            onClick={onToggleMapping}
          >
            {manualMapping ? "Скрыть привязку" : "Показать привязку к подходам"}
          </button>
        ) : null}
        {showSetMapping && data.confidence === "high" ? (
          <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400">
            Привязка автоматическая
          </span>
        ) : null}
      </div>

      {alerts.length > 0 ? (
        <p className="text-[11px] leading-snug text-amber-800/90 dark:text-amber-200/90">
          {alerts.join(" ")}
        </p>
      ) : null}

      {!hasBlocks ? (
        <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
          Не удалось выделить блоки пульса.
        </p>
      ) : null}
    </div>
  );
}

export function DetectedBlocksTable({
  blocks,
  showSetMapping = false,
}: {
  blocks: StrengthHrDetectedBlock[];
  showSetMapping?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[rgb(var(--app-border)/0.45)] overflow-hidden">
      <div className="max-h-44 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-[1] bg-[rgb(var(--app-surface-subtle)/0.95)] backdrop-blur-sm">
            <tr className="border-b border-[rgb(var(--app-border)/0.45)] text-left text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              <th className="px-1.5 py-1 font-medium w-8">#</th>
              <th className="px-1.5 py-1 font-medium">Время</th>
              <th className="px-1.5 py-1 font-medium">Пик</th>
              <th className="px-1.5 py-1 font-medium">Восст.</th>
              {showSetMapping ? (
                <>
                  <th className="px-1.5 py-1 font-medium">Упр.</th>
                  <th className="px-1.5 py-1 font-medium">Подх.</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr
                key={b.block_index}
                className={cn(
                  "border-b border-[rgb(var(--app-border)/0.25)] last:border-0 hover:bg-[rgb(var(--app-surface-subtle)/0.35)]",
                  b.is_warmup && "opacity-75",
                )}
              >
                <td className="px-1.5 py-0.5 tabular-nums text-[rgb(var(--app-text-muted))]">
                  {b.block_index}
                </td>
                <td className="px-1.5 py-0.5 tabular-nums whitespace-nowrap">
                  {formatTimeRange(b.start_sec, b.end_sec)}
                </td>
                <td className="px-1.5 py-0.5 tabular-nums font-medium">
                  {b.peak_hr ?? "—"}
                  {b.avg_hr != null ? (
                    <span className="font-normal text-[rgb(var(--app-text-muted))]">/{b.avg_hr}</span>
                  ) : null}
                </td>
                <td className="px-1.5 py-0.5 tabular-nums text-[rgb(var(--app-text-muted))]">
                  {b.recovery_drop != null ? `−${b.recovery_drop}` : "—"}
                </td>
                {showSetMapping ? (
                  <>
                    <td className="px-1.5 py-0.5 max-w-[7rem] truncate" title={b.matched_exercise ?? undefined}>
                      {b.matched_exercise ?? "—"}
                    </td>
                    <td className="px-1.5 py-0.5 tabular-nums whitespace-nowrap">
                      {formatBlockTableSetLabel(b)}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StrengthHrAnalysisCompact({
  data,
  manualMapping,
  layout = "details-only",
}: {
  data: StrengthHrAnalysisResponse;
  manualMapping: boolean;
  layout?: "details-only";
}) {
  const hasBlocks = data.detected_blocks.length > 0;
  const showSetMapping = useShowSetMapping(data, manualMapping);

  if (!hasBlocks && layout === "details-only") return null;

  return (
    <details className="group rounded-lg border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface-subtle)/0.25)]">
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]">
        Детали блоков ({data.detected_count})
      </summary>
      <div className="border-t border-[rgb(var(--app-border)/0.35)] p-2">
        <DetectedBlocksTable blocks={data.detected_blocks} showSetMapping={showSetMapping} />
      </div>
    </details>
  );
}

export function useStrengthHrAnalysis(date: string, workoutTitle: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.strengthHrAnalysis(date, workoutTitle),
    queryFn: () => fetchStrengthHrAnalysis(date, workoutTitle),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function StrengthHrAnalysisFooter({
  date,
  workoutTitle,
  enabled,
}: {
  date: string;
  workoutTitle: string;
  enabled: boolean;
}) {
  const [manualMapping] = useState(false);
  const analysisQuery = useStrengthHrAnalysis(date, workoutTitle, enabled);
  if (!enabled) return null;
  if (analysisQuery.isLoading) return <Loader label="Анализ пульса…" compact />;
  if (analysisQuery.isError) return <ErrorAlert message={parseApiError(analysisQuery.error)} />;
  if (!analysisQuery.data?.detected_blocks.length) return null;
  return (
    <StrengthHrAnalysisCompact data={analysisQuery.data} manualMapping={manualMapping} />
  );
}
