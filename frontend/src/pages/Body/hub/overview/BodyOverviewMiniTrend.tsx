import { BodyOverviewWeightSparkline } from "./BodyOverviewWeightSparkline";
import { sparkTrendFromValues } from "./bodyOverviewUtils";

export function BodyOverviewMiniTrend({
  eyebrow,
  value,
  valueSuffix,
  series,
  color,
  emptyTitle = "Мало данных",
  emptyHint = "Добавьте записи — появится график.",
}: {
  eyebrow: string;
  value: string | null;
  valueSuffix?: string;
  series: number[];
  color: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const trend = sparkTrendFromValues(series);

  if (series.length < 2) {
    return (
      <div className="body-overview-weight-mini body-overview-weight-mini--empty">
        <p className="body-overview-weight-mini__empty-title">{emptyTitle}</p>
        <p className="body-overview-weight-mini__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="body-overview-weight-mini">
      <div className="body-overview-weight-mini__stats">
        <span className="body-overview-weight-mini__eyebrow">{eyebrow}</span>
        {value ? (
          <p className="body-overview-weight-mini__value">
            {value}
            {valueSuffix ? (
              <span className="text-base font-semibold text-[rgb(var(--app-text-muted))] ml-1">
                {valueSuffix}
              </span>
            ) : null}
          </p>
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
        <BodyOverviewWeightSparkline values={series} color={color} />
      </div>
    </div>
  );
}
