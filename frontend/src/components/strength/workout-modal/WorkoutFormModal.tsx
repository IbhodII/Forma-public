import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { appendExerciseToWorkout } from "../../../api/exercises";
import {
  createStrengthWorkout,
  fetchSessionDetail,
  addStrengthExercise,
  ensureStrengthExercisesInCatalog,
  fetchStrengthNextWorkoutSuggestion,
  fetchWorkoutFormPrefill,
  type StrengthNextWorkoutSuggestion,
} from "../../../api/strength";
import {
  attachPolarToStrength,
  isPolarPendingNotFound,
  type PolarPendingListItem,
} from "../../../api/polar";
import { resolvePolarAfterManualSave } from "../../../hooks/usePolarAutoAttach";
import { polarAttachToast } from "../../../utils/polarAttachFeedback";
import { useExercises } from "../../../hooks/useExercises";
import { PolarPickPendingModal } from "../../PolarSameDateModal";
import { ErrorAlert } from "../../ErrorAlert";
import { Loader } from "../../Loader";
import { ModalCloseButton, ModalFrame } from "../../ui/modal";
import { useToast } from "../../Toast";
import { useUnits } from "../../../hooks/useUnits";
import { queryKeys } from "../../../hooks/queryKeys";
import { WorkoutHeader } from "./WorkoutHeader";
import { StickyWorkoutFooter } from "./StickyWorkoutFooter";
import { WorkoutBlocksEditor } from "./WorkoutBlocksEditor";
import {
  blocksFromPrefill,
  blocksFromSessionDetail,
  blocksToStrengthSets,
  flattenWorkoutBlocks,
  newWorkoutBlock,
  newWorkoutApproach,
  type WorkoutBlock,
} from "../workoutApproaches";
import type { StrengthWorkoutCreate } from "../../../types";
import { formatDateRu } from "../../../utils/format";
import { isPlankExercise } from "../../../utils/strengthExercise";
import { parseApiError, validateNotFuture } from "../../../utils/validation";
import { invalidateAfterPolarAttach } from "../../../utils/polarQueryInvalidation";
import { useWorkoutFormGate } from "../../../contexts/WorkoutFormGateContext";

