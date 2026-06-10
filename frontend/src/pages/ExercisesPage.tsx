import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseSetSummary } from "../api/exercises";
import {
  createWorkoutType,
  addStrengthExercise,
  deleteStrengthExercise,
  deleteExerciseSet,
  deleteWorkoutType,
  fetchExerciseCatalog,
  fetchAllExerciseNames,
  fetchExerciseSetDetail,
  fetchExerciseSetEditor,
  fetchWorkoutTypes,
  saveExerciseSet,
  updateStrengthExercise,
  updateExerciseSet,
  type ExerciseCatalogDetailItem,
} from "../api/exercises";
import { fetchPresets } from "../api/presets";
import { ConfirmModal } from "../components/ConfirmModal";
import { ErrorAlert } from "../components/ErrorAlert";
import { Loader } from "../components/Loader";
import { useToast } from "../components/Toast";
import { queryKeys } from "../hooks/queryKeys";
import { formatDateRu } from "../utils/format";
import { parseApiError } from "../utils/validation";
import {
  loadDefaultCircuitMode,
  saveDefaultCircuitMode,
} from "../utils/strengthCircuitDefaults";
import { AppPageShell, PageSection, UnifiedPageHeader } from "../components/page-shell";
import { CompositionChain } from "../components/exercises/CompositionChain";
import { WorkoutBlocksEditor } from "../components/strength/workout-modal/WorkoutBlocksEditor";
import {
  flattenWorkoutBlocks,
  newWorkoutApproach,
  newWorkoutBlock,
  workoutBlocksFromExerciseSetBlocks,
  workoutBlocksToExerciseSetBlocks,
  type WorkoutBlock,
} from "../components/strength/workoutApproaches";
import { workoutVisual } from "../utils/workoutVisuals";
import { WorkoutCategoryIcon } from "../components/fitness/WorkoutCategoryIcon";
import { ChevronDown, Search, Trash2 } from "lucide-react";
import { ModalShell } from "../components/ui/modal";
import { useUnits } from "../hooks/useUnits";

type SetSelection = number | "new";

function fmtSetPeriod(from: string, to: string | null) {
  const a = formatDateRu(from);
  const b = to ? formatDateRu(to) : "…";
  return `${a} — ${b}`;
}

function reorderItems<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function setLabel(s: ExerciseSetSummary) {
  const name = s.set_name || (s.is_default ? "Исходный набор" : "Набор");
  return `${name} (${s.n_exercises})`;
}

function isCustomWorkoutType(_type: string): boolean {
  return true;
}

