import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HcBarChart } from "../../../HealthConnect/components/HcBarChart";
import { BodyOverviewChartCardLink } from "./BodyOverviewHeroMetric";

export function BodyOverviewChartCard({
  title,
  description,
  linkTo,
  linkLabel,
  series,
  valueLabel,
  color,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyHint,
  className,
  children,
}: {
  title: string;
  description?: string;
  linkTo: string;
  linkLabel: string;
  series?: Array<{ date: string; value: number }>;
  valueLabel?: string;
  color?: string;
  emptyIcon?: LucideIcon;
  emptyTitle: string;
  emptyHint: string;
  className?: string;
  children?: ReactNode;
}) {
  const hasSeries = (series?.length ?? 0) > 0;
  const hasChildren = Boolean(children);
  const showBarChart = !hasChildren && hasSeries && series && valueLabel;
  const showEmpty = !hasChildren && !hasSeries;

  return (
    <article className={`body-overview-chart-card ${className ?? ""}`}>
      <header className="body-overview-chart-card__head">
        <div>
          <h3 className="body-overview-chart-card__title">{title}</h3>
          {description ? <p className="body-overview-chart-card__desc">{description}</p> : null}
        </div>
        <BodyOverviewChartCardLink to={linkTo} label={linkLabel} />
      </header>
      <div className="body-overview-chart-card__body">
        {children}
        {showBarChart ? (
          <HcBarChart title="" series={series} valueLabel={valueLabel} color={color} />
        ) : null}
        {showEmpty ? (
          <div className="body-overview-empty">
            {EmptyIcon ? <EmptyIcon className="body-overview-empty__icon" /> : null}
            <p className="body-overview-empty__title">{emptyTitle}</p>
            <p className="body-overview-empty__hint">{emptyHint}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