export function WorkoutFormModal({
  initial,
  defaultWorkoutTitle,
  workoutTypes,
  readOnlyPreset,
  polarAttach,
  onPolarDone,
  onClose,
  onSaved,
}: {
  initial?: {
    date: string;
    workout_title: string;
    avg_hr?: number | null;
    calories_chest?: number | null;
    calories_watch?: number | null;
  };
  defaultWorkoutTitle?: string;
  workoutTypes: string[];
  readOnlyPreset?: boolean;
  polarAttach?: PolarPendingListItem;
  onPolarDone?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const { registerWorkoutFormOpen } = useWorkoutFormGate();
  const { system, formatBarbellWeight } = useUnits();
  const useAmerican = system === "american";
  const qc = useQueryClient();
  const { data: catalogNames = [] } = useExercises();
  const types = workoutTypes.length ? workoutTypes : [];
  const [date, setDate] = useState(
    initial?.date ?? polarAttach?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [workoutTitle, setWorkoutTitle] = useState(
    initial?.workout_title ?? defaultWorkoutTitle ?? types[0],
  );
  const [avgHr, setAvgHr] = useState(initial?.avg_hr?.toString() ?? "");
  const [kcalChest, setKcalChest] = useState(
    initial?.calories_chest?.toString() ?? (polarAttach?.calories != null ? String(polarAttach.calories) : ""),
  );
  const [kcalWatch, setKcalWatch] = useState("");
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [presetId, setPresetId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [polarPick, setPolarPick] = useState<{
    workoutId: number;
    candidates: PolarPendingListItem[];
    sessionDate?: string;
    sessionTitle?: string;
  } | null>(null);

  useEffect(() => {
    registerWorkoutFormOpen(true);
    return () => registerWorkoutFormOpen(false);
  }, [registerWorkoutFormOpen]);

  const { data: prefill, isLoading: prefillLoading } = useQuery({
    queryKey: queryKeys.strengthPrefill(workoutTitle, date),
    queryFn: () => fetchWorkoutFormPrefill(workoutTitle, date),
    enabled: !initial && Boolean(workoutTitle && date),
  });

  const { data: editDetail, isLoading: editLoading } = useQuery({
    queryKey: queryKeys.strengthDetail(initial?.date ?? "", initial?.workout_title ?? ""),
    queryFn: () => fetchSessionDetail(initial!.date, initial!.workout_title),
    enabled: Boolean(initial?.date && initial?.workout_title),
  });

  useEffect(() => {
    if (!initial || !editDetail) return;
    setAvgHr(editDetail.avg_hr != null ? String(editDetail.avg_hr) : "");
    setKcalChest(editDetail.calories_chest != null ? String(editDetail.calories_chest) : "");
    setKcalWatch(editDetail.calories_watch != null ? String(editDetail.calories_watch) : "");
    setBlocks(blocksFromSessionDetail(editDetail, useAmerican));
  }, [initial, editDetail, useAmerican]);

  useEffect(() => {
    if (initial) return;
    if (!prefill) return;
    if (prefill.preset_id != null) setPresetId(prefill.preset_id);
    setBlocks(blocksFromPrefill(prefill, useAmerican, formatBarbellWeight, formatDateRu));
    const m = prefill.session_metrics;
    if (m.avg_hr != null) setAvgHr(String(m.avg_hr));
    if (m.calories_chest != null) setKcalChest(String(m.calories_chest));
    if (m.calories_watch != null) setKcalWatch(String(m.calories_watch));
  }, [prefill, initial, useAmerican, formatBarbellWeight]);

  const uniqueExercises = useMemo(() => {
    const names = new Set<string>();
    flattenWorkoutBlocks(blocks).forEach((row) => {
      const n = row.exercise.trim();
      if (n) names.add(n);
    });
    return [...names];
  }, [blocks]);

  const suggestionQueries = useQueries({
    queries: uniqueExercises.map((exercise) => ({
      queryKey: queryKeys.strengthNextSuggestion(exercise, workoutTitle),
      queryFn: () =>
        fetchStrengthNextWorkoutSuggestion({
          exercise_name: exercise,
          workout_title: workoutTitle,
        }),
      staleTime: 60_000,
    })),
  });

  const suggestionByExercise = useMemo(() => {
    const map = new Map<string, StrengthNextWorkoutSuggestion>();
    uniqueExercises.forEach((exercise, i) => {
      const data = suggestionQueries[i]?.data;
      if (data) map.set(exercise, data);
    });
    return map;
  }, [uniqueExercises, suggestionQueries]);

  const appendMut = useMutation({
    mutationFn: () =>
      appendExerciseToWorkout({
        workout_title: workoutTitle,
        date,
        exercise_name: newExerciseName.trim(),
      }),
    onSuccess: (res) => {
      setNewExerciseName("");
      setShowNewExercise(false);
      void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
      void qc.invalidateQueries({ queryKey: queryKeys.strengthPrefill(workoutTitle, date) });
      setBlocks((prev) => {
        if (flattenWorkoutBlocks(prev).some((e) => e.exercise.toLowerCase() === res.exercise.toLowerCase())) {
          return prev;
        }
        const row = newWorkoutApproach(useAmerican, {
          exercise: res.exercise,
          is_bodyweight: isPlankExercise(res.exercise),
        });
        if (!prev.length) return [newWorkoutBlock(useAmerican, "normal", { approaches: [row] })];
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, approaches: [...last.approaches, row] };
        return copy;
      });
      showToast(res.added ? "Упражнение добавлено в набор" : "Упражнение уже в наборе", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const saveMut = useMutation({
    mutationFn: async (body: StrengthWorkoutCreate) => {
      const catalogSet = new Set(catalogNames.map((n) => n.toLowerCase()));
      const toRegister = flattenWorkoutBlocks(blocks)
        .map((row) => row.exercise.trim())
        .filter((name) => name && !catalogSet.has(name.toLowerCase()));
      await ensureStrengthExercisesInCatalog(toRegister);
      void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
      const res = await createStrengthWorkout(body);
      return { ...res, date: body.date };
    },
    onSuccess: async (result) => {
      void qc.invalidateQueries({ queryKey: ["strength", "next-suggestion"] });
      void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
      showToast(initial ? "Тренировка обновлена" : "Тренировка сохранена", "success");
      if (polarAttach && result.workout_id > 0) {
        try {
          const attachRes = await attachPolarToStrength(result.workout_id, polarAttach.polar_transaction_id);
          await invalidateAfterPolarAttach(qc, {
            kind: "strength",
            workoutId: result.workout_id,
            sessionDate: result.date,
            sessionTitle: workoutTitle,
          });
          const toast = polarAttachToast(attachRes);
          showToast(toast.message, toast.kind);
          onPolarDone?.();
          onSaved();
          onClose();
          return;
        } catch (e) {
          showToast(parseApiError(e), "error");
        }
      }
      if (result.workout_id > 0) {
        try {
          const resolved = await resolvePolarAfterManualSave(
            result.date,
            "силовая",
            result.workout_id,
            "strength",
          );
          if (resolved.action === "attached") {
            await invalidateAfterPolarAttach(qc, {
              kind: "strength",
              workoutId: result.workout_id,
              sessionDate: result.date,
              sessionTitle: workoutTitle,
            });
            const toast = polarAttachToast(resolved.attachResult);
            showToast(toast.message, toast.kind);
            onSaved();
            onClose();
            return;
          }
          if (resolved.action === "pick") {
            setPolarPick({
              workoutId: result.workout_id,
              candidates: resolved.candidates,
              sessionDate: result.date,
              sessionTitle: workoutTitle,
            });
            return;
          }
        } catch (e) {
          if (!isPolarPendingNotFound(e)) {
            showToast(parseApiError(e), "error");
          }
        }
      }
      void qc.invalidateQueries({ queryKey: ["strength"] });
      onSaved();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateErr = validateNotFuture(date);
    if (dateErr) {
      setFormError(dateErr);
      return;
    }
    let sets;
    try {
      sets = blocksToStrengthSets(blocks, useAmerican);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      return;
    }
    setFormError(null);
    const body: StrengthWorkoutCreate = {
      date,
      workout_title: workoutTitle,
      sets,
      avg_hr: avgHr ? Number(avgHr) : null,
      calories_chest: kcalChest ? Number(kcalChest) : null,
      calories_watch: kcalWatch ? Number(kcalWatch) : null,
      preset_id: presetId,
      is_circuit: blocks.some((block) => block.type === "circuit"),
      ...(initial
        ? {
            edit_session_date: initial.date,
            edit_session_title: initial.workout_title,
          }
        : {}),
    };
    saveMut.mutate(body);
  };

  const addApproach = () => {
    setBlocks((prev) => {
      if (!prev.length) {
        return [newWorkoutBlock(useAmerican)];
      }
      const copy = [...prev];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = {
        ...last,
        approaches: [...last.approaches, newWorkoutApproach(useAmerican)],
      };
      return copy;
    });
  };

  return (
    <>
      <ModalFrame
        open={!polarPick}
        onClose={onClose}
        dismissOnOverlay={false}
        zIndex={50}
        panelClassName="workout-form-modal max-w-3xl max-h-[min(92dvh,900px)] flex flex-col p-0 overflow-hidden"
        dialogLabel="workout-modal-title"
      >
        <div className="shrink-0 px-5 sm:px-6 pt-5 pb-3 border-b border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="workout-modal-title" className="text-xl font-semibold tracking-tight text-[rgb(var(--app-text))]">
                {initial ? "Редактировать тренировку" : "Добавить тренировку"}
              </h2>
              <p className="text-sm text-[rgb(var(--app-text-muted))] mt-0.5">
                Блоки, суперсеты и круги внутри одной силовой тренировки
              </p>
            </div>
            <ModalCloseButton onClose={onClose} />
          </div>
        </div>

        {formError ? (
          <div className="shrink-0 px-5 sm:px-6 pt-3">
            <ErrorAlert message={formError} />
          </div>
        ) : null}

        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5 min-h-0">
            <WorkoutHeader
              date={date}
              workoutTitle={workoutTitle}
              workoutTypes={types}
              readOnlyPreset={readOnlyPreset}
              avgHr={avgHr}
              kcalChest={kcalChest}
              kcalWatch={kcalWatch}
              onDateChange={setDate}
              onWorkoutTitleChange={setWorkoutTitle}
              onAvgHrChange={setAvgHr}
              onKcalChestChange={setKcalChest}
              onKcalWatchChange={setKcalWatch}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">
                  Блоки тренировки
                </h3>
                <span className="text-xs tabular-nums text-[rgb(var(--app-text-muted))]">
                  {blocks.length} блок{blocks.length === 1 ? "" : blocks.length < 5 ? "а" : "ов"}
                </span>
              </div>

              {(prefillLoading && !initial) || (editLoading && Boolean(initial)) ? (
                <Loader label="Загрузка…" compact />
              ) : null}

              {!prefillLoading && !blocks.length && !initial ? (
                <p className="text-sm text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3">
                  Нет активных упражнений. Задайте набор во вкладке «Набор упражнений».
                </p>
              ) : null}

              {!(prefillLoading && !initial) && blocks.length > 0 ? (
                <WorkoutBlocksEditor
                  blocks={blocks}
                  catalogNames={catalogNames}
                  suggestionByExercise={suggestionByExercise}
                  useAmerican={useAmerican}
                  onReplaceBlocks={setBlocks}
                />
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={addApproach}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--app-accent)/0.35)] bg-[rgb(var(--app-accent)/0.08)] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--app-accent))] hover:bg-[rgb(var(--app-accent)/0.14)] transition-colors shadow-sm"
                >
                  + Добавить упражнение / подход
                </button>
              </div>

              {!initial ? (
                <div className="rounded-2xl border border-dashed border-[rgb(var(--app-border))] p-4 space-y-2 bg-[rgb(var(--app-surface-subtle)/0.25)]">
                  {!showNewExercise ? (
                    <button
                      type="button"
                      onClick={() => setShowNewExercise(true)}
                      className="text-sm font-medium text-[rgb(var(--app-accent))] hover:underline"
                    >
                      + Новое упражнение в справочник
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={newExerciseName}
                        onChange={(e) => setNewExerciseName(e.target.value)}
                        onBlur={() => {
                          const n = newExerciseName.trim();
                          if (!n) return;
                          const known = catalogNames.some((c) => c.toLowerCase() === n.toLowerCase());
                          if (known) return;
                          void addStrengthExercise(n)
                            .then(() => {
                              void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
                            })
                            .catch(() => undefined);
                        }}
                        placeholder="Название упражнения"
                        className="input-field text-sm w-full"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewExercise(false);
                            setNewExerciseName("");
                          }}
                          className="btn-secondary text-sm"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          disabled={!newExerciseName.trim() || appendMut.isPending}
                          onClick={() => appendMut.mutate()}
                          className="btn-primary text-sm"
                        >
                          {appendMut.isPending ? "…" : "Добавить в тренировку"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <StickyWorkoutFooter saving={saveMut.isPending} isEdit={Boolean(initial)} onCancel={onClose} />
        </form>
      </ModalFrame>
      {polarPick && (
        <PolarPickPendingModal
          workoutId={polarPick.workoutId}
          kind="strength"
          candidates={polarPick.candidates}
          sessionDate={polarPick.sessionDate}
          sessionTitle={polarPick.sessionTitle}
          onClose={() => {
            setPolarPick(null);
            void qc.invalidateQueries({ queryKey: ["strength"] });
            onSaved();
            onClose();
          }}
          onDone={() => {
            void qc.invalidateQueries({ queryKey: ["strength"] });
            setPolarPick(null);
            onPolarDone?.();
            onSaved();
            onClose();
          }}
        />
      )}
    </>
  );
}
