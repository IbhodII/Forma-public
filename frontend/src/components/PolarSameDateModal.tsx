import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { attachPolarItemToWorkout } from "../utils/polarAutoAttach";
import { type PolarPendingListItem } from "../api/polar";
import { invalidateAfterPolarAttach } from "../utils/polarQueryInvalidation";
import { polarAttachToast } from "../utils/polarAttachFeedback";
import { formatDateRu, formatDuration } from "../utils/format";
import { parseApiError } from "../utils/validation";
import { useToast } from "./Toast";
import { ModalShell } from "./ui/modal";
import { cardioTypeLabel } from "../utils/constants";

function polarTypeLabel(type: string | null | undefined): string {
  if (type === "силовая") return "Силовая";
  if (!type) return "—";
  return cardioTypeLabel(type);
}

/** Несколько Polar за один день — выбор, какую привязать */
export function PolarSameDateModal({
  date,
  items,
  onClose,
  onAttachItem,
}: {
  date: string;
  items: PolarPendingListItem[];
  onClose: () => void;
  onAttachItem: (item: PolarPendingListItem) => void;
}) {
  return (
    <ModalShell
      open
      onClose={onClose}
      title="Несколько тренировок Polar"
      description={`За ${formatDateRu(date)} найдено ${items.length} тренировок Polar. Выберите, какую привязать.`}
      size="lg"
      zIndex={65}
      footer={
        <button type="button" onClick={onClose} className="btn-secondary">
          Позже
        </button>
      }
    >
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.polar_transaction_id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[rgb(var(--app-border))]"
          >
            <div className="text-sm min-w-0">
              <div className="font-medium">{polarTypeLabel(item.type)}</div>
              <div className="text-[rgb(var(--app-text-muted))] text-xs mt-0.5">
                {item.duration_sec ? formatDuration(item.duration_sec) : "—"}
                {item.distance_km != null && item.distance_km > 0 ? ` · ${item.distance_km} км` : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-2.5 shrink-0"
              onClick={() => onAttachItem(item)}
            >
              Привязать
            </button>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}

/** После ручного сохранения: несколько Polar за дату+тип — выбор записи Polar */
export function PolarPickPendingModal({
  workoutId,
  kind,
  candidates,
  sessionDate,
  sessionTitle,
  onClose,
  onDone,
}: {
  workoutId: number;
  kind: "cardio" | "strength";
  candidates: PolarPendingListItem[];
  sessionDate?: string;
  sessionTitle?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(candidates[0]?.polar_transaction_id ?? "");

  const attachMut = useMutation({
    mutationFn: async () => {
      const item = candidates.find((c) => c.polar_transaction_id === selected);
      if (!item) throw new Error("Выберите тренировку Polar");
      return attachPolarItemToWorkout(item, workoutId, kind);
    },
    onSuccess: async (attachRes) => {
      await invalidateAfterPolarAttach(qc, {
        kind,
        workoutId,
        sessionDate,
        sessionTitle,
      });
      const toast = polarAttachToast(attachRes);
      showToast(toast.message, toast.kind);
      onDone();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Выберите тренировку Polar"
      description="За этот день несколько записей Polar. К какой привязать пульс и GPS?"
      size="md"
      zIndex={65}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Пропустить
          </button>
          <button
            type="button"
            disabled={!selected || attachMut.isPending}
            onClick={() => attachMut.mutate()}
            className="btn-primary disabled:opacity-50"
          >
            {attachMut.isPending ? "Привязка…" : "Импортировать"}
          </button>
        </>
      }
    >
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {candidates.map((item) => (
          <label
            key={item.polar_transaction_id}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
              selected === item.polar_transaction_id
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                : "border-[rgb(var(--app-border))]"
            }`}
          >
            <input
              type="radio"
              name="polar-pick"
              checked={selected === item.polar_transaction_id}
              onChange={() => setSelected(item.polar_transaction_id)}
            />
            <span className="text-sm">
              {polarTypeLabel(item.type)}
              {item.duration_sec ? ` · ${formatDuration(item.duration_sec)}` : ""}
            </span>
          </label>
        ))}
      </div>
    </ModalShell>
  );
}
