import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  createStretchingExercise,
  deleteStretchingExercise,
  fetchStretchingExercises,
} from "../../api/stretching";
import { ErrorAlert } from "../../components/ErrorAlert";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Loader } from "../../components/Loader";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import type { StretchingExercise } from "../../types";
import { parseApiError } from "../../utils/validation";
import { LibraryExerciseCard } from "./components/LibraryExerciseCard";
import { ExerciseEditModal } from "./ExerciseEditModal";
import { ExerciseImagesField } from "./ExerciseImagesField";
import { exerciseDisplayName } from "./stretchingExerciseImages";
import { Plus, Search } from "lucide-react";

function ExerciseCreateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        target_muscle_group: muscle.trim() || null,
        description: description.trim() || null,
        images,
      };
      if (!body.name) throw new Error("Укажите название");
      return createStretchingExercise(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast("Упражнение добавлено", "success");
      onSaved();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <ModalShell open onClose={onClose} dataEntry title="Новое упражнение" size="md" zIndex={50}>
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
        <label className="block text-sm">
          Группа мышц
          <input
            className="input-field mt-1 w-full"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            placeholder="Например: Квадрицепс"
          />
        </label>
        <label className="block text-sm">
          Описание техники
          <textarea
            className="input-field mt-1 w-full min-h-[96px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <ExerciseImagesField images={images} onChange={setImages} disabled={saveMut.isPending} />
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
            {saveMut.isPending ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function StretchingExercisesTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [editExercise, setEditExercise] = useState<StretchingExercise | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StretchingExercise | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.stretchingExercises(filter || undefined),
    queryFn: () => fetchStretchingExercises(filter || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: deleteStretchingExercise,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast("Упражнение удалено", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const muscleGroups = useMemo(() => {
    const set = new Set<string>();
    for (const ex of data ?? []) {
      if (ex.target_muscle_group) set.add(ex.target_muscle_group);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [data]);

  if (isLoading) return <Loader label="Упражнения…" />;
  if (isError) return <ErrorAlert message={parseApiError(error)} />;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="space-y-2 flex-1 min-w-0 sm:min-w-[12rem]">
          <h2 className="text-lg font-semibold text-[hsl(var(--stretch-ink))]">Библиотека поз</h2>
          <p className="text-sm text-[hsl(var(--stretch-muted))]">
            {data?.length ?? 0} упражнений для ваших программ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 text-sm font-semibold"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[12rem] max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--stretch-muted))]"
            aria-hidden
          />
          <input
            className="w-full rounded-2xl border-0 stretch-wellness__glass pl-10 pr-4 py-3 text-sm text-[hsl(var(--stretch-ink))] placeholder:text-[hsl(var(--stretch-muted))] focus:outline-none focus:ring-2 focus:ring-teal-400/40"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по названию или группе…"
            aria-label="Поиск упражнений"
          />
        </div>
        {muscleGroups.length > 0 && (
          <select
            className="rounded-2xl stretch-wellness__glass px-4 py-3 text-sm text-[hsl(var(--stretch-ink))] border-0 focus:ring-2 focus:ring-teal-400/40"
            value={muscleGroups.includes(filter) ? filter : ""}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Фильтр по группе мышц"
          >
            <option value="">Все группы</option>
            {muscleGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="stretch-library-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((ex) => (
          <LibraryExerciseCard
            key={ex.id}
            exercise={ex}
            onEdit={() => setEditExercise(ex)}
            onDelete={() => setDeleteConfirm(ex)}
          />
        ))}
      </div>

      {!data?.length && (
        <p className="text-center text-sm text-[hsl(var(--stretch-muted))] py-16">
          Упражнения не найдены
        </p>
      )}

      {editExercise && (
        <ExerciseEditModal
          exercise={editExercise}
          onClose={() => setEditExercise(null)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["stretching"] })}
        />
      )}

      {showCreate && (
        <ExerciseCreateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["stretching"] })}
        />
      )}

      <ConfirmModal
        open={Boolean(deleteConfirm)}
        title="Удалить упражнение?"
        message={deleteConfirm ? `Удалить «${exerciseDisplayName(deleteConfirm)}»?` : ""}
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
        onConfirm={() => {
          const ex = deleteConfirm;
          setDeleteConfirm(null);
          if (ex) deleteMut.mutate(ex.id);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
