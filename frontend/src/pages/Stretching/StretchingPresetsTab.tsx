import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveStretchingPreset,
  createStretchingPreset,
  deleteStretchingPreset,
  fetchStretchingExercises,
  fetchStretchingPreset,
  fetchStretchingPresets,
  restoreStretchingPreset,
  updateStretchingPreset,
} from "../../api/stretching";
import { ErrorAlert } from "../../components/ErrorAlert";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Loader } from "../../components/Loader";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import type { StretchingPreset, StretchingPresetExercise } from "../../types";
import { parseApiError } from "../../utils/validation";
import { StretchFlowTimeline } from "./components/StretchFlowTimeline";
import { StretchProgramCard } from "./components/StretchProgramCard";
import { FloatingSessionCta } from "./components/FloatingSessionCta";
import { Plus } from "lucide-react";

interface ExerciseDraft {
  exercise_id: number;
  exercise_name: string;
  hold_seconds: number;
  reps: number;
  notes: string;
  exercise_order: number;
}

function PresetFormModal({
  preset,
  onClose,
  onSaved,
}: {
  preset?: StretchingPreset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: catalog = [] } = useQuery({
    queryKey: queryKeys.stretchingExercises(),
    queryFn: () => fetchStretchingExercises(),
  });

  const { data: fullPreset, isLoading: loadingDetail } = useQuery({
    queryKey: queryKeys.stretchingPresetDetail(preset?.id ?? 0),
    queryFn: () => fetchStretchingPreset(preset!.id),
    enabled: Boolean(preset?.id),
  });

  const source = fullPreset ?? preset;
  const [name, setName] = useState(source?.name ?? "");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [search, setSearch] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!source?.exercises?.length) {
      setExercises([]);
      return;
    }
    setName(source.name);
    setExercises(
      source.exercises.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name ?? "",
        hold_seconds: ex.hold_seconds ?? 30,
        reps: ex.reps ?? 1,
        notes: ex.notes ?? "",
        exercise_order: ex.exercise_order ?? i,
      })),
    );
  }, [source]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog.filter((e) => !q || e.name.toLowerCase().includes(q));
    return list.slice(0, 40);
  }, [catalog, search]);

  const moveExercise = (from: number, to: number) => {
    if (from === to || to < 0 || to >= exercises.length) return;
    setExercises((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((ex, i) => ({ ...ex, exercise_order: i }));
    });
  };

  const addExercise = (exerciseId: number, exerciseName: string) => {
    if (exercises.some((e) => e.exercise_id === exerciseId)) {
      showToast("Упражнение уже в пресете", "error");
      return;
    }
    setExercises((prev) => [
      ...prev,
      {
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        hold_seconds: 30,
        reps: 1,
        notes: "",
        exercise_order: prev.length,
      },
    ]);
    setSearch("");
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: StretchingPresetExercise[] = exercises.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        hold_seconds: ex.hold_seconds,
        reps: ex.reps,
        notes: ex.notes,
        exercise_order: i,
      }));
      if (!name.trim()) throw new Error("Укажите название пресета");
      if (!payload.length) throw new Error("Добавьте хотя бы одно упражнение");
      if (preset) {
        return updateStretchingPreset(preset.id, { name: name.trim(), exercises: payload });
      }
      return createStretchingPreset({ name: name.trim(), exercises: payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast(preset ? "Пресет обновлён" : "Пресет создан", "success");
      onSaved();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <ModalShell
      open
      onClose={onClose}
      title={preset ? "Редактировать пресет" : "Новый пресет"}
      size="lg"
      zIndex={50}
    >
        {loadingDetail && preset?.id ? (
          <Loader label="Загрузка…" />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate();
            }}
          >
            <label className="block text-sm">
              Название
              <input
                className="input-field mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Добавить упражнение из базы
              </p>
              <input
                className="input-field w-full text-sm mb-2"
                placeholder="Поиск…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-32 overflow-y-auto border rounded-lg divide-y text-sm">
                {filteredCatalog.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => addExercise(ex.id, ex.name)}
                  >
                    {ex.name}
                    {ex.target_muscle_group && (
                      <span className="text-slate-400 ml-2 text-xs">{ex.target_muscle_group}</span>
                    )}
                  </button>
                ))}
                {!filteredCatalog.length && (
                  <p className="px-3 py-2 text-slate-500">Ничего не найдено</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Упражнения в пресете (перетащите для сортировки)
              </p>
              {exercises.map((ex, idx) => (
                <div
                  key={`${ex.exercise_id}-${idx}`}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null) moveExercise(dragIdx, idx);
                    setDragIdx(null);
                  }}
                  className="border rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50 space-y-2 cursor-grab"
                >
                  <div className="flex gap-2 items-center">
                    <span className="text-slate-400 text-xs shrink-0">⋮⋮ {idx + 1}.</span>
                    <span className="font-medium text-sm flex-1">{ex.exercise_name}</span>
                    <button
                      type="button"
                      className="text-red-600 text-xs"
                      onClick={() =>
                        setExercises((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-500">
                      Удержание (сек)
                      <input
                        type="number"
                        min={5}
                        className="input-field mt-0.5 w-full text-sm"
                        value={ex.hold_seconds}
                        onChange={(e) => {
                          const n = [...exercises];
                          n[idx] = { ...ex, hold_seconds: Number(e.target.value) || 30 };
                          setExercises(n);
                        }}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Повторения
                      <input
                        type="number"
                        min={1}
                        className="input-field mt-0.5 w-full text-sm"
                        value={ex.reps}
                        onChange={(e) => {
                          const n = [...exercises];
                          n[idx] = { ...ex, reps: Number(e.target.value) || 1 };
                          setExercises(n);
                        }}
                      />
                    </label>
                  </div>
                  <input
                    className="input-field w-full text-sm"
                    placeholder="Заметки"
                    value={ex.notes}
                    onChange={(e) => {
                      const n = [...exercises];
                      n[idx] = { ...ex, notes: e.target.value };
                      setExercises(n);
                    }}
                  />
                </div>
              ))}
              {!exercises.length && (
                <p className="text-sm text-slate-500">Добавьте упражнения из базы выше</p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </form>
        )}
    </ModalShell>
  );
}

