import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchUserProfile } from "../../../api/user";
import { queryKeys } from "../../../hooks/queryKeys";
import {
  fetchCutBulkPlan,
  forecastDynamicCut,
  forecastNutrition,
  saveCutBulkPlan,
  type CutBulkSnapshot,
  type NutritionForecastResult,
} from "../../../api/cutBulk";
import {
  defaultTargetBodyFatPercent,
  hasBodyFatInSnapshot,
  resolveTargetBodyFatForApi,
  validateTargetBodyFat,
} from "../cutBulk/bodyFatGoal";
import { WeightProjectionChart } from "./WeightProjectionChart";
import { DeficitForecastAlert } from "./DeficitForecastAlert";
import { ForecastGoalBanner } from "./ForecastGoalBanner";
import { isDeficitOverPlanned } from "./formatDeficitAlert";
import { CUT_BALANCE_PERIOD } from "../cutBulk/balancePeriod";
import { isForecastGoalReached } from "./forecastGoalStatus";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { useToast } from "../../../components/Toast";
import { useUnits } from "../../../hooks/useUnits";
import { formatDateRu } from "../../../utils/format";
import { parseApiError } from "../../../utils/validation";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateRu(String(iso).slice(0, 10));
}

export function NutritionForecastPanel({
  snap,
  phase: phaseProp,
  preferChest: preferChestProp = true,
}: {
  snap: CutBulkSnapshot;
  phase?: "cut" | "bulk";
  preferChest?: boolean;
}) {
  const { showToast } = useToast();
  const { formatEnergy, formatBodyWeight } = useUnits();
  const weight = snap.weight_kg!;
  const bf = snap.body_fat_percent;

  const [phaseInternal, setPhaseInternal] = useState<"cut" | "bulk">("cut");
  const phase = phaseProp ?? phaseInternal;

  const [targetWeight, setTargetWeight] = useState(
    () => Math.round((phase === "cut" ? weight - 5 : weight + 5) * 10) / 10,
  );

  useEffect(() => {
    setTargetWeight(
      Math.round((phase === "cut" ? weight - 5 : weight + 5) * 10) / 10,
    );
    setForecast(null);
  }, [phase, weight]);
  const targetBfRequired = hasBodyFatInSnapshot(snap);
  const [targetBf, setTargetBf] = useState(() =>
    targetBfRequired ? String(defaultTargetBodyFatPercent(bf, phase)) : "",
  );
  const [useTargetBf, setUseTargetBf] = useState(targetBfRequired);
  const [forecast, setForecast] = useState<NutritionForecastResult | null>(null);
  const [bulkGramsPerWeek, setBulkGramsPerWeek] = useState(300);

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  useEffect(() => {
    const v = profileQuery.data?.target_bulk_grams_per_week;
    if (v != null) setBulkGramsPerWeek(Number(v));
  }, [profileQuery.data?.target_bulk_grams_per_week]);

  const planQuery = useQuery({
    queryKey: queryKeys.cutBulkPlan(phase),
    queryFn: () => fetchCutBulkPlan(phase),
    enabled: Boolean(phaseProp),
  });

  useEffect(() => {
    const plan = planQuery.data;
    if (!plan) return;
    if (plan.target_weight_kg != null) setTargetWeight(Number(plan.target_weight_kg));
    if (plan.target_fat_percent != null) {
      setUseTargetBf(true);
      setTargetBf(String(plan.target_fat_percent));
    } else if (targetBfRequired) {
      setUseTargetBf(true);
      setTargetBf(String(defaultTargetBodyFatPercent(bf, phase)));
    }
  }, [planQuery.data, targetBfRequired, bf, phase]);

  const targetBfValidation = useMemo(
    () =>
      targetBfRequired
        ? validateTargetBodyFat(targetBf, bf, phase, true)
        : { valid: true, message: null as string | null },
    [targetBf, bf, phase, targetBfRequired],
  );

  const useDynamicCut = phase === "cut" && targetBfRequired && bf != null;

  const calcMut = useMutation({
    mutationFn: () => {
      const targetBodyFat = resolveTargetBodyFatForApi(targetBf, useTargetBf, targetBfRequired);
      if (useDynamicCut) {
        return forecastDynamicCut({
          target_weight_kg: targetWeight,
          target_body_fat_percent: targetBodyFat,
          prefer_chest_workout: preferChestProp,
          balance_period: CUT_BALANCE_PERIOD,
          persist_plan: true,
        });
      }
      return forecastNutrition({
        phase,
        target_weight_kg: targetWeight,
        target_body_fat_percent: targetBodyFat,
        prefer_chest_workout: preferChestProp,
        target_bulk_grams_per_week: phase === "bulk" ? bulkGramsPerWeek : undefined,
        balance_period: CUT_BALANCE_PERIOD,
        persist_plan: true,
      });
    },
    onSuccess: (data) => {
      setForecast(data);
      const fatPct = resolveTargetBodyFatForApi(targetBf, useTargetBf, targetBfRequired);
      void saveCutBulkPlan({
        phase,
        target_weight_kg: data.target_weight_kg,
        target_date: data.target_date,
        ...(fatPct != null ? { target_fat_percent: fatPct } : {}),
      });
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const balanceLabel =
    forecast && forecast.daily_surplus_or_deficit < 0 ? "дефицит" : "профицит";

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
        Расчёт приблизительный: среднее потребление и расход (BMR + тренировки с приоритетом
        пульсометра + TEF) за прошлую календарную неделю. Изменение веса: 7700 ккал ≈ 1 кг.
      </p>

      {!phaseProp && (
        <div className="flex flex-wrap gap-2">
          {(["cut", "bulk"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPhaseInternal(p);
                setTargetWeight(
                  Math.round((p === "cut" ? weight - 5 : weight + 5) * 10) / 10,
                );
                setForecast(null);
              }}
              className={
                phase === p ? "btn-primary text-sm py-1.5" : "btn-secondary text-sm py-1.5"
              }
            >
              {p === "cut" ? "Сушка" : "Набор"}
            </button>
          ))}
        </div>
      )}

      {phase === "bulk" && (
        <label className="text-sm block max-w-xs">
          Набор, г/неделю (для прогноза)
          <input
            type="number"
            min={50}
            max={2000}
            step={10}
            value={bulkGramsPerWeek}
            onChange={(e) => setBulkGramsPerWeek(Number(e.target.value))}
            className="input-field mt-1"
          />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm block">
          Целевой вес, кг
          <input
            type="number"
            step="0.1"
            min={phase === "cut" ? 30 : weight + 0.1}
            max={phase === "bulk" ? 300 : weight - 0.1}
            value={targetWeight}
            onChange={(e) => setTargetWeight(Number(e.target.value))}
            className="input-field mt-1"
          />
        </label>
        <div className="text-sm space-y-2">
          {targetBfRequired ? (
            <label className="block">
              <span>
                Целевой % жира <span className="text-rose-500">*</span>
              </span>
              <input
                type="number"
                step="0.1"
                min={3}
                max={60}
                required
                value={targetBf}
                onChange={(e) => setTargetBf(e.target.value)}
                className={`input-field w-full mt-1 ${
                  !targetBfValidation.valid ? "border-rose-400" : ""
                }`}
              />
              <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1">
                Сейчас: {bf.toFixed(1)}%
              </p>
              {!targetBfValidation.valid && targetBfValidation.message && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                  {targetBfValidation.message}
                </p>
              )}
            </label>
          ) : (
            <>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTargetBf}
                  onChange={(e) => setUseTargetBf(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Указать целевой % жира
              </label>
              {useTargetBf ? (
                <input
                  type="number"
                  step="0.1"
                  min={3}
                  max={60}
                  value={targetBf}
                  onChange={(e) => setTargetBf(e.target.value)}
                  className="input-field w-full"
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => calcMut.mutate()}
        disabled={calcMut.isPending || !targetBfValidation.valid}
        className="btn-primary"
      >
        {calcMut.isPending ? "Расчёт…" : "Рассчитать прогноз"}
      </button>

      {calcMut.isError && <ErrorAlert message={parseApiError(calcMut.error)} />}

      {forecast && (
        <div className="space-y-4">
          {phase === "cut" && (forecast.deficit_status || isDeficitOverPlanned(forecast)) ? (
            <DeficitForecastAlert forecast={forecast} />
          ) : null}
          <ForecastGoalBanner forecast={forecast} phase={phase} />
          {forecast.dynamic_explanation && (
            <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
              {forecast.dynamic_explanation}
            </p>
          )}
          {(forecast.weight_projection?.length ?? 0) >= 1 ? (
            <WeightProjectionChart forecast={forecast} className="card-panel" />
          ) : null}
          <div className="card-panel space-y-3">
            <h4 className="section-title">Прогноз до цели</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Среднее потребление</span>
                <p className="font-semibold tabular-nums">
                  {formatEnergy(forecast.average_daily_calorie_intake)}/день
                </p>
              </div>
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Средний расход</span>
                <p className="font-semibold tabular-nums">
                  {formatEnergy(forecast.average_daily_expenditure)}/день
                </p>
              </div>
            {forecast.target_daily_surplus_kcal != null && phase === "bulk" && (
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Целевой профицит</span>
                <p className="font-semibold tabular-nums">
                  {formatEnergy(forecast.target_daily_surplus_kcal)}/день
                </p>
              </div>
            )}
            <div>
              <span className="text-[rgb(var(--app-text-muted))]">
                {balanceLabel.charAt(0).toUpperCase() + balanceLabel.slice(1)} (факт)
              </span>
                <p
                  className={`font-semibold tabular-nums ${
                    forecast.daily_surplus_or_deficit < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {forecast.daily_surplus_or_deficit > 0 ? "+" : ""}
                  {formatEnergy(forecast.daily_surplus_or_deficit)}/день
                </p>
              </div>
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">~ кг / неделю</span>
                <p className="font-semibold tabular-nums">
                  {forecast.change_per_week_kg.toFixed(2)} кг
                </p>
              </div>
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Недель до цели</span>
                <p className="font-semibold tabular-nums">
                  {isForecastGoalReached(forecast, phase) ? "—" : forecast.weeks_to_target.toFixed(1)}
                </p>
              </div>
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Дата цели</span>
                <p className="font-semibold">{fmtDate(forecast.target_date)}</p>
              </div>
              <div>
                <span className="text-[rgb(var(--app-text-muted))]">Целевой вес</span>
                <p className="font-semibold tabular-nums">
                  {formatBodyWeight(forecast.target_weight_kg)}
                </p>
              </div>
            </div>

            {forecast.fat_goal_achievable === false && forecast.body_fat_note && (
              <p className="text-sm text-amber-700 dark:text-amber-300">{forecast.body_fat_note}</p>
            )}
            {forecast.fat_goal_achievable !== false && forecast.body_fat_note && (
              <p className="text-sm text-[rgb(var(--app-text-muted))]">{forecast.body_fat_note}</p>
            )}
            {forecast.target_fat_kg != null && (
              <p className="text-xs text-[rgb(var(--app-text-muted))]">
                Целевой жир: {forecast.target_fat_kg.toFixed(1)} кг
                {forecast.target_body_fat_percent != null &&
                  ` (${forecast.target_body_fat_percent.toFixed(1)}%)`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
