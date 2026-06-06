import { Plus } from "lucide-react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import type { WorkoutApproach } from "../workoutApproaches";
import { SetTableRow } from "./SetTableRow";
import { cn } from "../../../lib/utils";

export function ExerciseSetTable({
  indices,
  approaches,
  suggestion,
  onUpdateAt,
  onDuplicateAt,
  onRemoveAt,
  onAddWorkingSet,
  onAddWarmupSet,
}: {
  indices: number[];
  approaches: WorkoutApproach[];
  suggestion?: StrengthNextWorkoutSuggestion;
  onUpdateAt: (globalIndex: number, patch: Partial<WorkoutApproach>) => void;
  onDuplicateAt: (globalIndex: number) => void;
  onRemoveAt: (globalIndex: number) => void;
  onAddWorkingSet: () => void;
  onAddWarmupSet: () => void;
}) {
  const workingIndices = indices.filter((i) => !approaches[i]?.is_warmup);
  const warmupIndices = indices.filter((i) => approaches[i]?.is_warmup);

  const renderTable = (sectionIndices: number[], labelFn: (idx: number) => string) => {
    if (sectionIndices.length === 0) return null;
    return (
      <table className="w-full min-w-[14rem] border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            <th className="py-1 text-left font-medium w-10">#</th>
            <th className="py-1 text-left font-medium">Вес</th>
            <th className="py-1 text-left font-medium w-20">Повт</th>
            <th className="py-1 w-14" />
          </tr>
        </thead>
        <tbody>
          {sectionIndices.map((globalIdx, setIdx) => {
            const row = approaches[globalIdx];
            if (!row) return null;
            return (
              <SetTableRow
                key={row.id}
                row={row}
                label={labelFn(setIdx)}
                weightSuggestion={suggestion}
                onChange={(patch) => onUpdateAt(globalIdx, patch)}
                onDuplicate={() => onDuplicateAt(globalIdx)}
                onRemove={() => onRemoveAt(globalIdx)}
              />
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-2.5">
      <div
        className={cn(
          "space-y-1 rounded-lg border border-amber-400/25 bg-amber-500/5 px-2 py-2",
          warmupIndices.length === 0 && "opacity-90",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700/90 dark:text-amber-400/90">
          Разминка
        </p>
        {warmupIndices.length > 0 ? (
          <div className="overflow-x-auto -mx-0.5 px-0.5">
            {renderTable(warmupIndices, (i) => `W${i + 1}`)}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onAddWarmupSet}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-400/40 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Разминка
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))]">
          Рабочие подходы
        </p>
        {workingIndices.length > 0 ? (
          <div className="overflow-x-auto -mx-0.5 px-0.5">{renderTable(workingIndices, (i) => String(i + 1))}</div>
        ) : (
          <p className="text-xs text-[rgb(var(--app-text-muted))] py-1">Нет рабочих подходов</p>
        )}
        <button
          type="button"
          onClick={onAddWorkingSet}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[rgb(var(--app-border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--app-accent))] hover:bg-[rgb(var(--app-accent)/0.06)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Подход
        </button>
      </div>
    </div>
  );
}
