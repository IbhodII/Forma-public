import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import type { WorkoutApproach } from "../workoutApproaches";
import { SetRow } from "./SetRow";
import { cn } from "../../../lib/utils";

export function CircuitRoundCard({
  roundNumber,
  indices,
  approaches,
  catalogNames,
  suggestionByExercise,
  canDrag,
  dragFrom,
  dropOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onUpdateAt,
  onDuplicateAt,
  onRemoveAt,
}: {
  roundNumber: number;
  indices: number[];
  approaches: WorkoutApproach[];
  catalogNames: string[];
  suggestionByExercise: Map<string, StrengthNextWorkoutSuggestion>;
  canDrag: boolean;
  dragFrom: number | null;
  dropOver: number | null;
  onDragStart: (globalIndex: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (globalIndex: number, e: React.DragEvent) => void;
  onDragLeave: (globalIndex: number) => void;
  onDrop: (globalIndex: number, e: React.DragEvent) => void;
  onUpdateAt: (globalIndex: number, patch: Partial<WorkoutApproach>) => void;
  onDuplicateAt: (globalIndex: number) => void;
  onRemoveAt: (globalIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isHighlighted = indices.some((i) => dropOver === i);

  return (
    <section
      className={cn(
        "rounded-2xl border overflow-hidden transition-all",
        "border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)]",
        isHighlighted && "ring-2 ring-[rgb(var(--app-accent)/0.35)]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-gradient-to-r from-[rgb(var(--app-accent)/0.08)] to-transparent border-b border-[rgb(var(--app-border)/0.45)]"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[rgb(var(--app-accent))] text-white text-sm font-bold tabular-nums shadow-sm">
          {roundNumber}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">Раунд {roundNumber}</p>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            {indices.length} шаг{indices.length === 1 ? "" : indices.length < 5 ? "а" : "ов"} в цикле
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-[rgb(var(--app-text-muted))] shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-[rgb(var(--app-text-muted))] shrink-0" />
        )}
      </button>

      {expanded ? (
        <div className="p-3 space-y-0">
          {indices.map((globalIdx, stepIdx) => {
            const row = approaches[globalIdx];
            if (!row) return null;
            const isLast = stepIdx === indices.length - 1;
            const dragging = dragFrom === globalIdx;
            const over = dropOver === globalIdx && dragFrom !== globalIdx;

            return (
              <div key={row.id} className="relative">
                {stepIdx > 0 ? (
                  <div className="flex justify-center py-1" aria-hidden>
                    <div className="w-px h-4 bg-[rgb(var(--app-border))]" />
                  </div>
                ) : null}
                <div
                  draggable={canDrag}
                  onDragStart={(e) => onDragStart(globalIdx, e)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onDragOver(globalIdx, e)}
                  onDragLeave={() => onDragLeave(globalIdx)}
                  onDrop={(e) => onDrop(globalIdx, e)}
                  className={cn(
                    "transition-opacity rounded-xl",
                    dragging && "opacity-40",
                    over && "ring-2 ring-[rgb(var(--app-accent)/0.3)]",
                  )}
                >
                  <SetRow
                    row={row}
                    setNumber={stepIdx + 1}
                    listId={`circuit-${row.id}`}
                    catalogNames={catalogNames}
                    weightSuggestion={suggestionByExercise.get(row.exercise)}
                    showExerciseName
                    sequenceLabel={`${stepIdx + 1}`}
                    compact
                    onChange={(patch) => onUpdateAt(globalIdx, patch)}
                    onDuplicate={() => onDuplicateAt(globalIdx)}
                    onRemove={() => onRemoveAt(globalIdx)}
                  />
                </div>
                {!isLast ? (
                  <div className="flex justify-center py-1 text-[rgb(var(--app-text-muted))]" aria-hidden>
                    <span className="text-lg leading-none">↓</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
