import type { MetricStatus } from "../../modules/nutrition/analytics/types";
import { AnalyticsMetricCard } from "../../modules/nutrition/analytics/AnalyticsMetricCard";
import { useUnits } from "../../hooks/useUnits";
import { kcalToIcharge } from "../../utils/americanUnits";
import { fmt } from "./NutritionCharts";

const SAFE_MAX = 35;
const EXTREME_MAX = 75;

export interface DeficitPerKgFatResult {
  fatKg: number | null;
  deficitKcal: number | null;
  value: number | null;
  status: MetricStatus;
}

export function computeDeficitPerKgFat(
  expenditureKcal: number | null | undefined,
  intakeKcal: number | null | undefined,
  weightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined,
): DeficitPerKgFatResult | null {
  if (bodyFatPercent == null || weightKg == null || weightKg <= 0 || bodyFatPercent < 0) {
    return null;
  }
  const fatKg = weightKg * (bodyFatPercent / 100);
  if (fatKg <= 0) return null;

  if (expenditureKcal == null || intakeKcal == null) {
    return { fatKg, deficitKcal: null, value: null, status: "unknown" };
  }

  const deficitKcal = expenditureKcal - intakeKcal;
  const value = deficitKcal > 0 ? deficitKcal / fatKg : 0;

  let status: MetricStatus = "ok";
  if (value >= EXTREME_MAX) status = "danger";
  else if (value >= SAFE_MAX) status = "caution";

  return {
    fatKg,
    deficitKcal,
    value: Math.round(value * 10) / 10,
    status,
  };
}

function WarningIcon() {
  return (
    <span className="text-rose-600 dark:text-rose-400" title="Очень высокий дефицит" aria-hidden>
      ⚠
    </span>
  );
}

const CAPTION =
  "ккал дефицита на кг жира в день. Рекомендуемый максимум для сохранения мышц – 35, теоретический предел – 75.";

export function DeficitPerKgFatCard({
  expenditureKcal,
  intakeKcal,
  weightKg,
  bodyFatPercent,
  title = "Ккал / кг жира / день",
}: {
  expenditureKcal: number | null | undefined;
  intakeKcal: number | null | undefined;
  weightKg: number | null | undefined;
  bodyFatPercent: number | null | undefined;
  title?: string;
}) {
  const { system } = useUnits();
  const result = computeDeficitPerKgFat(expenditureKcal, intakeKcal, weightKg, bodyFatPercent);
  const displayValue =
    result?.value != null
      ? system === "american"
        ? kcalToIcharge(result.value).toFixed(1)
        : fmt(result.value)
      : null;
  const unit = system === "american" ? "iCharge/кг жира" : "ккал/кг жира";

  if (result == null) {
    return (
      <div className="rounded-lg border border-dashed border-[rgb(var(--app-border))] px-4 py-3 text-sm text-[rgb(var(--app-text-muted))]">
        Укажите процент жира в разделе «Тело», чтобы рассчитать дефицит на кг жира.
      </div>
    );
  }

  return (
    <AnalyticsMetricCard
      label={title}
      value={displayValue ?? "—"}
      unit={unit}
      status={result.status}
      hint={result.status === "danger" ? <WarningIcon /> : undefined}
      sub={CAPTION}
    />
  );
}