export function StretchingPresetsTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editPreset, setEditPreset] = useState<StretchingPreset | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "archive" | "restore" | "delete";
    preset: StretchingPreset;
  } | null>(null);

  const { data: presets, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.stretchingPresets(),
    queryFn: () => fetchStretchingPresets(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["stretching"] });

  const archiveMut = useMutation({
    mutationFn: archiveStretchingPreset,
    onSuccess: () => {
      invalidate();
      showToast("Пресет архивирован", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const restoreMut = useMutation({
    mutationFn: restoreStretchingPreset,
    onSuccess: () => {
      invalidate();
      showToast("Пресет восстановлен", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteStretchingPreset,
    onSuccess: () => {
      invalidate();
      showToast("Пресет удалён", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  if (isLoading) return <Loader label="Пресеты…" />;  if (isError) return <ErrorAlert message={parseApiError(error)} />;

  const active = presets?.filter((p) => p.is_active === 1) ?? [];
  const archived = presets?.filter((p) => p.is_active === 0) ?? [];
  const selected =
    active.find((p) => p.id === selectedId) ?? active[0] ?? null;

  const detailQuery = useQuery({
    queryKey: queryKeys.stretchingPresetDetail(selected?.id ?? 0),
    queryFn: () => fetchStretchingPreset(selected!.id),
    enabled: Boolean(selected?.id),
  });

  const flowExercises = detailQuery.data?.exercises ?? [];

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--stretch-ink))]">Ваши программы</h2>
          <p className="text-sm text-[hsl(var(--stretch-muted))] mt-1">
            Соберите последовательность поз и практикуйте в своём темпе.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 text-sm font-semibold shadow-md transition-colors"
          onClick={() => {
            setEditPreset(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Новая программа
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {active.map((p) => (
          <StretchProgramCard
            key={p.id}
            preset={p}
            selected={selected?.id === p.id}
            onSelect={() => setSelectedId(p.id)}
            onStart={() => navigate(`/stretching/session/${p.id}`)}
            onEdit={() => {
              setEditPreset(p);
              setShowForm(true);
            }}
            onArchive={() => setConfirm({ type: "archive", preset: p })}
            onDelete={
              p.log_count === 0 ? () => setConfirm({ type: "delete", preset: p }) : undefined
            }
          />
        ))}
        {!active.length && (
          <p className="text-sm text-[hsl(var(--stretch-muted))] col-span-full text-center py-12">
            Создайте первую программу мобильности
          </p>
        )}
      </div>

      {selected && (
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-[hsl(var(--stretch-ink))]">
            Поток «{selected.name}»
          </h3>
          {detailQuery.isLoading ? (
            <Loader label="Загрузка потока…" />
          ) : (
            <StretchFlowTimeline exercises={flowExercises} />
          )}
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-white/20">
          <h3 className="text-sm font-medium text-[hsl(var(--stretch-muted))]">Архив</h3>
          <div className="grid gap-3">
            {archived.map((p) => (
              <StretchProgramCard
                key={p.id}
                preset={p}
                archived
                onSelect={() => {}}
                onStart={() => {}}
                onEdit={() => {
                  setEditPreset(p);
                  setShowForm(true);
                }}
                onRestore={() => setConfirm({ type: "restore", preset: p })}
                onDelete={
                  p.log_count === 0 ? () => setConfirm({ type: "delete", preset: p }) : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      <FloatingSessionCta
        visible={Boolean(selected)}
        label="Начать сессию"
        sublabel={selected?.name}
        onStart={() => selected && navigate(`/stretching/session/${selected.id}`)}
      />

      {showForm && (
        <PresetFormModal
          preset={editPreset ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditPreset(null);
          }}
          onSaved={invalidate}
        />
      )}

      {confirm && (
        <ConfirmModal
          open={Boolean(confirm)}
          title={
            confirm.type === "delete"
              ? "Удалить пресет?"
              : confirm.type === "archive"
                ? "Архивировать пресет?"
                : "Восстановить пресет?"
          }
          message={
            confirm.type === "delete"
              ? `Пресет «${confirm.preset.name}» будет удалён без возможности восстановления.`
              : confirm.type === "archive"
                ? `Пресет «${confirm.preset.name}» скроется из списка выбора, история сохранится.`
                : `Пресет «${confirm.preset.name}» снова появится в активных.`
          }
          confirmLabel={
            confirm.type === "delete" ? "Удалить" : confirm.type === "archive" ? "Архивировать" : "Восстановить"
          }
          danger={confirm.type === "delete"}
          loading={archiveMut.isPending || restoreMut.isPending || deleteMut.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.type === "archive") archiveMut.mutate(confirm.preset.id);
            else if (confirm.type === "restore") restoreMut.mutate(confirm.preset.id);
            else deleteMut.mutate(confirm.preset.id);
          }}
        />
      )}
    </div>
  );
}

