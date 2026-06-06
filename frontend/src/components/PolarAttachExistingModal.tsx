import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fetchCardioWorkouts } from "../api/cardio";
import {
  attachPolarToCardio,
  attachPolarToStrength,
  isPolarCardioType,
  isPolarStrengthType,
  type PolarPendingListItem,
} from "../api/polar";
import { fetchSessionDetail, fetchSessions } from "../api/strength";
import { invalidateAfterPolarAttach } from "../utils/polarQueryInvalidation";
import { polarAttachToast } from "../utils/polarAttachFeedback";
import { cardioTypeLabel, CARDIO_SOURCE_FIT } from "../utils/constants";
import { formatDateRu } from "../utils/format";
import { parseApiError } from "../utils/validation";
import { Loader } from "./Loader";
import { ModalShell } from "./ui/modal";
import { useToast } from "./Toast";

function polarTypeLabel(type: string | null | undefined): string {
  if (type === "силовая") return "Силовая";
  if (!type) return "—";
  return cardioTypeLabel(type);
}

interface PolarAttachExistingModalProps {
  item: PolarPendingListItem;
  onClose: () => void;
  onDone: () => void;
}

export function PolarAttachExistingModal({ item, onClose, onDone }: PolarAttachExistingModalProps) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const date = item.date ?? "";
  const isCardio = isPolarCardioType(item.type);
  const isStrength = isPolarStrengthType(item.type);

  const [selectedCardioId, setSelectedCardioId] = useState<number | null>(null);
  const [selectedStrengthKey, setSelectedStrengthKey] = useState<string | null>(null);

  const cardioQuery = useQuery({
    queryKey: ["cardio", "attach-pick", date, item.type],
    queryFn: () =>
      fetchCardioWorkouts({
        limit: 50,
        offset: 0,
        date_from: date,
        date_to: date,
        type: item.type ?? undefined,
      }),
    enabled: isCardio && Boolean(date),
  });

  const strengthQuery = useQuery({
    queryKey: ["strength", "attach-pick", date],
    queryFn: () =>
      fetchSessions({
        limit: 50,
        offset: 0,
        date_from: date,
        date_to: date,
      }),
    enabled: isStrength && Boolean(date),
  });

  const attachMut = useMutation({
    mutationFn: async () => {
      if (isCardio) {
        if (selectedCardioId == null) throw new Error("Выберите тренировку");
        const res = await attachPolarToCardio(selectedCardioId, item.polar_transaction_id);
        return { kind: "cardio" as const, workoutId: selectedCardioId, attachRes: res };
      }
      if (isStrength) {
        if (!selectedStrengthKey) throw new Error("Выберите тренировку");
        const [sessionDate, title] = selectedStrengthKey.split("|");
        const detail = await fetchSessionDetail(sessionDate, title);
        const workoutId = detail.anchor_row_id ?? detail.hr_workout_id;
        if (!workoutId) throw new Error("Не удалось определить id тренировки");
        const res = await attachPolarToStrength(workoutId, item.polar_transaction_id);
        return {
          kind: "strength" as const,
          workoutId,
          sessionDate,
          sessionTitle: title,
          attachRes: res,
        };
      }
      throw new Error("Неподдерживаемый тип Polar");
    },
    onSuccess: async (result) => {
      await invalidateAfterPolarAttach(qc, result);
      const toast = polarAttachToast(result.attachRes);
      showToast(toast.message, toast.kind);
      onDone();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const loading = cardioQuery.isLoading || strengthQuery.isLoading;
  const cardioItems = (cardioQuery.data?.items ?? []).filter(
    (w) => w.data_source !== CARDIO_SOURCE_FIT,
  );
  const strengthItems = strengthQuery.data?.items ?? [];

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Привязать к существующей"
      description={`${formatDateRu(date)} · ${polarTypeLabel(item.type)}`}
      size="sm"
      zIndex={60}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Отмена
          </button>
          <button
            type="button"
            disabled={
              attachMut.isPending ||
              (isCardio && selectedCardioId == null) ||
              (isStrength && !selectedStrengthKey)
            }
            onClick={() => attachMut.mutate()}
            className="btn-primary disabled:opacity-50"
          >
            {attachMut.isPending ? "Привязка…" : "Привязать"}
          </button>
        </>
      }
    >
        {loading && <Loader label="Загрузка тренировок…" compact />}

        {!loading && isCardio && (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {cardioItems.length === 0 ? (
              <p className="text-sm text-slate-500">Нет кардио-тренировок за эту дату.</p>
            ) : (
              cardioItems.map((w) => (
                <label
                  key={w.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                    selectedCardioId === w.id ? "border-brand-500 bg-brand-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="cardio-pick"
                    checked={selectedCardioId === w.id}
                    onChange={() => setSelectedCardioId(w.id)}
                  />
                  <span className="text-sm">
                    {cardioTypeLabel(w.type)} · {w.distance_km} км
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        {!loading && isStrength && (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {strengthItems.length === 0 ? (
              <p className="text-sm text-slate-500">Нет силовых тренировок за эту дату.</p>
            ) : (
              strengthItems.map((s) => {
                const key = `${s.date}|${s.workout_title}`;
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      selectedStrengthKey === key ? "border-brand-500 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="strength-pick"
                      checked={selectedStrengthKey === key}
                      onChange={() => setSelectedStrengthKey(key)}
                    />
                    <span className="text-sm font-medium">{s.workout_title || "Без названия"}</span>
                  </label>
                );
              })
            )}
          </div>
        )}

        {!isCardio && !isStrength && (
          <p className="text-sm text-red-600 mb-4">Неизвестный тип тренировки Polar.</p>
        )}
    </ModalShell>
  );
}
