import { ModalShell } from "../../components/ui/modal";
import type { StretchingPresetExercise } from "../../types";
import { ExerciseImage } from "./ExerciseImage";
import { exerciseDescriptionText } from "./stretchingExerciseImages";

export function StretchingExerciseDescriptionModal({
  exercise,
  onContinue,
  onFinishWorkout,
  onClose,
}: {
  exercise: StretchingPresetExercise;
  onContinue: () => void;
  onFinishWorkout: () => void;
  onClose: () => void;
}) {
  const title = exercise.exercise_name?.trim() || "Упражнение";

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Описание упражнения"
      size="lg"
      zIndex={65}
      footer={
        <>
          <button type="button" className="btn-secondary text-sm" onClick={onContinue}>
            Продолжить тренировку
          </button>
          <button
            type="button"
            className="btn-primary text-sm bg-green-600 hover:bg-green-700"
            onClick={onFinishWorkout}
          >
            Завершить тренировку
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {exercise.target_muscle_group && (
          <p className="text-sm text-slate-500">{exercise.target_muscle_group}</p>
        )}
        <ExerciseImage
          imagesJson={exercise.images_json}
          alt={title}
          imgClassName="max-h-56 w-full rounded-lg object-contain bg-slate-100 dark:bg-slate-800"
        />
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {exerciseDescriptionText(exercise)}
        </p>
        {exercise.notes?.trim() && (
          <p className="text-sm text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-3 whitespace-pre-wrap">
            Заметка: {exercise.notes}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
