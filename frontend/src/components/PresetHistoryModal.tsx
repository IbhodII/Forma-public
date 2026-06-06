import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCardioWorkouts } from "../api/cardio";
import { fetchSessionsByPreset } from "../api/strength";
import { CardioWorkoutDetailView } from "./CardioWorkoutDetailView";
import { StrengthSessionDetailView } from "./strength/StrengthSessionDetailView";
import { ErrorAlert } from "./ErrorAlert";
import { Loader } from "./Loader";
import { ModalCloseButton, ModalFrame } from "./ui/modal";
import { useUnits } from "../hooks/useUnits";
import { queryKeys } from "../hooks/queryKeys";
import type { CardioWorkout, StrengthSession } from "../types";
import { CARDIO_BIKE, CARDIO_POOL } from "../utils/constants";
import { formatDateRu, formatDuration } from "../utils/format";
import { parseApiError } from "../utils/validation";

export type PresetHistoryTarget =
  | { kind: "strength"; presetId: number; title: string }
  | { kind: "cardio"; type: string; title: string };

function StrengthHistoryTable({
  items,
  formatEnergy,
  onSelect,
}: {
  items: StrengthSession[];
  formatEnergy: (kcal: number) => string;
  onSelect: (session: StrengthSession) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="px-3 py-2">Дата</th>
            <th className="px-3 py-2">Длительность</th>
            <th className="px-3 py-2">Подходы</th>
            <th className="px-3 py-2">Объём</th>
            <th className="px-3 py-2">Пульс</th>
            <th className="px-3 py-2">Ккал</th>
            <th className="px-3 py-2 w-24" />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const key = `${s.date}|${s.workout_title}`;
            return (
              <tr
                key={key}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => onSelect(s)}
              >
                <td className="px-3 py-2 whitespace-nowrap">{formatDateRu(s.date)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {s.duration_sec != null && s.duration_sec > 0 ? formatDuration(s.duration_sec) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{s.sets_count}</td>
                <td className="px-3 py-2 tabular-nums">
                  {s.volume_kg != null && s.volume_kg > 0 ? `${Math.round(s.volume_kg)} кг` : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{s.avg_hr != null ? `${s.avg_hr}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {s.calories_chest != null ? formatEnergy(s.calories_chest) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="text-brand-600 text-xs font-medium">Подробнее →</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardioHistoryTable({
  items,
  formatEnergy,
  formatDistance,
  onSelect,
}: {
  items: CardioWorkout[];
  formatEnergy: (kcal: number) => string;
  formatDistance: (km: number) => string;
  onSelect: (workout: CardioWorkout) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="px-3 py-2">Дата</th>
            <th className="px-3 py-2">Длительность</th>
            <th className="px-3 py-2">Дистанция</th>
            <th className="px-3 py-2">Ср. пульс</th>
            <th className="px-3 py-2">Макс. пульс</th>
            <th className="px-3 py-2">Ккал</th>
            <th className="px-3 py-2">Доп.</th>
            <th className="px-3 py-2 w-24" />
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr
              key={w.id}
              className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
              onClick={() => onSelect(w)}
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatDateRu(w.date)}</td>
              <td className="px-3 py-2 tabular-nums">
                {w.duration_sec > 0 ? formatDuration(w.duration_sec) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {w.distance_km > 0 ? formatDistance(w.distance_km) : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums">{w.avg_hr ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{w.max_hr ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                {w.calories != null
                  ? formatEnergy(w.calories)
                  : w.calories_chest != null
                    ? formatEnergy(w.calories_chest)
                    : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {w.type === CARDIO_POOL && w.pace_sec_100m != null
                  ? `${Math.round(w.pace_sec_100m)} с/100м`
                  : w.type === CARDIO_BIKE && w.avg_power_watts != null
                    ? `${Math.round(w.avg_power_watts)} Вт`
                    : w.pace_min_km != null
                      ? `${w.pace_min_km.toFixed(1)} мин/км`
                      : "—"}
              </td>
              <td className="px-3 py-2">
                <span className="text-brand-600 text-xs font-medium">Подробнее →</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PresetHistoryModal({
  target,
  onClose,
}: {
  target: PresetHistoryTarget;
  onClose: () => void;
}) {
  const { formatEnergy, formatDistance } = useUnits();
  const [strengthDetail, setStrengthDetail] = useState<StrengthSession | null>(null);
  const [cardioDetail, setCardioDetail] = useState<CardioWorkout | null>(null);

  const strengthQuery = useQuery({
    queryKey: queryKeys.strengthSessionsByPreset(target.kind === "strength" ? target.presetId : 0),
    queryFn: () => fetchSessionsByPreset(target.kind === "strength" ? target.presetId : 0),
    enabled: target.kind === "strength",
  });

  const cardioQuery = useQuery({
    queryKey: queryKeys.cardioWorkouts({
      limit: 500,
      offset: 0,
      type: target.kind === "cardio" ? target.type : "",
    }),
    queryFn: () =>
      fetchCardioWorkouts({
        limit: 500,
        offset: 0,
        type: target.kind === "cardio" ? target.type : undefined,
      }),
    enabled: target.kind === "cardio",
  });

  const isLoading = target.kind === "strength" ? strengthQuery.isLoading : cardioQuery.isLoading;
  const isError = target.kind === "strength" ? strengthQuery.isError : cardioQuery.isError;
  const error = target.kind === "strength" ? strengthQuery.error : cardioQuery.error;
  const count =
    target.kind === "strength"
      ? (strengthQuery.data?.items.length ?? 0)
      : (cardioQuery.data?.items.length ?? 0);

  const showingDetail = strengthDetail != null || cardioDetail != null;

  return (
    <ModalFrame
      open
      onClose={onClose}
      zIndex={50}
      panelClassName="max-w-3xl max-h-[min(90dvh,720px)] flex flex-col p-0 overflow-hidden"
      dialogLabel="preset-history-title"
    >
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 id="preset-history-title" className="text-lg font-semibold text-slate-800">
              {showingDetail ? "Тренировка" : `История: ${target.title}`}
            </h3>
            {!showingDetail && (
              <p className="text-sm text-slate-500 mt-1">
                {target.kind === "strength" ? "Силовые тренировки" : "Кардио"} · {count}{" "}
                {count === 1 ? "запись" : count >= 2 && count <= 4 ? "записи" : "записей"}
              </p>
            )}
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div className="overflow-y-auto p-4 flex-1 min-h-0">
          {strengthDetail && (
            <StrengthSessionDetailView
              session={strengthDetail}
              onBack={() => setStrengthDetail(null)}
            />
          )}
          {cardioDetail && (
            <CardioWorkoutDetailView workout={cardioDetail} onBack={() => setCardioDetail(null)} />
          )}
          {!showingDetail && (
            <>
              {isLoading && <Loader label="Загрузка…" />}
              {isError && <ErrorAlert message={parseApiError(error)} />}
              {target.kind === "strength" &&
                strengthQuery.data &&
                !strengthQuery.data.items.length && (
                  <p className="text-sm text-slate-500">Нет записанных тренировок.</p>
                )}
              {target.kind === "strength" &&
                strengthQuery.data &&
                strengthQuery.data.items.length > 0 && (
                  <StrengthHistoryTable
                    items={strengthQuery.data.items}
                    formatEnergy={formatEnergy}
                    onSelect={setStrengthDetail}
                  />
                )}
              {target.kind === "cardio" && cardioQuery.data && !cardioQuery.data.items.length && (
                <p className="text-sm text-slate-500">Нет записанных тренировок.</p>
              )}
              {target.kind === "cardio" && cardioQuery.data && cardioQuery.data.items.length > 0 && (
                <CardioHistoryTable
                  items={cardioQuery.data.items}
                  formatEnergy={formatEnergy}
                  formatDistance={formatDistance}
                  onSelect={setCardioDetail}
                />
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
    </ModalFrame>
  );
}
