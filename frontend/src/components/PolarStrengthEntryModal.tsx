import { useState } from "react";
import { type PolarPendingListItem } from "../api/polar";
import { formatDateRu, formatDuration } from "../utils/format";
import { ModalShell } from "./ui/modal";

function polarItemSummary(item: PolarPendingListItem): string {
  const parts: string[] = [];
  if (item.date) parts.push(formatDateRu(item.date));
  if (item.duration_sec) parts.push(formatDuration(item.duration_sec));
  if (item.calories) parts.push(`${item.calories} ккал`);
  return parts.join(" · ") || "Polar";
}

/** Prompt when adding a strength workout while Polar records are pending. */
export function PolarStrengthEntryModal({
  items,
  onManual,
  onCreateFromPolar,
  onAttach,
  onClose,
}: {
  items: PolarPendingListItem[];
  onManual: () => void;
  onCreateFromPolar: (item: PolarPendingListItem) => void;
  onAttach: (item: PolarPendingListItem) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.polar_transaction_id ?? "");
  const selected = items.find((i) => i.polar_transaction_id === selectedId) ?? items[0];

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Незаписанная тренировка Polar"
      description="Можно создать запись из Polar, привязать к существующей или записать вручную."
      size="md"
      zIndex={65}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Отмена
          </button>
          <button type="button" onClick={onManual} className="btn-secondary">
            Создать вручную
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onAttach(selected)}
            className="btn-secondary disabled:opacity-50"
          >
            Привязать к существующей
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onCreateFromPolar(selected)}
            className="btn-primary disabled:opacity-50"
          >
            Создать из Polar
          </button>
        </>
      }
    >
      {items.length > 1 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <label
              key={item.polar_transaction_id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selectedId === item.polar_transaction_id
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                  : "border-[rgb(var(--app-border))]"
              }`}
            >
              <input
                type="radio"
                name="polar-strength-entry"
                checked={selectedId === item.polar_transaction_id}
                onChange={() => setSelectedId(item.polar_transaction_id)}
              />
              <span className="text-sm">{polarItemSummary(item)}</span>
            </label>
          ))}
        </div>
      ) : selected ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">{polarItemSummary(selected)}</p>
      ) : null}
    </ModalShell>
  );
}
