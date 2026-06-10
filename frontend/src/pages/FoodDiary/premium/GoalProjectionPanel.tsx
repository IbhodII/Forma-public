import { RefreshCw, Save } from "lucide-react";
import type { ReactNode } from "react";
import type { FoodPhase } from "../../../api/food";
import type { CutBulkSnapshot } from "../../../api/cutBulk";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { ChartContainer } from "../../../components/analytics";
import { WeightProjectionChart } from "../../../modules/nutrition/forecast/WeightProjectionChart";
import { useUnits } from "../../../hooks/useUnits";
import { formatDateRu } from "../../../utils/format";
import { DeficitForecastAlert } from "../../../modules/nutrition/forecast/DeficitForecastAlert";
import { isDeficitOverPlanned } from "../../../modules/nutrition/forecast/formatDeficitAlert";
import { ForecastErrorAlert } from "../../../modules/nutrition/forecast/ForecastErrorAlert";
import { ForecastGoalBanner } from "../../../modules/nutrition/forecast/ForecastGoalBanner";
import { isForecastGoalReached } from "../../../modules/nutrition/forecast/forecastGoalStatus";
import { forecastHasChartSource } from "../../../modules/nutrition/forecast/forecastChartData";
import { CUT_BALANCE_PERIOD_LABEL } from "../../../modules/nutrition/cutBulk/balancePeriod";
import {
  CutDeficitControlStats,
  CutDeficitLimitField,
} from "../../../modules/nutrition/cutBulk/CutDeficitControlPanel";
import { useCutDeficitControl } from "../../../modules/nutrition/cutBulk/useCutDeficitControl";
import { useNutritionGoalProjection } from "../useNutritionGoalProjection";
import { cn } from "../../../lib/utils";
import "./goal-projection.css";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateRu(String(iso).slice(0, 10));
}

function MetricCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))] truncate">
        {label}
      </p>
      <p className={cn("text-sm font-semibold tabular-nums leading-tight mt-0.5", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

export function GoalProjectionPanel({
  phase,
  preferChest,
  snap,
}: {
  phase: FoodPhase;
  preferChest: boolean;
  snap: CutBulkSnapshot | null;
}) {
  const { formatEnergy, formatBodyWeight, formatDeficitPerKgFat } = useUnits();
  const {
    weight,
    bf,
    targetWeight,
    setTargetWeight,
    targetBf,
    setTargetBf,
    useTargetBf,
    setUseTargetBf,
    forecast,
    forecastError,
    forecastLoading,
    forecastBlockedReason,
    cutGoalValidation,
    savedPlan,
    planLoading,
    periodLabel,
    refetchForecast,
    saveGoalsPending,
    targetBfRequired,
    targetBfValidation,
  } = useNutritionGoalProjection(phase, snap, preferChest);

  const deficitControl = useCutDeficitControl(preferChest);

  const hasBody = weight != null;

  if (!hasBody) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Укажите вес и % жира в разделе «Тело» — тогда можно сохранить цель и построить прогноз.
      </p>
    );
  }

  const balanceLabel =
    forecast && forecast.daily_surplus_or_deficit < 0 ? "дефицит" : "профицит";

  const realPerKg =
    forecast?.average_real_deficit_per_kg_fat ?? forecast?.observed_deficit_per_kg_fat;
  const targetPerKg = forecast?.target_deficit_per_kg_fat ?? forecast?.max_deficit_per_kg_fat;

  const showDeficitAlert =
    phase === "cut" &&
    forecast &&
    ((forecast.deficit_status && forecast.deficit_status !== "safe") ||
      isDeficitOverPlanned(forecast));

  return (
    <div className="goal-projection-panel">
      <div className="goal-projection-panel__layout">
        <div className="goal-projection-panel__controls space-y-2">
      <div className="rounded-xl border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            Цель
          </h3>
          {saveGoalsPending && (
            <span className="text-[10px] text-[rgb(var(--app-text-muted))] flex items-center gap-1">
              <Save className="h-3 w-3" /> сохранение…
            </span>
          )}
        </div>

        {planLoading ? (
          <Skeleton className="h-12 w-full rounded-md" />
        ) : (
          <div className="goal-projection-fields">
            <div
              className={cn(
                "goal-projection-fields__grid",
                phase === "cut"
                  ? "goal-projection-fields__grid--cut"
                  : "goal-projection-fields__grid--bulk",
              )}
            >
            <label className="goal-projection-field text-xs min-w-0">
              <span className="goal-projection-field__label">Целевой вес, кг</span>
              <input
                type="number"
                step="0.1"
                min={phase === "cut" ? 30 : weight + 0.1}
                max={phase === "bulk" ? 300 : weight - 0.1}
                value={targetWeight ?? ""}
                onChange={(e) => setTargetWeight(Number(e.target.value))}
                className="input-field mt-0.5 !min-h-8 !py-1.5 !text-sm"
              />
            </label>
            <div className="goal-projection-field text-xs min-w-0">
              {targetBfRequired ? (
                <label className="block min-w-0">
                  <span className="goal-projection-field__label">
                    <span>
                      Целевой % жира <span className="text-rose-500">*</span>
                    </span>
                    <span className="font-normal normal-case tracking-normal mt-0.5">
                      Сейчас {bf!.toFixed(1)}%
                    </span>
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min={3}
                    max={60}
                    required
                    value={targetBf}
                    onChange={(e) => setTargetBf(e.target.value)}
                    className={cn(
                      "input-field w-full mt-0.5 !min-h-8 !py-1.5 !text-sm",
                      !targetBfValidation.valid && "border-rose-400 dark:border-rose-600",
                    )}
                  />
                  {!targetBfValidation.valid && targetBfValidation.message && (
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                      {targetBfValidation.message}
                    </p>
                  )}
                  {targetBfValidation.valid &&
                    cutGoalValidation.message &&
                    !cutGoalValidation.valid && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5 leading-snug">
                        {cutGoalValidation.message}
                      </p>
                    )}
                </label>
              ) : (
                <div className="space-y-1">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={useTargetBf}
                      onChange={(e) => setUseTargetBf(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Целевой % жира
                  </label>
                  {useTargetBf ? (
                    <input
                      type="number"
                      step="0.1"
                      min={3}
                      max={60}
                      value={targetBf}
                      onChange={(e) => setTargetBf(e.target.value)}
                      className="input-field w-full !min-h-8 !py-1.5 !text-sm"
                    />
                  ) : null}
                </div>
              )}
            </div>
            {phase === "cut" ? (
              <CutDeficitLimitField preferChest={preferChest} control={deficitControl} />
            ) : null}
            </div>
            {savedPlan?.updated_at &&
            savedPlan.target_weight_kg != null &&
            (!forecast || !isForecastGoalReached(forecast, phase)) ? (
              <p className="goal-projection-fields__saved">
                Цель сохранена:{" "}
                <span className="font-medium text-[rgb(var(--app-text))]">
                  {fmtDate(savedPlan.updated_at)}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>

      {phase === "cut" ? (
        <CutDeficitControlStats preferChest={preferChest} control={deficitControl} />
      ) : null}
        </div>

      <div className="goal-projection-panel__forecast space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[rgb(var(--app-text))]">Прогноз до цели</h3>
            <p className="text-[10px] text-[rgb(var(--app-text-muted))] truncate">
              {phase === "cut"
                ? `По фактическому дефициту · ${forecast?.balance_period_label ?? CUT_BALANCE_PERIOD_LABEL}`
                : `По балансу калорий · ${periodLabel}`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            disabled={forecastLoading || Boolean(forecastBlockedReason)}
            onClick={() => refetchForecast()}
            title="Пересчитать"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", forecastLoading && "animate-spin")} />
          </Button>
        </div>

        {targetBfRequired && !targetBfValidation.valid && !forecastLoading && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Укажите корректный целевой % жира для расчёта.
          </p>
        )}

        {forecastBlockedReason && !forecast && (
          <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 border-l-2 border-l-amber-500 pl-2 leading-snug">
            {forecastBlockedReason}
          </p>
        )}

        {forecastLoading && (
          <div className="space-y-1.5">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-64 w-full rounded-md" />
          </div>
        )}

        {forecastError && !forecastLoading && (
          <ForecastErrorAlert error={forecastError} compact />
        )}

        {forecast && (
          <>
            {showDeficitAlert ? <DeficitForecastAlert forecast={forecast} compact /> : null}

            <ForecastGoalBanner forecast={forecast} phase={phase} />

            {forecastHasChartSource(forecast) ? (
              <ChartContainer title="Прогноз веса" height="lg">
                <WeightProjectionChart
                  forecast={forecast}
                  plan={savedPlan}
                  tall
                  showCaption
                  className="h-full"
                />
              </ChartContainer>
            ) : (
              <p className="text-[11px] text-[rgb(var(--app-text-muted))] px-0.5">
                Прогноз рассчитан, но для графика не хватает точек — проверьте цель по весу и % жира.
              </p>
            )}

            {forecast.dynamic_explanation && (
              <p className="text-[11px] text-[rgb(var(--app-text-muted))] leading-snug px-0.5">
                {forecast.dynamic_explanation}
              </p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 rounded-xl border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface-subtle)/0.3)] p-3">
              <MetricCell
                label="Потребление"
                value={`${formatEnergy(forecast.average_daily_calorie_intake)}/д`}
              />
              <MetricCell
                label="Расход"
                value={`${formatEnergy(forecast.average_daily_expenditure)}/д`}
              />
              <MetricCell
                label={balanceLabel.charAt(0).toUpperCase() + balanceLabel.slice(1)}
                value={`${forecast.daily_surplus_or_deficit > 0 ? "+" : ""}${formatEnergy(forecast.daily_surplus_or_deficit)}/д`}
                valueClassName={
                  forecast.daily_surplus_or_deficit < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }
              />
              <MetricCell
                label="Целевой вес"
                value={formatBodyWeight(forecast.target_weight_kg)}
              />
            </div>

            {forecast.model === "dynamic_cut" && realPerKg != null && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] px-0.5 tabular-nums">
                <span>
                  <span className="text-[rgb(var(--app-text-muted))]">Факт </span>
                  <span className="font-semibold">{formatDeficitPerKgFat(realPerKg)}</span>
                </span>
                <span>
                  <span className="text-[rgb(var(--app-text-muted))]">План </span>
                  <span className="font-semibold">
                    {targetPerKg != null ? formatDeficitPerKgFat(targetPerKg) : "—"}
                  </span>
                </span>
                {forecast.real_avg_deficit_per_day != null && (
                  <span className="text-[rgb(var(--app-text-muted))]">
                    {formatEnergy(forecast.real_avg_deficit_per_day)}/день
                    {forecast.days_missing != null && forecast.days_missing > 0
                      ? ` · ${forecast.days_missing} дн. без записей`
                      : ""}
                  </span>
                )}
              </div>
            )}

            {forecast.fat_goal_achievable === false && forecast.body_fat_note && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 border-l-2 border-l-amber-500 pl-2">
                {forecast.body_fat_note}
              </p>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
