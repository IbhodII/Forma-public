import { useMemo, useState } from "react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import {
  cloneWorkoutApproach,
  newWorkoutApproach,
  type WorkoutApproach,
} from "../workoutApproaches";
import { ExerciseCard } from "./ExerciseCard";
import {
  flattenExerciseGroups,
  groupApproachesByExercise,
  moveExerciseGroup,
} from "./groupApproaches";
import { WorkoutTimeline } from "./WorkoutTimeline";

export function WorkoutEditor({
  approaches,
  circuitWorkout,
  catalogNames,
  suggestionByExercise,
  useAmerican,
  onUpdateApproach,
  onRemoveApproach,
  onMoveApproach,
  onReplaceApproaches,
}: {
  approaches: WorkoutApproach[];
  circuitWorkout: boolean;
  catalogNames: string[];
  suggestionByExercise: Map<string, StrengthNextWorkoutSuggestion>;
  useAmerican: boolean;
  onUpdateApproach: (index: number, patch: Partial<WorkoutApproach>) => void;
  onRemoveApproach: (index: number) => void;
  onMoveApproach: (from: number, to: number) => void;
  onReplaceApproaches: (next: WorkoutApproach[]) => void;
}) {
  const [dragGroupFrom, setDragGroupFrom] = useState<number | null>(null);
  const [dropGroupOver, setDropGroupOver] = useState<number | null>(null);

  const exerciseGroups = useMemo(() => groupApproachesByExercise(approaches), [approaches]);

  const duplicateAt = (index: number) => {
    const copy = cloneWorkoutApproach(approaches[index]);
    const next = [...approaches];
    next.splice(index + 1, 0, copy);
    onReplaceApproaches(next);
  };

  if (circuitWorkout) {
    return (
      <WorkoutTimeline
        approaches={approaches}
        catalogNames={catalogNames}
        suggestionByExercise={suggestionByExercise}
        onUpdateApproach={onUpdateApproach}
        onRemoveApproach={onRemoveApproach}
        onMoveApproach={onMoveApproach}
        onDuplicateApproach={duplicateAt}
      />
    );
  }

  const handleGroupDrop = (toGroupIndex: number) => {
    if (dragGroupFrom == null || dragGroupFrom === toGroupIndex) {
      setDragGroupFrom(null);
      setDropGroupOver(null);
      return;
    }
    const reordered = moveExerciseGroup(exerciseGroups, dragGroupFrom, toGroupIndex);
    onReplaceApproaches(flattenExerciseGroups(reordered, approaches));
    setDragGroupFrom(null);
    setDropGroupOver(null);
  };

  return (
    <div className="space-y-4">
      {exerciseGroups.map((group, groupIndex) => {
        const suggestion = group.exercise.trim()
          ? suggestionByExercise.get(group.exercise)
          : undefined;

        return (
          <div
            key={group.key}
            onDragOver={(e) => {
              if (dragGroupFrom == null) return;
              e.preventDefault();
              setDropGroupOver(groupIndex);
            }}
            onDragLeave={() => {
              if (dropGroupOver === groupIndex) setDropGroupOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleGroupDrop(groupIndex);
            }}
            className={
              dropGroupOver === groupIndex && dragGroupFrom !== groupIndex
                ? "ring-2 ring-[rgb(var(--app-accent)/0.35)] rounded-2xl"
                : ""
            }
          >
            <ExerciseCard
              exercise={group.exercise}
              indices={group.indices}
              approaches={approaches}
              catalogNames={catalogNames}
              suggestion={suggestion}
              canDrag
              dragHandleProps={{
                draggable: true,
                onDragStart: (e) => {
                  setDragGroupFrom(groupIndex);
                  e.dataTransfer.effectAllowed = "move";
                },
                onDragEnd: () => {
                  setDragGroupFrom(null);
                  setDropGroupOver(null);
                },
              }}
              onUpdateAt={onUpdateApproach}
              onDuplicateAt={duplicateAt}
              onRemoveAt={onRemoveApproach}
              onAddSet={() => {
                const lastIdx = group.indices[group.indices.length - 1];
                const last = approaches[lastIdx];
                const row = last
                  ? cloneWorkoutApproach(last)
                  : newWorkoutApproach(useAmerican, { exercise: group.exercise });
                row.is_warmup = false;
                const next = [...approaches];
                next.splice(lastIdx + 1, 0, row);
                onReplaceApproaches(next);
              }}
              onAddWarmupSet={() => {
                const lastIdx = group.indices[group.indices.length - 1];
                const last = approaches[lastIdx];
                const row = last
                  ? cloneWorkoutApproach(last)
                  : newWorkoutApproach(useAmerican, { exercise: group.exercise, is_warmup: true });
                row.is_warmup = true;
                const next = [...approaches];
                next.splice(lastIdx + 1, 0, row);
                onReplaceApproaches(next);
              }}
              onRemoveExercise={() => {
                const toRemove = new Set(group.indices);
                onReplaceApproaches(approaches.filter((_, i) => !toRemove.has(i)));
              }}
              onRenameExercise={(name) => {
                group.indices.forEach((i) => onUpdateApproach(i, { exercise: name }));
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
