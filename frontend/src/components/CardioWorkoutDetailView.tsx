import { useQuery } from "@tanstack/react-query";
import { fetchCardioAvailability } from "../api/cardio";
import { useUnits } from "../hooks/useUnits";
import { queryKeys } from "../hooks/queryKeys";
import type { CardioWorkout } from "../types";
import { cardioTypeLabel } from "../utils/constants";
import { chestStrapKcal, formatDateRu, formatDuration } from "../utils/format";
import { buildAvailabilityMap, emptyAvailabilityItem } from "../utils/cardioAvailability";
import {
  CardioWorkoutPanel,
  cardioSecondarySummary,
} from "./CardioWorkoutPanel";
import { Loader } from "./Loader";

export function CardioWorkoutDetailView({
  workout,
  onBack,
}: {
  workout: CardioWorkout;
  onBack?: () => void;
}) {
  const units = useUnits();
  const availQuery = useQuery({
    queryKey: queryKeys.cardioAvailability([workout.id]),
    queryFn: () => fetchCardioAvailability([workout.id]),
  });
  const availMap = availQuery.data ? buildAvailabilityMap(availQuery.data) : new Map();
  const avail = availMap.get(workout.id) ?? emptyAvailabilityItem(workout.id);

  const chestKcal = chestStrapKcal(workout);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-[rgb(var(--app-text))]">
            {formatDateRu(workout.date)} · {cardioTypeLabel(workout.type)}
          </h4>
          <p className="text-xs text-[rgb(var(--app-text-muted))] mt-0.5">
            {cardioSecondarySummary(workout, units)}
          </p>
        </div>
        {onBack && (
          <button type="button" className="btn-secondary text-sm" onClick={onBack}>
            ← К списку
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Дистанция</p>
          <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
            {workout.distance_km > 0 ? units.formatDistance(workout.distance_km) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Длительность</p>
          <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
            {workout.duration_sec > 0 ? formatDuration(workout.duration_sec) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Ср. пульс</p>
          <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
            {workout.avg_hr != null ? `${workout.avg_hr} уд/мин` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Макс. пульс</p>
          <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
            {workout.max_hr != null ? `${workout.max_hr} уд/мин` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Ккал</p>
          <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
            {workout.calories != null
              ? units.formatEnergy(workout.calories)
              : chestKcal != null
                ? units.formatEnergy(chestKcal)
                : "—"}
          </p>
        </div>
        {workout.calories_watch != null && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Ккал часы</p>
            <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
              {units.formatEnergy(workout.calories_watch)}
            </p>
          </div>
        )}
        {workout.avg_cadence != null && workout.avg_cadence > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Каденс</p>
            <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
              {Math.round(workout.avg_cadence)} об/мин
            </p>
          </div>
        )}
        {workout.avg_power_watts != null && workout.avg_power_watts > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Мощность</p>
            <p className="font-semibold text-[rgb(var(--app-text))] tabular-nums">
              {Math.round(workout.avg_power_watts)} Вт
            </p>
          </div>
        )}
      </div>

      {availQuery.isLoading && <Loader label="Данные тренировки…" />}
      {!availQuery.isLoading && (
        <CardioWorkoutPanel
          workout={workout}
          hasHr={avail.has_hr}
          hasGps={avail.has_gps}
          hasSensors={avail.has_sensors}
        />
      )}
    </div>
  );
}
