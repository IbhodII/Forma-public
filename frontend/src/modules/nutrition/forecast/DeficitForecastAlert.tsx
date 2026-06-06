import { AlertTriangle } from "lucide-react";
import { StatusBanner } from "../../../components/analytics/StatusBanner";
import { formatForecastDeficitAlert, isDeficitOverPlanned } from "./formatDeficitAlert";
import type { NutritionForecastResult } from "../../../api/cutBulk";

export function DeficitForecastAlert({
  forecast,
  compact = false,
}: {
  forecast: NutritionForecastResult;
  compact?: boolean;
}) {
  const status = forecast.deficit_status ?? "safe";
  const overPlanned = isDeficitOverPlanned(forecast);

  if (status === "safe" && !overPlanned) {
    return null;
  }

  const lines = formatForecastDeficitAlert(forecast);
  if (lines.length === 0) return null;

  const tone = status === "danger" || overPlanned ? "error" : "warning";
  const primary = lines[0];
  const rest = lines.slice(1);

  return (
    <StatusBanner
      tone={tone}
      role="alert"
      compact={compact}
      icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
    >
      <p className={compact ? "text-[11px]" : "text-xs"}>
        <span className="font-medium">{primary}</span>
        {rest.length > 0 ? (
          <span className="font-normal text-[rgb(var(--app-text-muted))]"> {rest.join(" ")}</span>
        ) : null}
      </p>
      {forecast.deficit_capped_at_start && status === "danger" ? (
        <p className={compact ? "text-[10px]" : "text-[11px] text-[rgb(var(--app-text-muted))] mt-0.5"}>
          Прогноз учитывает физиологический потолок дефицита.
        </p>
      ) : null}
    </StatusBanner>
  );
}
