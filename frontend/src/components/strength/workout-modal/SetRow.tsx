import { Copy, Trash2 } from "lucide-react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import { formatWeightIncreaseHint } from "../../../api/strength";
import { BarbellWeightInput } from "../../BarbellWeightInput";
import type { WorkoutApproach } from "../workoutApproaches";
import { isPlankExercise } from "../../../utils/strengthExercise";
import { cn } from "../../../lib/utils";

export function SetRow({
  row,
  setNumber,
  listId,
  catalogNames,
  weightSuggestion,
  showExerciseName = false,
  sequenceLabel,
  compact = false,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: WorkoutApproach;
  setNumber: number;
  listId: string;
  catalogNames: string[];
  weightSuggestion?: StrengthNextWorkoutSuggestion;
  showExerciseName?: boolean;
  sequenceLabel?: string;
  compact?: boolean;
  onChange: (patch: Partial<WorkoutApproach>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const isTimeBased = row.is_bodyweight || isPlankExercise(row.exercise);

  const handleExerciseChange = (exercise: string) => {
    const isBw = isPlankExercise(exercise);
    onChange({
      exercise,
      is_bodyweight: isBw,
      ...(isBw
        ? { reps: "1", duration_sec: row.duration_sec || "30" }
        : { duration_sec: "" }),
    });
  };

  return (
    <div
      className={cn(
        "strength-set-row rounded-xl border transition-colors",
        setNumber % 2 === 0
          ? "bg-[rgb(var(--app-surface-subtle)/0.35)] border-[rgb(var(--app-border)/0.5)]"
          : "bg-[rgb(var(--app-surface))] border-[rgb(var(--app-border)/0.65)]",
        compact ? "p-2.5" : "p-3",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-lg bg-[rgb(var(--app-accent)/0.12)] px-1.5 text-xs font-semibold tabular-nums text-[rgb(var(--app-accent))]">
          {sequenceLabel ?? setNumber}
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={row.is_warmup}
            onChange={(e) => onChange({ is_warmup: e.target.checked })}
            className="h-4 w-4 rounded border-[rgb(var(--app-border))] text-emerald-600 focus:ring-emerald-500/40"
          />
          Разминка
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            title="Дублировать подход"
            aria-label="Дублировать подход"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
            title="Удалить подход"
            aria-label="Удалить подход"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showExerciseName ? (
        <div className="mb-2">
          <input
            type="text"
            list={listId}
            value={row.exercise}
            onChange={(e) => handleExerciseChange(e.target.value)}
            placeholder="Упражнение"
            className="input-field text-sm w-full"
          />
          <datalist id={listId}>
            {catalogNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      ) : null}

      {isTimeBased ? (
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-[rgb(var(--app-text-muted))]">
            Время (сек)
            <input
              type="number"
              min={1}
              value={row.duration_sec}
              onChange={(e) => onChange({ duration_sec: e.target.value })}
              className="input-field mt-1 text-sm w-full"
              placeholder="30"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs text-[rgb(var(--app-text-muted))]">
            Вес
            <div className="mt-1 flex items-center gap-1">
              <BarbellWeightInput
                weight={row.weight}
                weightUnit={row.weightUnit}
                onChange={(weight, weightUnit) => onChange({ weight, weightUnit })}
                className="input-field text-sm w-full"
              />
              {weightSuggestion?.should_increase ? (
                <span className="text-emerald-600 text-sm shrink-0" aria-hidden title="Рекомендуется увеличить">
                  ↗
                </span>
              ) : null}
            </div>
          </label>
          <label className="text-xs text-[rgb(var(--app-text-muted))]">
            Повторения
            <input
              type="number"
              min={1}
              value={row.reps}
              onChange={(e) => onChange({ reps: e.target.value })}
              className="input-field mt-1 text-sm w-full tabular-nums"
            />
          </label>
        </div>
      )}

      {weightSuggestion?.should_increase && weightSuggestion.suggested_increment != null ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 leading-snug">
          {formatWeightIncreaseHint(weightSuggestion)}
        </p>
      ) : null}
    </div>
  );
}
