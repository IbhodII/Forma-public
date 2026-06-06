import type { BodyMetricRow } from "../../../types";
import { ModalShell } from "../../../components/ui/modal";
import { formatDateRu } from "../../../utils/format";
import { formatMetricNum } from "../../../utils/bodyMetrics";
import { useUnits } from "../../../hooks/useUnits";
import type { WeeklyAggregate } from "../../../utils/weeklyAggregation";
import { WeightEntryForm } from "./WeightEntryForm";

export function WeekDetailModal({
  week,
  editingRow,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSave,
  isPending,
  formError,
}: {
  week: WeeklyAggregate;
  editingRow: BodyMetricRow | null;
  onClose: () => void;
  onStartEdit: (row: BodyMetricRow) => void;
  onCancelEdit: () => void;
  onSave: (payload: {
    date: string;
    weight_kg: number;
    body_fat_percent: number | null;
    only_weight: boolean;
  }) => void;
  isPending: boolean;
  formError: string | null;
}) {
  const { formatBodyWeight } = useUnits();

  return (
    <ModalShell
      open
      onClose={onClose}
      dataEntry
      title={editingRow ? "Изменить запись" : `Неделя ${week.weekLabel}`}
      description={editingRow ? undefined : `${week.count} записей`}
      size="md"
      zIndex={50}
    >
      {editingRow ? (
        <WeightEntryForm
          key={String(editingRow.date).slice(0, 10)}
          embedded
          onSave={onSave}
          isPending={isPending}
          formError={formError}
          initialRow={editingRow}
          onCancelEdit={onCancelEdit}
        />
      ) : (
        <ul className="space-y-2">
          {week.measurements.map((row) => {
            const d = String(row.date).slice(0, 10);
            return (
              <li
                key={d}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--app-border))] p-3 hover:bg-[rgb(var(--app-surface-subtle))]"
              >
                <div>
                  <p className="font-medium text-[rgb(var(--app-text))]">{formatDateRu(d)}</p>
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">
                    {row.weight_kg != null ? formatBodyWeight(Number(row.weight_kg)) : "—"} · жир{" "}
                    {formatMetricNum(row.body_fat_percent, "%")}
                  </p>
                </div>
                <button type="button" className="btn-secondary text-xs" onClick={() => onStartEdit(row)}>
                  Изменить
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}
