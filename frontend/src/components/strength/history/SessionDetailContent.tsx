import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteStrengthHrBlockOverrides,
  fetchSessionDetail,
  fetchStrengthHeartRate,
  fetchStrengthSessionHeartRate,
  saveStrengthHrBlockOverrides,
  verifyStrengthHrSessionMapping,
} from "../../../api/strength";
import { useStrengthHrEditor } from "../../../hooks/useStrengthHrEditor";
import { useUnits } from "../../../hooks/useUnits";
import { queryKeys } from "../../../hooks/queryKeys";
import { ErrorAlert } from "../../ErrorAlert";
import { HeartRateChart } from "../../HeartRateChart";
import { Loader } from "../../Loader";
import {
  countSetsInRepsStr,
  formatSessionSetLabel,
  groupSessionSetsByExercise,
  sessionDisplaySetsFromDetail,
  sessionTimelineItemsFromDetail,
  type SessionDisplaySet,
} from "../workoutApproaches";
import { parseApiError } from "../../../utils/validation";
import { POLAR_HR_CHART_UNAVAILABLE } from "../../../utils/polarAttachFeedback";
import type { HrChartAxis } from "../../../utils/hrChart";
import type { HeartRatePoint, StrengthHrAnalysisResponse } from "../../../types";
import { blocksToOverridePayload } from "../../../types/strengthHrEditor";
import {
  MappingStatusPill,
  StrengthHrAnalysisCompact,
  StrengthHrAnalysisSummary,
  useShowSetMapping,
  useStrengthHrAnalysis,
} from "./StrengthHrBySetPanel";
import { StrengthHrBlockEditorPanel } from "./StrengthHrBlockEditorPanel";
import { EditableHeartRateChart } from "./EditableHeartRateChart";
import { StrengthHrBlockInspector } from "./StrengthHrBlockInspector";
import { StrengthHrGraphEditToolbar } from "./StrengthHrGraphEditToolbar";
import { cn } from "../../../lib/utils";

function formatSetLoad(
  s: SessionDisplaySet,
  formatBarbellWeight: (kg: number) => string,
): string {
  if (s.is_bodyweight || s.reps_str.includes("сек")) {
    return s.reps_str;
  }
  return `${formatBarbellWeight(s.weight)} × ${s.reps_str}`;
}

function StrengthHrEditView({
  date,
  workoutTitle,
  analysis,
  points,
  polarImport,
  axis,
  onExit,
}: {
  date: string;
  workoutTitle: string;
  analysis: StrengthHrAnalysisResponse;
  points: HeartRatePoint[];
  polarImport: boolean;
  axis: HrChartAxis;
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const autoBlocks = analysis.auto_detected_blocks ?? analysis.detected_blocks;
  const editor = useStrengthHrEditor(
    analysis.detected_blocks,
    autoBlocks,
    points,
    analysis.sets,
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      saveStrengthHrBlockOverrides(date, workoutTitle, blocksToOverridePayload(editor.blocks)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.strengthHrAnalysis(date, workoutTitle),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.strengthHrBlockOverrides(date, workoutTitle),
      });
      await queryClient.invalidateQueries({ queryKey: ["strength", "hr-analytics"] });
      onExit();
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => deleteStrengthHrBlockOverrides(date, workoutTitle),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.strengthHrAnalysis(date, workoutTitle),
      });
      await queryClient.invalidateQueries({ queryKey: ["strength", "hr-analytics"] });
      editor.dispatch({ type: "resetToAuto" });
      onExit();
    },
  });

  const saving = saveMutation.isPending || resetMutation.isPending;
  const [splitMode, setSplitMode] = useState(false);

  return (
    <div className="space-y-2">
      <StrengthHrGraphEditToolbar
        dirty={editor.dirty}
        saving={saving}
        splitMode={splitMode}
        warnings={editor.warnings}
        onSave={() => saveMutation.mutate()}
        onCancel={onExit}
        onResetAuto={() => resetMutation.mutate()}
        onToggleSplitMode={() => setSplitMode((v) => !v)}
      />

      <div className="grid gap-2 lg:grid-cols-[1fr_min(240px,32%)]">
        <div className="sticky top-2 z-10 min-h-[280px] rounded-lg border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface))] p-1.5 shadow-sm ring-1 ring-[rgb(var(--app-accent)/0.25)]">
          <EditableHeartRateChart
            points={points}
            axis={axis}
            timeAxisSeconds={polarImport}
            polarImport={polarImport}
            blocks={editor.blocks}
            selectedBlockId={editor.selectedBlockId}
            splitMode={splitMode}
            onSelectBlock={(blockId) => editor.dispatch({ type: "selectBlock", blockId })}
            onClearSelection={() => editor.dispatch({ type: "clearSelection" })}
            onMoveBoundary={(action) => editor.dispatch(action)}
            onSplitAt={(blockId, atSec) => editor.dispatch({ type: "splitBlock", blockId, atSec })}
          />
        </div>

        <StrengthHrBlockInspector
          block={editor.selectedBlock}
          blocks={editor.blocks}
          sets={analysis.sets}
          splitMode={splitMode}
          onDispatch={editor.dispatch}
        />
      </div>

      <StrengthHrBlockEditorPanel
        embedded
        blocks={editor.blocks}
        sets={analysis.sets}
        onDispatch={editor.dispatch}
      />

      {saveMutation.isError ? (
        <ErrorAlert message={parseApiError(saveMutation.error)} />
      ) : null}
      {resetMutation.isError ? (
        <ErrorAlert message={parseApiError(resetMutation.error)} />
      ) : null}
    </div>
  );
}

