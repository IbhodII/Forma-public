import { Copy, Trash2 } from "lucide-react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import { BarbellWeightInput } from "../../BarbellWeightInput";
import type { WorkoutApproach } from "../workoutApproaches";

export function SetTableRow({
  row,
  label,
  weightSuggestion,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: WorkoutApproach;
  label: string;
  weightSuggestion?: StrengthNextWorkoutSuggestion;
  onChange: (patch: Partial<WorkoutApproach>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <tr className="strength-set-table-row border-b border-[rgb(var(--app-border)/0.4)] last:border-0">
      <td className="py-1.5 pr-2 w-10 tabular-nums text-xs font-semibold text-[rgb(var(--app-text-muted))] align-middle">
        {label}
      </td>
      <td className="py-1.5 pr-2 align-middle min-w-[6rem]">
        {row.is_bodyweight ? (
          <input
            type="number"
            min={1}
            className="input-field text-sm w-full py-1"
            placeholder="сек"
            value={row.duration_sec}
            onChange={(e) => onChange({ duration_sec: e.target.value })}
          />
        ) : (
          <div className="flex items-center gap-1">
            <BarbellWeightInput
              weight={row.weight}
              weightUnit={row.weightUnit}
              onChange={(weight, weightUnit) => onChange({ weight, weightUnit })}
              className="input-field text-sm w-full py-1"
            />
            {weightSuggestion?.should_increase ? (
              <span className="text-emerald-600 text-xs shrink-0" title="Рекомендуется увеличить">
                ↗
              </span>
            ) : null}
          </div>
        )}
      </td>
      <td className="py-1.5 pr-2 w-20 align-middle">
        {!row.is_bodyweight ? (
          <input
            type="number"
            min={1}
            className="input-field text-sm w-full py-1 tabular-nums"
            placeholder="повт"
            value={row.reps}
            onChange={(e) => onChange({ reps: e.target.value })}
          />
        ) : (
          <span className="text-xs text-[rgb(var(--app-text-muted))]">—</span>
        )}
      </td>
      <td className="py-1.5 w-14 align-middle text-right">
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={onDuplicate}
            className="p-1 rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
            aria-label="Дублировать"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
            aria-label="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
