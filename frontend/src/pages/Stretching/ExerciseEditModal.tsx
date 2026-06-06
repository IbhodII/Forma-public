import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { updateStretchingExercise } from "../../api/stretching";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import type { StretchingExercise } from "../../types";
import { parseApiError } from "../../utils/validation";
import { ExerciseImagesField } from "./ExerciseImagesField";
import { exerciseDisplayName } from "./stretchingExerciseImages";
import { ExerciseImage } from "./ExerciseImage";

function initialRussianName(ex: StretchingExercise): string {
  if (ex.translated) return ex.name;
  if (ex.original_name && ex.name !== ex.original_name) return ex.name;
  return "";
}

function initialRussianDescription(ex: StretchingExercise): string {
  if (ex.description_translated && ex.description) return ex.description;
  if (
    ex.original_description &&
    ex.description &&
    ex.description !== ex.original_description
  ) {
    return ex.description;
  }
  return "";
}

export function ExerciseEditModal({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: StretchingExercise;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(() => initialRussianName(exercise));
  const [muscle, setMuscle] = useState(exercise.target_muscle_group ?? "");
  const [description, setDescription] = useState(() => initialRussianDescription(exercise));
  const [images, setImages] = useState<string[]>(() => [...(exercise.images_json ?? [])]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        target_muscle_group: muscle.trim() || null,
        description: description.trim() || null,
        images,
      };
      if (!body.name) throw new Error("Укажите название на русском");
      return updateStretchingExercise(exercise.id, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast("Перевод сохранён", "success");
      onSaved();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <ModalShell
      open
      onClose={onClose}
      dataEntry
      title={exerciseDisplayName(exercise)}
      size="lg"
      zIndex={50}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
      >
        <ExerciseImage imagesJson={images} alt={exerciseDisplayName(exercise)} />

        <ExerciseImagesField images={images} onChange={setImages} disabled={saveMut.isPending} />

        <div className="rounded-lg border border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface-subtle))] p-3 space-y-2 text-sm">
          <p>
            <span className="text-[rgb(var(--app-text-muted))]">Оригинал: </span>
            <span className="font-medium">{exercise.original_name || "—"}</span>
          </p>
          {exercise.original_description && (
            <p className="text-[rgb(var(--app-text-muted))] whitespace-pre-wrap">
              {exercise.original_description}
            </p>
          )}
        </div>

        <label className="block text-sm">
          Название (рус.)
          <input
            className="input-field mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Перевод названия"
            required
          />
        </label>
        <label className="block text-sm">
          Группа мышц (рус.)
          <input
            className="input-field mt-1 w-full"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            placeholder="Например: Квадрицепс"
          />
        </label>
        <label className="block text-sm">
          Описание (рус.)
          <textarea
            className="input-field mt-1 w-full min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Перевод описания техники"
          />
        </label>

        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <button type="button" className="btn-secondary sm:w-auto" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="btn-primary sm:w-auto"
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
