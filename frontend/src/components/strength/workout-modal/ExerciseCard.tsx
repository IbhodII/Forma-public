import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import { formatWeightIncreaseHint } from "../../../api/strength";
import type { WorkoutApproach } from "../workoutApproaches";
import { ExerciseSetTable } from "./ExerciseSetTable";

export function ExerciseCard({
  exercise,
  indices,
  approaches,
  catalogNames,
  suggestion,
  canDrag,
  dragHandleProps,
  onUpdateAt,
  onDuplicateAt,
  onRemoveAt,
  onAddSet,
  onAddWarmupSet,
  onRemoveExercise,
  onRenameExercise,
}: {
  exercise: string;
  indices: number[];
  approaches: WorkoutApproach[];
  catalogNames: string[];
  suggestion?: StrengthNextWorkoutSuggestion;
  canDrag?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onUpdateAt: (globalIndex: number, patch: Partial<WorkoutApproach>) => void;
  onDuplicateAt: (globalIndex: number) => void;
  onRemoveAt: (globalIndex: number) => void;
  onAddSet: () => void;
  onAddWarmupSet: () => void;
  onRemoveExercise: () => void;
  onRenameExercise: (name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listId = `exercise-card-${indices[0] ?? "new"}`;
  const lastHint = indices.map((i) => approaches[i]?.lastHint).find(Boolean);

  return (
    <article
      className="strength-exercise-card rounded-2xl border shadow-[var(--app-shadow-sm)] overflow-hidden transition-shadow hover:shadow-[var(--app-shadow-md)] border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))]"
    >
      <header className="flex items-start gap-2 border-b border-[rgb(var(--app-border)/0.5)] bg-gradient-to-b from-[rgb(var(--app-surface-subtle)/0.5)] to-transparent px-3 sm:px-4 py-3">
        <div
          {...dragHandleProps}
          className={
            canDrag
              ? "flex flex-col items-center pt-0.5 shrink-0 select-none cursor-grab active:cursor-grabbing text-[rgb(var(--app-text-muted))]"
              : "flex flex-col items-center pt-0.5 shrink-0 select-none text-[rgb(var(--app-border))] pointer-events-none"
          }
          title={canDrag ? "Перетащить упражнение" : undefined}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <input
            type="text"
            list={listId}
            value={exercise}
            onChange={(e) => onRenameExercise(e.target.value)}
            placeholder="Название упражнения"
            className="w-full text-base font-semibold tracking-tight bg-transparent border-0 border-b border-transparent focus:border-[rgb(var(--app-accent)/0.4)] focus:outline-none focus:ring-0 pb-0.5 text-[rgb(var(--app-text))]"
          />
          <datalist id={listId}>
            {catalogNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {lastHint ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))] leading-snug">{lastHint}</p>
          ) : null}
          {suggestion?.should_increase && suggestion.suggested_increment != null ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {formatWeightIncreaseHint(suggestion)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0 relative">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
            aria-label={collapsed ? "Развернуть" : "Свернуть"}
          >
            {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
            aria-label="Действия"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Закрыть меню"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[10rem] rounded-xl border border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))] py-1 shadow-lg text-sm">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[rgb(var(--app-surface-subtle))]"
                  onClick={() => {
                    onAddSet();
                    setMenuOpen(false);
                  }}
                >
                  Добавить подход
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  onClick={() => {
                    onRemoveExercise();
                    setMenuOpen(false);
                  }}
                >
                  Удалить упражнение
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {!collapsed ? (
        <div className="p-2.5 sm:p-3">
          <ExerciseSetTable
            indices={indices}
            approaches={approaches}
            suggestion={suggestion}
            onUpdateAt={onUpdateAt}
            onDuplicateAt={onDuplicateAt}
            onRemoveAt={onRemoveAt}
            onAddWorkingSet={onAddSet}
            onAddWarmupSet={onAddWarmupSet}
          />
        </div>
      ) : (
        <p className="px-4 py-2 text-xs text-[rgb(var(--app-text-muted))]">
          {indices.length} подход{indices.length === 1 ? "" : indices.length < 5 ? "а" : "ов"}
        </p>
      )}
    </article>
  );
}
