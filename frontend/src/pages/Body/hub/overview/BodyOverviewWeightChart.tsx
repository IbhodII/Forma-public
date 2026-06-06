import { useMemo } from "react";
import type { WeightDashboard } from "../../../../api/weight";
import { useUnits } from "../../../../hooks/useUnits";
import { HEALTH_METRIC } from "../../../../shared/healthMetricColors";
import {
  BODY_OVERVIEW_WEIGHT_DAYS,
  buildWeightSparkline30,
  weightOverview,
  weightSparkTrend30,
} from "./bodyOverviewUtils";
import { BodyOverviewWeightSparkline } from "./BodyOverviewWeightSparkline";

const SPARK_COLOR = HEALTH_METRIC.weight.primary;

export function BodyOverviewWeightChart({
  weight,
  weekStartDay,
}: {
  weight: WeightDashboard;
  weekStartDay: number;
}) {
  const { formatBodyWeight } = useUnits();

  const sparkValues = useMemo(() => buildWeightSparkline30(weight), [weight]);
  const trend = useMemo(() => weightSparkTrend30(sparkValues), [sparkValues]);
  const summary = useMemo(() => weightOverview(weight, weekStartDay), [weight, weekStartDay]);

  const currentLabel =
    summary.current != null ? formatBodyWeight(summary.current) : null;

  if (sparkValues.length < 2) {
    return (
      <div className="body-overview-weight-mini body-overview-weight-mini--empty">
        <p className="body-overview-weight-mini__empty-title">Мало данных за 30 дней</p>
        <p className="body-overview-weight-mini__empty-hint">
          Добавьте вес хотя бы дважды — появится график за последний месяц.
        </p>
      </div>
    );
  }

  return (
    <div className="body-overview-weight-mini">
      <div className="body-overview-weight-mini__stats">
        <span className="body-overview-weight-mini__eyebrow">
          {BODY_OVERVIEW_WEIGHT_DAYS} дней
        </span>
        {currentLabel ? (
          <p className="body-overview-weight-mini__value">{currentLabel}</p>
        ) : null}
        <p
          className={`body-overview-weight-mini__trend ${
            trend.diff == null
              ? ""
              : trend.diff > 0
                ? "body-overview-weight-mini__trend--up"
                : trend.diff < 0
                  ? "body-overview-weight-mini__trend--down"
                  : "body-overview-weight-mini__trend--flat"
          }`}
        >
          {trend.label}
        </p>
      </div>
      <div className="body-overview-weight-mini__spark" aria-hidden>
        <BodyOverviewWeightSparkline values={sparkValues} color={SPARK_COLOR} />
      </div>
    </div>
  );
}
