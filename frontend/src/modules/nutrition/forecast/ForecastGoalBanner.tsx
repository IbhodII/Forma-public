import { cn } from "../../../lib/utils";
import { StatusBanner } from "../../../components/analytics/StatusBanner";
import type { NutritionForecastResult } from "../../../api/cutBulk";
import { formatDateRu } from "../../../utils/format";
import {
  forecastWeeksHint,
  isForecastGoalReached,
} from "./forecastGoalStatus";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateRu(String(iso).slice(0, 10));
}

export function ForecastGoalBanner({
  forecast,
  phase,
  className,
}: {
  forecast: NutritionForecastResult;
  phase: "cut" | "bulk";
  className?: string;
}) {
  const reached = isForecastGoalReached(forecast, phase);

  if (reached) {
    return (
      <StatusBanner tone="success" title="Цель достигнута" className={className}>
        {forecast.goal_reached_message ? (
          <p>{forecast.goal_reached_message.replace(/^[✓✔]\s*/u, "")}</p>
        ) : (
          <p>Текущий вес соответствует целевому.</p>
        )}
      </StatusBanner>
    );
  }

  const pendingLabel =
    phase === "cut"
      ? "При текущем дефиците цель будет достигнута"
      : "При текущем профиците цель будет достигнута";

  const weeksMeta =
    forecastWeeksHint(forecast) +
    (forecast.model === "dynamic_cut" &&
    forecast.linear_weeks_to_target != null &&
    forecast.weeks_to_target > forecast.linear_weeks_to_target
      ? ` · линейно ~${forecast.linear_weeks_to_target.toFixed(1)} нед.`
      : "");

  return (
    <StatusBanner tone="warning" className={cn("text-xs", className)}>
      <p className="leading-snug">
        <span className="font-medium">{pendingLabel}</span>
        {" · "}
        <span className="font-semibold tabular-nums">{fmtDate(forecast.target_date)}</span>
        {" · "}
        <span className="tabular-nums">{weeksMeta}</span>
      </p>
    </StatusBanner>
  );
}
