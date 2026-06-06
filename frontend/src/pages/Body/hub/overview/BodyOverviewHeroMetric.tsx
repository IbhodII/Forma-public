import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Sparkline } from "../../components/Sparkline";

type DeltaTone = "up" | "down" | "neutral";

export function BodyOverviewHeroMetric({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  meta,
  delta,
  deltaTone = "neutral",
  sparkValues,
  sparkColor = "#06B6D4",
  to,
  emptyTitle,
  emptyHint,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | null;
  meta?: string;
  delta?: string | null;
  deltaTone?: DeltaTone;
  sparkValues?: number[];
  sparkColor?: string;
  to: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const isEmpty = value == null || value === "";

  const inner = (
    <>
      <div className="body-overview-hero-card__head">
        <div>
          <p className="body-overview-hero-card__label">{label}</p>
          {isEmpty ? (
            <>
              <p className="body-overview-hero-card__empty-title mt-1">
                {emptyTitle ?? "Нет данных"}
              </p>
              {emptyHint ? (
                <p className="body-overview-hero-card__empty-hint mt-0.5">{emptyHint}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="body-overview-hero-card__value mt-0.5">{value}</p>
              {delta ? (
                <p
                  className={`body-overview-hero-card__delta mt-1 body-overview-hero-card__delta--${deltaTone}`}
                >
                  {delta}
                </p>
              ) : null}
              {meta ? <p className="body-overview-hero-card__meta mt-0.5">{meta}</p> : null}
            </>
          )}
        </div>
        <div
          className="body-overview-hero-card__icon"
          style={{ background: iconBg, color: iconColor }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
      {!isEmpty && sparkValues && sparkValues.length >= 2 ? (
        <Sparkline values={sparkValues} color={sparkColor} className="body-overview-hero-card__spark" />
      ) : null}
    </>
  );

  return (
    <Link
      to={to}
      className={`body-overview-hero-card body-overview-hero-card--link${isEmpty ? " body-overview-hero-card--empty" : ""}`}
    >
      {inner}
    </Link>
  );
}

export function BodyOverviewChartCardLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="body-overview-chart-card__link">
      {label}
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}
