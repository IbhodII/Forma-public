import { Pencil, Trash2 } from "lucide-react";
import type { StretchingExercise } from "../../../types";
import { ExerciseImage } from "../ExerciseImage";
import { exerciseDisplayName } from "../stretchingExerciseImages";

type Props = {
  exercise: StretchingExercise;
  onEdit: () => void;
  onDelete: () => void;
};

export function LibraryExerciseCard({ exercise, onEdit, onDelete }: Props) {
  const title = exerciseDisplayName(exercise);
  const desc =
    exercise.description_translated || exercise.description
      ? exercise.description || exercise.original_description
      : exercise.original_description;

  return (
    <article className="stretch-flow-card stretch-wellness__glass overflow-hidden flex flex-col">
      <button type="button" className="text-left flex-1" onClick={onEdit}>
        <div className="aspect-[4/3] w-full bg-teal-50/50 dark:bg-teal-950/30">
          <ExerciseImage
            imagesJson={exercise.images_json}
            alt={title}
            imgClassName="h-full w-full object-cover"
            placeholderClassName="flex h-full min-h-[8rem] items-center justify-center text-teal-400/50"
          />
        </div>
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-[hsl(var(--stretch-ink))] leading-snug">{title}</h3>
          {exercise.target_muscle_group && (
            <span className="inline-block text-xs rounded-full bg-teal-100/80 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 px-2.5 py-0.5">
              {exercise.target_muscle_group}
            </span>
          )}
          {!exercise.translated && exercise.original_name && (
            <span className="block text-xs text-amber-600/90 dark:text-amber-400/90">
              Требуется перевод
            </span>
          )}
          {desc && (
            <p className="text-sm text-[hsl(var(--stretch-muted))] line-clamp-2 leading-relaxed">
              {desc}
            </p>
          )}
        </div>
      </button>
      <div className="flex border-t border-white/25 dark:border-white/10 px-3 py-2 gap-2">
        <button
          type="button"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-[hsl(var(--stretch-ink))] hover:bg-white/40 transition-colors"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Изменить
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-red-600 hover:bg-red-50/80 dark:hover:bg-red-950/30 transition-colors"
          onClick={onDelete}
          aria-label={`Удалить ${title}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}