export function ExercisesPage({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [showNewType, setShowNewType] = useState(false);
  const [referenceDate, setReferenceDate] = useState(today);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(() => new Set());
  const [defaultCircuit, setDefaultCircuit] = useState(() => loadDefaultCircuitMode());
  const [typeSearch, setTypeSearch] = useState("");

  const handleTypeRemoved = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      next.delete(type);
      return next;
    });
    void qc.invalidateQueries({ queryKey: queryKeys.strengthWorkoutTypes });
    void qc.invalidateQueries({ queryKey: queryKeys.strengthPresets() });
    void qc.invalidateQueries({ queryKey: ["presets"] });
  };

  const { data: typesFromApi } = useQuery({
    queryKey: queryKeys.strengthWorkoutTypes,
    queryFn: fetchWorkoutTypes,
  });

  const workoutTypes = typesFromApi ?? [];
  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return workoutTypes;
    return workoutTypes.filter((t) => t.toLowerCase().includes(q));
  }, [workoutTypes, typeSearch]);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const newTypeAction = (
    <button type="button" className="btn-secondary rounded-xl" onClick={() => setShowNewType((v) => !v)}>
      {showNewType ? "Закрыть" : "+ Новый тип"}
    </button>
  );

  const content = (
    <>
      {showNewType && (
        <NewWorkoutTypeForm
          onCreated={(createdName) => {
            void qc.invalidateQueries({ queryKey: queryKeys.strengthWorkoutTypes });
            void qc.invalidateQueries({ queryKey: queryKeys.strengthPresets() });
            setShowNewType(false);
            if (createdName) {
              setExpandedTypes((prev) => new Set(prev).add(createdName));
            }
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <label className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[rgb(var(--app-text-muted))]" />
          <input
            type="search"
            className="input-field pl-9 w-full rounded-xl"
            placeholder="Поиск типа тренировки…"
            value={typeSearch}
            onChange={(e) => setTypeSearch(e.target.value)}
          />
        </label>
        <label className="text-sm block max-w-xs card-panel flex-1 min-w-[12rem] rounded-xl">
          Дата действующего набора
          <input
            type="date"
            className="input-field mt-1 rounded-xl"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
          />
        </label>
        <label className="text-sm card-panel flex items-start gap-2 cursor-pointer max-w-md rounded-xl">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={defaultCircuit}
            onChange={(e) => {
              setDefaultCircuit(e.target.checked);
              saveDefaultCircuitMode(e.target.checked);
            }}
          />
          <span>
            <span className="font-medium text-slate-800">Круговая тренировка по умолчанию</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Для новых типов без истории. После сохранения тренировки режим круга запоминается для
              этого типа и подставляется из прошлой сессии.
            </span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredTypes.map((type) => {
          const v = workoutVisual(type);
          const open = expandedTypes.has(type);
          return (
            <div
              key={type}
              className={`rounded-2xl border overflow-hidden transition-all ${
                open
                  ? "border-[rgb(var(--app-accent)/0.35)] shadow-[var(--app-shadow-sm)]"
                  : "border-[rgb(var(--app-border)/0.75)]"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleType(type)}
                className={`w-full flex items-center gap-4 p-4 sm:p-5 text-left bg-gradient-to-r ${v.accentClass}`}
              >
                <WorkoutCategoryIcon visual={v} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-[rgb(var(--app-text))]">{type}</h3>
                  <p className="text-xs text-[rgb(var(--app-text-muted))] mt-0.5">
                    Наборы упражнений · {open ? "свернуть" : "настроить"}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-[rgb(var(--app-text-muted))] transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {open ? (
                <div className="p-4 sm:p-5 border-t border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface))]">
                  <ExerciseWorkoutTypeBlock
                    workoutType={type}
                    referenceDate={referenceDate}
                    hideTitle
                    onTypeRemoved={() => handleTypeRemoved(type)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );

  if (embedded) {
    return (
      <PageSection
        surface={false}
        eyebrow="Библиотека"
        title="Набор упражнений"
        description="Категории, цепочки упражнений и поиск по каталогу."
        actions={newTypeAction}
      >
        {content}
      </PageSection>
    );
  }

  return (
    <AppPageShell>
      <UnifiedPageHeader
        eyebrow="Exercise library"
        title="Набор упражнений"
        description="Категории тренировок, цепочки упражнений и поиск по каталогу."
        actions={newTypeAction}
      />
      {content}
    </AppPageShell>
  );
}

function ExerciseWorkoutTypeBlock({
  workoutType,
  referenceDate,
  hideTitle = false,
  onTypeRemoved,
}: {
  workoutType: string;
  referenceDate: string;
  hideTitle?: boolean;
  onTypeRemoved?: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { system } = useUnits();
  const useAmerican = system === "american";
  const today = new Date().toISOString().slice(0, 10);
  const catalogRef = useRef<HTMLDivElement>(null);
  const isCustomType = isCustomWorkoutType(workoutType);

  const [selectedSet, setSelectedSet] = useState<SetSelection>("new");
  const [setName, setSetName] = useState("");
  const [newEffectiveFrom, setNewEffectiveFrom] = useState(today);
  const [templateBlocks, setTemplateBlocks] = useState<WorkoutBlock[]>([]);
  const [copyFromActive, setCopyFromActive] = useState(true);
  const [showOnMainPanel, setShowOnMainPanel] = useState(false);
  const [deleteSetConfirm, setDeleteSetConfirm] = useState<ExerciseSetSummary | null>(null);
  const [deleteTypeConfirm, setDeleteTypeConfirm] = useState(false);
  const composition = useMemo(
    () => flattenWorkoutBlocks(templateBlocks).map((row) => row.exercise.trim()).filter(Boolean),
    [templateBlocks],
  );

  const { data: presets } = useQuery({
    queryKey: queryKeys.strengthPresets(),
    queryFn: () => fetchPresets(),
  });

  const hasPreset = useMemo(
    () => presets?.some((p) => p.name === workoutType) ?? false,
    [presets, workoutType],
  );

  const { data: editor, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.exerciseEditor(workoutType, referenceDate),
    queryFn: () => fetchExerciseSetEditor(workoutType, referenceDate),
    enabled: Boolean(workoutType),
  });
  const { data: allExerciseNames } = useQuery({
    queryKey: queryKeys.strengthExercises,
    queryFn: fetchAllExerciseNames,
  });
  const catalogNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of allExerciseNames ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [allExerciseNames]);

  const editingSetId = typeof selectedSet === "number" ? selectedSet : null;

  const { data: setDetail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.exerciseSetDetail(editingSetId ?? 0),
    queryFn: () => fetchExerciseSetDetail(editingSetId!),
    enabled: editingSetId !== null,
  });

  useEffect(() => {
    if (!editor) return;
    if (selectedSet === "new") {
      if (copyFromActive && editor.active_exercises.length) {
        setTemplateBlocks(
          workoutBlocksFromExerciseSetBlocks(editor.active_blocks, editor.active_exercises, useAmerican),
        );
      } else {
        setTemplateBlocks([newWorkoutBlock(useAmerican)]);
      }
      setSetName("");
      return;
    }
    if (typeof selectedSet === "number" && setDetail && setDetail.id === selectedSet) {
      setTemplateBlocks(
        workoutBlocksFromExerciseSetBlocks(setDetail.blocks, setDetail.exercises, useAmerican),
      );
      setSetName(setDetail.set_name ?? "");
    }
  }, [editor, selectedSet, setDetail, copyFromActive, useAmerican]);

  const lastInitType = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || editor.workout_type !== workoutType) return;
    if (lastInitType.current === workoutType) return;
    lastInitType.current = workoutType;
    const active = editor.active_set_id;
    if (active != null) {
      setSelectedSet(active);
    } else if (editor.sets.length) {
      setSelectedSet(editor.sets[editor.sets.length - 1].id);
    } else {
      setSelectedSet("new");
    }
  }, [editor, workoutType]);

  useEffect(() => {
    if (presets === undefined) return;
    setShowOnMainPanel(!hasPreset);
  }, [hasPreset, presets, workoutType]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["exercises"] });
    void qc.invalidateQueries({ queryKey: queryKeys.strengthWorkoutTypes });
    void qc.invalidateQueries({ queryKey: queryKeys.strengthPresets() });
    void qc.invalidateQueries({ queryKey: ["strength"] });
    void qc.invalidateQueries({ queryKey: ["presets"] });
    void refetch();
    if (editingSetId) {
      void qc.invalidateQueries({ queryKey: queryKeys.exerciseSetDetail(editingSetId) });
    }
  };

  const saveExistingMut = useMutation({
    mutationFn: () => {
      if (!editingSetId) throw new Error("Набор не выбран");
      if (!composition.length) throw new Error("Добавьте хотя бы одно упражнение");
      return updateExerciseSet(editingSetId, {
        active_exercises: composition,
        active_blocks: workoutBlocksToExerciseSetBlocks(templateBlocks, useAmerican),
        set_name: setName.trim() || null,
      });
    },
    onSuccess: () => {
      showToast("Набор обновлён", "success");
      invalidateAll();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const saveNewMut = useMutation({
    mutationFn: () => {
      if (!composition.length) throw new Error("Добавьте хотя бы одно упражнение");
      return saveExerciseSet({
        workout_type: workoutType,
        effective_from: newEffectiveFrom,
        active_exercises: composition,
        active_blocks: workoutBlocksToExerciseSetBlocks(templateBlocks, useAmerican),
        set_name: setName.trim() || null,
        show_on_main_panel: showOnMainPanel,
      });
    },
    onSuccess: (res) => {
      showToast("Новый набор создан", "success");
      invalidateAll();
      setSelectedSet(res.set_id);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const deleteSetMut = useMutation({
    mutationFn: (setId: number) => deleteExerciseSet(setId),
    onSuccess: (res) => {
      setDeleteSetConfirm(null);
      invalidateAll();
      if (res.type_removed) {
        showToast(
          res.workout_count > 0
            ? `Тип удалён. ${res.workout_count} тренировок сохранены в архиве пресетов.`
            : "Тип тренировки удалён",
          "success",
        );
        onTypeRemoved?.();
      } else {
        showToast("Набор удалён. История тренировок сохранена.", "success");
        setSelectedSet("new");
      }
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const deleteTypeMut = useMutation({
    mutationFn: () => deleteWorkoutType(workoutType),
    onSuccess: (res) => {
      setDeleteTypeConfirm(false);
      invalidateAll();
      showToast(
        res.workout_count > 0
          ? `Тип удалён. ${res.workout_count} тренировок сохранены в архиве пресетов.`
          : "Тип тренировки удалён",
        "success",
      );
      onTypeRemoved?.();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const addToComposition = (name: string) => {
    const n = name.trim();
    if (!n || composition.includes(n)) return;
    setTemplateBlocks((prev) => {
      const row = newWorkoutApproach(useAmerican, { exercise: n });
      const onlyEmpty =
        prev.length === 1 &&
        prev[0].type === "normal" &&
        prev[0].approaches.length === 1 &&
        !prev[0].approaches[0].exercise.trim();
      if (!prev.length || onlyEmpty) {
        return [newWorkoutBlock(useAmerican, "normal", { approaches: [row] })];
      }
      return [
        ...prev,
        newWorkoutBlock(useAmerican, "normal", { approaches: [row] }),
      ];
    });
  };

  const removeFromComposition = (name: string) => {
    const key = name.trim().toLocaleLowerCase("ru-RU");
    if (!key) return;
    setTemplateBlocks((prev) => {
      const next = prev
        .map((block) => ({
          ...block,
          approaches: block.approaches.filter(
            (row) => row.exercise.trim().toLocaleLowerCase("ru-RU") !== key,
          ),
        }))
        .filter((block) => block.approaches.length > 0);
      return next.length ? next : [newWorkoutBlock(useAmerican)];
    });
  };

  const isNewMode = selectedSet === "new";
  const isActiveSet =
    !isNewMode && editor?.active_set_id != null && selectedSet === editor.active_set_id;

  return (
    <div className={hideTitle ? "space-y-4" : "card-panel space-y-4"}>
      {!hideTitle && <h4 className="text-base font-semibold text-slate-800">{workoutType}</h4>}

      {isLoading && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}

      {editor && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Наборы</p>
            <div className="flex flex-wrap gap-2">
              {editor.sets.map((s) => {
                const active = selectedSet === s.id;
                const isCurrent = editor.active_set_id === s.id;
                const canDelete = s.is_default !== 1;
                return (
                  <div key={s.id} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSet(s.id)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-all flex-1 ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="font-medium">{setLabel(s)}</span>
                      {isCurrent && (
                        <span className="ml-2 text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          на {formatDateRu(referenceDate)}
                        </span>
                      )}
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {fmtSetPeriod(s.effective_from, s.effective_to)}
                      </span>
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        title="Удалить набор"
                        className="px-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteSetConfirm(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setSelectedSet("new");
                  if (copyFromActive && editor.active_exercises.length) {
                      setTemplateBlocks(
                        workoutBlocksFromExerciseSetBlocks(editor.active_blocks, editor.active_exercises, useAmerican),
                      );
                  } else {
                      setTemplateBlocks([newWorkoutBlock(useAmerican)]);
                  }
                }}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                  isNewMode
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-dashed border-slate-300 text-slate-600 hover:border-brand-400"
                }`}
              >
                + Новый набор
              </button>
            </div>
          </div>

          {isNewMode ? (
            <div className="grid sm:grid-cols-2 gap-3 border-t pt-4">
              <label className="text-sm block">
                Действует с даты
                <input
                  type="date"
                  className="input-field mt-1"
                  value={newEffectiveFrom}
                  onChange={(e) => setNewEffectiveFrom(e.target.value)}
                />
              </label>
              <label className="text-sm block">
                Название набора (необяз.)
                <input
                  className="input-field mt-1"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="Например: Зима 2026"
                />
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={copyFromActive}
                  onChange={(e) => {
                    setCopyFromActive(e.target.checked);
                    if (e.target.checked) {
                      setTemplateBlocks(
                        workoutBlocksFromExerciseSetBlocks(editor.active_blocks, editor.active_exercises, useAmerican),
                      );
                    }
                  }}
                />
                Скопировать упражнения из набора, действующего на {formatDateRu(referenceDate)}
              </label>
              <label className="sm:col-span-2 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={showOnMainPanel}
                  onChange={(e) => setShowOnMainPanel(e.target.checked)}
                />
                <span>
                  <span className="font-medium text-slate-800">Показывать на главной панели тренировок</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Появится вкладкой на странице «Тренировки»; снять можно в «Настройки отображения».
                  </span>
                </span>
              </label>
            </div>
          ) : (
            setDetail && (
              <div className="text-sm text-slate-600 border-t pt-4 space-y-1">
                <p>
                  Период: {fmtSetPeriod(setDetail.effective_from, setDetail.effective_to)}
                  {isActiveSet && (
                    <span className="ml-2 text-emerald-700">· действует на {formatDateRu(referenceDate)}</span>
                  )}
                </p>
                <label className="block">
                  Название набора
                  <input
                    className="input-field mt-1 max-w-md"
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                  />
                </label>
              </div>
            )
          )}

          {detailLoading && !isNewMode && <Loader />}

          {(!detailLoading || isNewMode) && (
            <>
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium text-slate-700">
                  Состав набора ({composition.length})
                  <span className="font-normal text-slate-500 ml-1">· простой список и структура блоков</span>
                </p>
                <WorkoutBlocksEditor
                  blocks={templateBlocks}
                  catalogNames={catalogNames}
                  suggestionByExercise={new Map()}
                  useAmerican={useAmerican}
                  simpleVariant="list"
                  structureVariant="layout"
                  onReplaceBlocks={setTemplateBlocks}
                />
              </div>

              <div ref={catalogRef} className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium text-slate-700">Каталог упражнений</p>
                <CatalogPanel
                  composition={composition}
                  onAdd={addToComposition}
                  onRemoveFromSet={removeFromComposition}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {isNewMode ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saveNewMut.isPending}
                    onClick={() => saveNewMut.mutate()}
                  >
                    {saveNewMut.isPending ? "Сохранение…" : "Создать набор"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saveExistingMut.isPending || !editingSetId}
                    onClick={() => saveExistingMut.mutate()}
                  >
                    {saveExistingMut.isPending ? "Сохранение…" : "Сохранить набор"}
                  </button>
                )}
                {isCustomType ? (
                  <button
                    type="button"
                    className="btn-secondary text-red-700 border-red-200 hover:bg-red-50"
                    onClick={() => setDeleteTypeConfirm(true)}
                  >
                    Удалить тип тренировки
                  </button>
                ) : null}
              </div>
            </>
          )}
        </>
      )}

      {deleteSetConfirm ? (
        <ConfirmModal
          open
          title="Удалить набор?"
          message="Вы уверены, что собираетесь удалить? История тренировок сохранится. Если это последний набор типа, он перенесётся в архивные пресеты."
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          danger
          loading={deleteSetMut.isPending}
          onCancel={() => setDeleteSetConfirm(null)}
          onConfirm={() => deleteSetMut.mutate(deleteSetConfirm.id)}
        />
      ) : null}

      {deleteTypeConfirm ? (
        <ConfirmModal
          open
          title="Удалить тип тренировки?"
          message="Вы уверены, что собираетесь удалить? Все наборы упражнений будут удалены. История тренировок сохранится и перенесётся в архивные пресеты."
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          danger
          loading={deleteTypeMut.isPending}
          onCancel={() => setDeleteTypeConfirm(false)}
          onConfirm={() => deleteTypeMut.mutate()}
        />
      ) : null}
    </div>
  );
}

function CatalogPanel({
  composition,
  onAdd,
  onRemoveFromSet,
}: {
  composition: string[];
  onAdd: (name: string) => void;
  onRemoveFromSet: (name: string) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [editingExercise, setEditingExercise] = useState<ExerciseCatalogDetailItem | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteExercise, setDeleteExercise] = useState<ExerciseCatalogDetailItem | null>(null);

  const catalogQueryKey = ["strengthExerciseCatalog"];
  const { data: catalogItems, isLoading } = useQuery({
    queryKey: catalogQueryKey,
    queryFn: fetchExerciseCatalog,
  });

  const editMut = useMutation({
    mutationFn: () => updateStrengthExercise(editingExercise!.id, editName),
    onSuccess: () => {
      showToast("Упражнение обновлено", "success");
      void qc.invalidateQueries({ queryKey: catalogQueryKey });
      void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
      void qc.invalidateQueries({ queryKey: ["exercises"] });
      setEditingExercise(null);
      setEditName("");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteStrengthExercise(deleteExercise!.id),
    onSuccess: (res) => {
      showToast(res.action === "archived" ? "Упражнение скрыто из справочника" : "Упражнение удалено", "success");
      void qc.invalidateQueries({ queryKey: catalogQueryKey });
      void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
      void qc.invalidateQueries({ queryKey: ["exercises"] });
      setDeleteExercise(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const inSet = useMemo(() => new Set(composition), [composition]);

  const catalogNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of catalogItems ?? []) {
      const name = item.name.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [catalogItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = catalogItems ?? [];
    if (!q) return items;
    return items.filter((ex) => (ex.name || ex.display_name).toLowerCase().includes(q));
  }, [catalogItems, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="input-field flex-1 min-w-[12rem]"
          placeholder="Поиск в каталоге…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="input-field flex-1 min-w-[12rem]"
          placeholder="Новое упражнение"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onBlur={() => {
            const n = customName.trim();
            if (!n) return;
            if (catalogNames.some((c) => c.toLowerCase() === n.toLowerCase())) return;
            void addStrengthExercise(n)
              .then(() => {
                void qc.invalidateQueries({ queryKey: catalogQueryKey });
                void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
              })
              .catch(() => undefined);
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const n = customName.trim();
            if (!n) return;
            void addStrengthExercise(n)
              .then(() => {
                void qc.invalidateQueries({ queryKey: catalogQueryKey });
                void qc.invalidateQueries({ queryKey: queryKeys.strengthExercises });
                onAdd(n);
                setCustomName("");
              })
              .catch(() => {
                onAdd(n);
                setCustomName("");
              });
          }}
        >
          Добавить своё
        </button>
      </div>

      {isLoading && <Loader />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ultrawide:grid-cols-4 gap-2 max-h-[28rem] overflow-y-auto p-1 workouts-exercises-grid">
        {filtered.length === 0 && !isLoading && (
          <p className="text-sm text-[rgb(var(--app-text-muted))] col-span-full py-8 text-center">Ничего не найдено</p>
        )}
        {filtered.map((ex) => {
          const name = ex.name.trim();
          const displayName = name || ex.display_name || "Без названия";
          const added = Boolean(name && inSet.has(name));
          return (
            <div
              key={ex.id}
              className={`text-left rounded-xl border px-3 py-2.5 text-sm transition-all ${
                added
                  ? "border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-subtab-track)/0.4)]"
                  : "border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface))] hover:border-[rgb(var(--app-accent)/0.35)] hover:shadow-sm"
              }`}
            >
              <span className="font-medium line-clamp-2 text-[rgb(var(--app-text))]" title={displayName}>
                {displayName}
              </span>
              <span className="block text-xs mt-1 text-[rgb(var(--app-text-muted))]">
                {added ? "Уже в наборе" : "Можно добавить в цепочку"}
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {added ? (
                  <button
                    type="button"
                    className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                    onClick={() => onRemoveFromSet(name)}
                  >
                    Убрать из набора
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!name}
                    className="rounded-lg border border-[rgb(var(--app-border)/0.75)] px-2 py-1 text-xs font-medium text-[rgb(var(--app-text))] hover:bg-[rgb(var(--app-surface-subtle))] disabled:opacity-50"
                    onClick={() => onAdd(name)}
                  >
                    Добавить
                  </button>
                )}
                {ex.is_shared ? (
                  <span className="rounded-lg border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]">
                    Общий каталог
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-lg border border-[rgb(var(--app-border)/0.75)] px-2 py-1 text-xs font-medium text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
                      onClick={() => {
                        setEditingExercise(ex);
                        setEditName(name);
                      }}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      onClick={() => setDeleteExercise(ex)}
                    >
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingExercise && (
        <ModalShell
          open
          onClose={() => setEditingExercise(null)}
          title="Редактировать упражнение"
          description="Изменяется только запись справочника. История тренировок не переписывается."
          size="sm"
          zIndex={60}
          footer={
            <>
              <button type="button" className="px-4 py-2 rounded border text-sm" onClick={() => setEditingExercise(null)}>
                Отмена
              </button>
              <button
                type="button"
                disabled={editMut.isPending || !editName.trim() || editName.trim() === editingExercise.name.trim()}
                className="px-4 py-2 rounded bg-brand-600 text-white text-sm disabled:opacity-50"
                onClick={() => editMut.mutate()}
              >
                {editMut.isPending ? "Сохранение…" : "Сохранить"}
              </button>
            </>
          }
        >
          <label className="block text-sm">
            Новое название
            <input
              className="input-field mt-1 w-full"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </label>
        </ModalShell>
      )}
      {deleteExercise ? (
        <ConfirmModal
          open
          title="Удалить упражнение?"
          message="Вы уверены, что хотите удалить это упражнение из справочника? Это действие нельзя отменить."
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          danger
          loading={deleteMut.isPending}
          onCancel={() => setDeleteExercise(null)}
          onConfirm={() => deleteMut.mutate()}
        />
      ) : null}
    </div>
  );
}

function NewWorkoutTypeForm({ onCreated }: { onCreated: (name: string) => void }) {
  const { showToast } = useToast();
  const catalogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [composition, setComposition] = useState<string[]>([]);
  const [showOnMainPanel, setShowOnMainPanel] = useState(true);

  const createMut = useMutation({
    mutationFn: () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Укажите название типа тренировки");
      if (!composition.length) throw new Error("Добавьте хотя бы одно упражнение");
      return createWorkoutType({
        workout_type: trimmed,
        effective_from: date,
        exercises: composition,
        show_on_main_panel: showOnMainPanel,
      });
    },
    onSuccess: () => {
      const trimmed = name.trim();
      showToast("Тип тренировки создан", "success");
      setName("");
      setComposition([]);
      onCreated(trimmed);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <div className="card-panel space-y-4 border-brand-200">
      <h3 className="font-medium">Новый тип тренировки</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm block">
          Название
          <input className="input-field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm block">
          Действует с
          <input type="date" className="input-field mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Состав ({composition.length})</p>
        <CompositionChain
          exercises={composition}
          onRemove={(ex) => setComposition((p) => p.filter((x) => x !== ex))}
          onReorder={(from, to) => setComposition((p) => reorderItems(p, from, to))}
          onGoCatalog={() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div ref={catalogRef} className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Каталог упражнений</p>
        <CatalogPanel
          composition={composition}
          onAdd={(ex) => {
            const n = ex.trim();
            if (n && !composition.includes(n)) setComposition((p) => [...p, n]);
          }}
          onRemoveFromSet={(ex) => setComposition((p) => p.filter((x) => x !== ex))}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={showOnMainPanel}
          onChange={(e) => setShowOnMainPanel(e.target.checked)}
        />
        <span>
          <span className="font-medium text-slate-800">Показывать на главной панели тренировок</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            Создаст пресет во вкладках «Тренировки»; архивировать можно в «Настройки отображения».
          </span>
        </span>
      </label>

      <button
        type="button"
        className="btn-primary"
        disabled={createMut.isPending}
        onClick={() => createMut.mutate()}
      >
        Создать тип
      </button>
    </div>
  );
}
