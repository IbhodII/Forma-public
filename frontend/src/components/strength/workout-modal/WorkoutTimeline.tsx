import { useCallback, useEffect, useState } from "react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import type { WorkoutApproach } from "../workoutApproaches";
import { groupApproachesIntoRounds } from "./groupApproaches";
import { CircuitRoundCard } from "./CircuitRoundCard";

export function WorkoutTimeline({
  approaches,
  catalogNames,
  suggestionByExercise,
  onUpdateApproach,
  onRemoveApproach,
  onMoveApproach,
  onDuplicateApproach,
}: {
  approaches: WorkoutApproach[];
  catalogNames: string[];
  suggestionByExercise: Map<string, StrengthNextWorkoutSuggestion>;
  onUpdateApproach: (index: number, patch: Partial<WorkoutApproach>) => void;
  onRemoveApproach: (index: number) => void;
  onMoveApproach: (from: number, to: number) => void;
  onDuplicateApproach: (index: number) => void;
}) {
  const [altHeld, setAltHeld] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);

  const rounds = groupApproachesIntoRounds(approaches);
  const canDrag = altHeld;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        e.preventDefault();
        setAltHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const finishDrag = useCallback(() => {
    setDragFrom(null);
    setDropOver(null);
  }, []);

  const handleDrop = (toIndex: number) => {
    if (dragFrom != null && dragFrom !== toIndex) {
      onMoveApproach(dragFrom, toIndex);
    }
    finishDrag();
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${
          altHeld
            ? "border-[rgb(var(--app-accent)/0.4)] bg-[rgb(var(--app-accent)/0.08)] text-[rgb(var(--app-accent))] font-medium"
            : "border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface-subtle)/0.4)] text-[rgb(var(--app-text-muted))]"
        }`}
      >
        {altHeld
          ? "Перетащите шаг в нужное место в таймлайне"
          : "Круговая тренировка: шаги сгруппированы по раундам. Удерживайте Alt для изменения порядка."}
      </div>

      <div className="space-y-4">
        {rounds.map((round, ri) => (
          <div key={`round-${round.roundNumber}-${ri}`} className="relative">
            {ri > 0 ? (
              <div className="flex justify-center -mt-2 mb-2" aria-hidden>
                <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
                  следующий раунд
                </span>
              </div>
            ) : null}
            <CircuitRoundCard
              roundNumber={round.roundNumber}
              indices={round.indices}
              approaches={approaches}
              catalogNames={catalogNames}
              suggestionByExercise={suggestionByExercise}
              canDrag={canDrag}
              dragFrom={dragFrom}
              dropOver={dropOver}
              onDragStart={(globalIdx, e) => {
                if (!canDrag) {
                  e.preventDefault();
                  return;
                }
                setDragFrom(globalIdx);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={finishDrag}
              onDragOver={(globalIdx, e) => {
                if (!canDrag || dragFrom == null) return;
                e.preventDefault();
                setDropOver(globalIdx);
              }}
              onDragLeave={(globalIdx) => {
                if (dropOver === globalIdx) setDropOver(null);
              }}
              onDrop={(globalIdx, e) => {
                e.preventDefault();
                if (canDrag) handleDrop(globalIdx);
              }}
              onUpdateAt={onUpdateApproach}
              onDuplicateAt={onDuplicateApproach}
              onRemoveAt={onRemoveApproach}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