function StrengthHeartRatePanel({
  date,
  workoutTitle,
  workoutId,
  polarImport = false,
  hasHr: _hasHr = false,
  summaryAvgHr: _summaryAvgHr,
  summaryMaxHr: _summaryMaxHr,
}: {
  date: string;
  workoutTitle: string;
  workoutId: number | null;
  polarImport?: boolean;
  hasHr?: boolean;
  summaryAvgHr?: number | null;
  summaryMaxHr?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [manualMapping, setManualMapping] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();
  const axis: HrChartAxis = "time";

  const hrQuery = useQuery({
    queryKey:
      workoutId != null
        ? queryKeys.strengthHr(workoutId)
        : queryKeys.strengthHrSession(date, workoutTitle),
    queryFn: () =>
      workoutId != null
        ? fetchStrengthHeartRate(workoutId)
        : fetchStrengthSessionHeartRate(date, workoutTitle),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const hasPoints = Boolean(hrQuery.data?.points.length);
  const analysisQuery = useStrengthHrAnalysis(date, workoutTitle, open && hasPoints);
  const analysis = analysisQuery.data;
  const showSetMapping = useShowSetMapping(analysis, manualMapping);

  const verifyMutation = useMutation({
    mutationFn: () => verifyStrengthHrSessionMapping(date, workoutTitle),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.strengthHrAnalysis(date, workoutTitle),
      });
      await queryClient.invalidateQueries({ queryKey: ["strength", "hr-analytics"] });
    },
  });

  return (
    <div className="rounded-lg border border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs font-semibold text-[rgb(var(--app-accent))] hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Скрыть пульс" : "Пульс по подходам"}
        </button>
        {open && analysis && analysis.detected_blocks.length > 0 && !editMode ? (
          <>
            <MappingStatusPill
              mappingStatus={analysis.mapping_status}
              overridesApplied={analysis.overrides_applied}
            />
            <button
              type="button"
              className="ml-auto rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-0.5 text-[11px] font-medium hover:bg-[rgb(var(--app-surface))]"
              onClick={() => setEditMode(true)}
            >
              Редактировать на графике
            </button>
          </>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-2">
          {hrQuery.isLoading && <Loader label="Пульс…" compact />}
          {hrQuery.isError && <ErrorAlert message={parseApiError(hrQuery.error)} />}

          {hrQuery.isSuccess && (!hrQuery.data || hrQuery.data.points.length === 0) ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))]">Нет данных пульса</p>
          ) : null}

          {hasPoints ? (
            <>
              {analysisQuery.isLoading ? (
                <Loader label="Анализ пульса…" compact />
              ) : null}
              {analysisQuery.isError ? (
                <ErrorAlert message={parseApiError(analysisQuery.error)} />
              ) : null}

              {editMode && analysis ? (
                <StrengthHrEditView
                  date={date}
                  workoutTitle={workoutTitle}
                  analysis={analysis}
                  points={hrQuery.data!.points}
                  polarImport={polarImport}
                  axis={axis}
                  onExit={() => setEditMode(false)}
                />
              ) : (
                <>
                  <div className="sticky top-2 z-10 min-h-[280px] rounded-lg border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface))] p-1.5 shadow-sm">
                    <HeartRateChart
                      points={hrQuery.data!.points}
                      axis={axis}
                      smoothWindow={polarImport ? 5 : 0}
                      timeAxisSeconds={polarImport}
                      detectedBlocks={analysis?.detected_blocks}
                      matchQuality={analysis?.match_quality}
                      sessionConfidence={analysis?.confidence}
                      showSetMapping={showSetMapping}
                      tall
                    />
                  </div>

                  {analysis ? (
                    <StrengthHrAnalysisSummary
                      data={analysis}
                      manualMapping={manualMapping}
                      onToggleMapping={() => setManualMapping((v) => !v)}
                      onVerify={() => verifyMutation.mutate()}
                      verifyPending={verifyMutation.isPending}
                    />
                  ) : null}

                  {verifyMutation.isError ? (
                    <ErrorAlert message={parseApiError(verifyMutation.error)} />
                  ) : null}

                  {analysis ? (
                    <StrengthHrAnalysisCompact data={analysis} manualMapping={manualMapping} />
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SetChip({
  label,
  load,
  warmup,
}: {
  label: string;
  load: string;
  warmup?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        warmup
          ? "bg-slate-500/10 text-[rgb(var(--app-text-muted))]"
          : "bg-[rgb(var(--app-accent)/0.1)] text-[rgb(var(--app-text))]",
      )}
    >
      <span className="tabular-nums text-[rgb(var(--app-text-muted))]">{label}</span>
      {warmup ? <span className="opacity-70">разм.</span> : null}
      <span>{load}</span>
    </span>
  );
}

export function SessionDetailContent({
  date,
  workoutTitle,
  hasHrHint = false,
}: {
  date: string;
  workoutTitle: string;
  hasHrHint?: boolean;
}) {
  const { formatBarbellWeight } = useUnits();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.strengthDetail(date, workoutTitle),
    queryFn: () => fetchSessionDetail(date, workoutTitle),
  });

  if (isLoading) {
    return (
      <div className="py-6">
        <Loader label="Загрузка подходов…" compact />
      </div>
    );
  }
  if (isError) {
    return <ErrorAlert message={parseApiError(error)} />;
  }
  if (!data) return null;

  const polarImport = workoutTitle.includes("Polar");
  const hrWorkoutId = data.hr_workout_id ?? data.anchor_row_id ?? null;
  const canShowHr = Boolean(
    data.has_hr || hasHrHint || hrWorkoutId || (data.avg_hr != null && data.avg_hr > 0),
  );

  const sets = sessionDisplaySetsFromDetail(data);
  const timelineItems = sessionTimelineItemsFromDetail(data);
  const isCircuit = Boolean(data.is_circuit);

  return (
    <div className="space-y-4 pt-2">
      {canShowHr ? (
        <>
          {!data.has_hr && data.avg_hr != null && data.avg_hr > 0 ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))]">{POLAR_HR_CHART_UNAVAILABLE}</p>
          ) : null}
          <StrengthHeartRatePanel
            date={date}
            workoutTitle={workoutTitle}
            workoutId={hrWorkoutId}
            polarImport={polarImport}
            hasHr={Boolean(data.has_hr)}
            summaryAvgHr={data.avg_hr}
          />
        </>
      ) : null}

      {!sets.length ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))] py-2">Нет данных по подходам.</p>
      ) : timelineItems.some((item) => item.kind === "block") ? (
        <div className="space-y-3">
          {timelineItems.map((item, itemIndex) =>
            item.kind === "normal" ? (
                <article
                  key={`normal-${item.exercise}-${itemIndex}`}
                  className="rounded-xl border border-[rgb(var(--app-border)/0.65)] overflow-hidden bg-[rgb(var(--app-surface))]"
                >
                  <header className="px-3 py-2.5 border-b border-[rgb(var(--app-border)/0.5)] bg-gradient-to-r from-[rgb(var(--app-accent)/0.06)] to-transparent">
                    <h4 className="text-sm font-semibold text-[rgb(var(--app-text))]">{item.exercise}</h4>
                  </header>
                  <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
                    {(() => {
                      let prior = 0;
                      return item.sets.map((s, j) => {
                        const label = formatSessionSetLabel(s.reps_str, prior);
                        prior += countSetsInRepsStr(s.reps_str);
                        return (
                          <SetChip
                            key={j}
                            label={label}
                            load={formatSetLoad(s, formatBarbellWeight)}
                            warmup={s.is_warmup}
                          />
                        );
                      });
                    })()}
                  </div>
                </article>
              ) : (
            <article
              key={item.block.id}
              className="rounded-xl border border-[rgb(var(--app-border)/0.65)] overflow-hidden bg-[rgb(var(--app-surface))]"
            >
              <header className="px-3 py-2.5 border-b border-[rgb(var(--app-border)/0.5)] bg-gradient-to-r from-[rgb(var(--app-accent)/0.08)] to-transparent">
                <h4 className="text-sm font-semibold text-[rgb(var(--app-text))]">
                  {item.block.title || (item.block.type === "superset" ? "Суперсет" : "Круг")}{" "}
                  <span className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
                    #{timelineItems.slice(0, itemIndex + 1).filter((x) => x.kind === "block").length}
                    {` · ${item.block.rounds} раунд.`}
                  </span>
                </h4>
              </header>
              <ol className="divide-y divide-[rgb(var(--app-border)/0.45)]">
                {item.block.sets
                  .filter((s) => (s.round_index ?? 1) === 1)
                  .map((s, i) => (
                  <li key={`${s.order_index ?? i}-${s.exercise}`} className="px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[rgb(var(--app-surface-subtle))] px-2 py-0.5 text-xs tabular-nums text-[rgb(var(--app-text-muted))]">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-[rgb(var(--app-text))]">{s.exercise}</span>
                      <span className="text-[rgb(var(--app-text-muted))]">{formatSetLoad(s, formatBarbellWeight)}</span>
                      {s.is_warmup ? <span className="text-xs text-[rgb(var(--app-text-muted))]">разминка</span> : null}
                    </div>
                  </li>
                ))}
              </ol>
              {item.block.rounds > 1 ? (
                <p className="px-3 py-2 text-xs font-medium text-[rgb(var(--app-text-muted))]">
                  Повторено {item.block.rounds} раунд.
                </p>
              ) : null}
            </article>
              ),
          )}
        </div>
      ) : isCircuit ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            Круговой порядок
          </p>
          <ol className="relative space-y-0 pl-1">
            {sets.map((s, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center shrink-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--app-accent))] text-[11px] font-bold text-white tabular-nums">
                    {s.order_index ?? i + 1}
                  </span>
                  {i < sets.length - 1 ? (
                    <div className="w-px flex-1 min-h-[1rem] bg-[rgb(var(--app-border))] mt-1" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-[rgb(var(--app-text))]">{s.exercise}</p>
                  <p className="text-sm text-[rgb(var(--app-text-muted))] mt-0.5">
                    {s.is_warmup ? <span className="text-xs mr-1">разминка · </span> : null}
                    {formatSetLoad(s, formatBarbellWeight)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="space-y-3">
          {groupSessionSetsByExercise(sets).map((g) => (
            <article
              key={g.exercise}
              className="rounded-xl border border-[rgb(var(--app-border)/0.65)] overflow-hidden bg-[rgb(var(--app-surface))]"
            >
              <header className="px-3 py-2.5 border-b border-[rgb(var(--app-border)/0.5)] bg-gradient-to-r from-[rgb(var(--app-accent)/0.06)] to-transparent">
                <h4 className="text-sm font-semibold text-[rgb(var(--app-text))]">{g.exercise}</h4>
              </header>
              <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
                {(() => {
                  let prior = 0;
                  return g.sets.map((s, j) => {
                    const label = formatSessionSetLabel(s.reps_str, prior);
                    prior += countSetsInRepsStr(s.reps_str);
                    return (
                      <SetChip
                        key={j}
                        label={label}
                        load={formatSetLoad(s, formatBarbellWeight)}
                        warmup={s.is_warmup}
                      />
                    );
                  });
                })()}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
