import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchBulkGainControl } from "../../../api/cutBulk";
import { fetchUserProfile, saveUserProfile } from "../../../api/user";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { useUnits } from "../../../hooks/useUnits";
import { cn } from "../../../lib/utils";
import { loadPreferChestWorkoutKcal } from "../../../pages/FoodDiary/workoutExpenditure";
import { parseApiError } from "../../../utils/validation";

const DEFAULT_GRAMS_PER_WEEK = 300;

export function BulkGainGoalPanel({
  preferChest: preferChestProp,
  compact = false,
}: {
  preferChest?: boolean;
  compact?: boolean;
}) {
  const { formatEnergy } = useUnits();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [gramsPerWeek, setGramsPerWeek] = useState(DEFAULT_GRAMS_PER_WEEK);
  const preferChest = preferChestProp ?? loadPreferChestWorkoutKcal();

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  useEffect(() => {
    const v = profileQuery.data?.target_bulk_grams_per_week;
    if (v != null) setGramsPerWeek(Number(v));
  }, [profileQuery.data?.target_bulk_grams_per_week]);

  const controlQuery = useQuery({
    queryKey: queryKeys.bulkGainControl(preferChest, gramsPerWeek),
    queryFn: () => fetchBulkGainControl(preferChest, gramsPerWeek),
  });

  const saveMut = useMutation({
    mutationFn: (value: number) => saveUserProfile({ target_bulk_grams_per_week: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.userProfile });
      void qc.invalidateQueries({ queryKey: ["nutrition", "gain-control"] });
      showToast("Цель набора сохранена", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const data = controlQuery.data;
  const targetSurplus =
    data?.target_daily_surplus_kcal ??
    Math.round((gramsPerWeek / 7) * 7.7 * 10) / 10;

  return (
    <div
      className={cn(
        compact
          ? "rounded-md border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-2 py-1.5 space-y-1.5"
          : "card-panel space-y-4 border border-[rgb(var(--app-border))]",
      )}
    >
      <h3 className={compact ? "text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]" : "font-medium"}>
        Цель набора
      </h3>
      {!compact && (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          Рекомендуется 250–350 г/нед. Быстрее — риск набора жира.
        </p>
      )}

      <label className={cn("block", compact ? "text-[11px] max-w-[10rem]" : "text-sm max-w-xs")}>
        <span className="text-[10px] text-[rgb(var(--app-text-muted))]">Набор, г/нед</span>
        <input
          type="number"
          min={50}
          max={2000}
          step={10}
          value={gramsPerWeek}
          onChange={(e) => setGramsPerWeek(Number(e.target.value))}
          onBlur={() => saveMut.mutate(gramsPerWeek)}
          className={cn("input-field mt-0.5", compact && "!min-h-8 !py-1.5 !text-sm")}
        />
      </label>
      <p className="text-[10px] text-[rgb(var(--app-text-muted))]">
        Профицит ≈ {formatEnergy(targetSurplus)}/день
      </p>

      {controlQuery.isLoading && <Loader label="Анализ профицита…" compact />}
      {controlQuery.isError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          {parseApiError(controlQuery.error)}
        </p>
      )}

      {data?.ok && (
        <div className={cn("text-[11px] leading-snug space-y-1", compact ? "" : "rounded-lg border border-[rgb(var(--app-border))] px-3 py-2")}>
          <p>
            Профицит{" "}
            <span className="font-semibold tabular-nums">
              {formatEnergy(data.current_daily_surplus_kcal ?? 0)}/д
            </span>
            {" · "}цель{" "}
            <span className="font-semibold tabular-nums">
              {formatEnergy(data.target_daily_surplus_kcal ?? targetSurplus)}/д
            </span>
          </p>
          <p
            className={
              data.status === "on_target"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-amber-700 dark:text-amber-300"
            }
          >
            {data.recommendation}
          </p>
        </div>
      )}

      {data && !data.ok && data.error && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">{data.error}</p>
      )}
    </div>
  );
}
