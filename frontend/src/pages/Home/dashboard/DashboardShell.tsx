import { Link } from "react-router-dom";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Skeleton } from "../../../components/ui/skeleton";
import "./dashboard.css";

export type DashboardCardVariant = "primary" | "compact";

export function DashboardSection({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title ? (
        <header className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            {eyebrow ? (
              <p className="dashboard-panel__eyebrow">{eyebrow}</p>
            ) : null}
            <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">{title}</h2>
          </div>
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function DashboardCardShell({
  title,
  eyebrow,
  children,
  loading,
  error,
  action,
  variant = "compact",
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  action?: React.ReactNode;
  variant?: DashboardCardVariant;
  className?: string;
}) {
  const isPrimary = variant === "primary";

  return (
    <article
      className={`dashboard-card card-panel h-full ${isPrimary ? "!p-4" : "!p-3"} ${className}`}
    >
      <div className={`flex items-start justify-between gap-2 ${isPrimary ? "mb-3" : "mb-2"}`}>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider analytics-label">
              {eyebrow}
            </p>
          ) : null}
          <h2
            className={`font-semibold text-[rgb(var(--app-text))] ${
              isPrimary ? "text-sm" : "text-xs"
            }`}
          >
            {title}
          </h2>
        </div>
        {action}
      </div>
      {loading ? <DashboardCardSkeleton variant={variant} /> : null}
      {error ? <ErrorAlert message={error} /> : null}
      {!loading && !error ? children : null}
    </article>
  );
}

export function DashboardCardSkeleton({ variant = "compact" }: { variant?: DashboardCardVariant }) {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className={`w-2/3 ${variant === "primary" ? "h-8" : "h-6"}`} />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function DashboardHeroSkeleton() {
  return (
    <div className="dashboard-v2__hero" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="dashboard-metric-tile">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-2 h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

export type DashboardMetricAccent =
  | "calories"
  | "steps"
  | "recovery"
  | "sleep"
  | "weight"
  | "workout";

export function DashboardMiniSparkline({
  series,
  valueKey,
  variant = "default",
}: {
  series: Array<{ date: string; steps?: number; weight_kg?: number }>;
  valueKey: "steps" | "weight_kg";
  variant?: "default" | "weight" | "steps";
}) {
  if (!series.length) return null;
  const values = series.map((p) => Number(p[valueKey] ?? 0));
  const max = Math.max(...values, 1);
  const sparkClass =
    variant === "weight"
      ? "dashboard-sparkline dashboard-sparkline--weight"
      : variant === "steps"
        ? "dashboard-sparkline dashboard-sparkline--steps"
        : "dashboard-sparkline";
  return (
    <div className={`dashboard-metric-tile__spark ${sparkClass}`} aria-hidden>
      {series.map((p) => (
        <div
          key={p.date}
          className="dashboard-sparkline__bar"
          style={{
            height: `${Math.max(10, (Number(p[valueKey] ?? 0) / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}

export function DashboardMetricTile({
  label,
  value,
  sub,
  tag,
  href,
  progress,
  progressVariant = "calories",
  icon,
  sparkline,
  accent,
  valueClassName = "",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tag?: React.ReactNode;
  href?: string;
  progress?: number | null;
  progressVariant?: "calories" | "steps";
  icon?: React.ReactNode;
  sparkline?: React.ReactNode;
  accent?: DashboardMetricAccent;
  valueClassName?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="dashboard-metric-tile__top">
        <span className="dashboard-metric-tile__label">{label}</span>
        {icon ? <span className="dashboard-metric-tile__icon-wrap">{icon}</span> : null}
      </div>
      <span className={`dashboard-metric-tile__value ${valueClassName}`}>{value}</span>
      {sub ? <span className="dashboard-metric-tile__sub">{sub}</span> : null}
      {tag ? <span className="dashboard-metric-tile__tag dashboard-metric-tile__tag--ok">{tag}</span> : null}
      {sparkline}
      {progress != null && Number.isFinite(progress) ? (
        <div
          className={`dashboard-metric-tile__progress dashboard-metric-tile__progress--${progressVariant}`}
          aria-hidden
        >
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
    </>
  );

  const accentClass = accent ? `dashboard-metric-tile--accent-${accent}` : "";
  const className = `dashboard-metric-tile ${accentClass} ${href ? "dashboard-metric-tile--link" : ""}`;

  if (href) {
    return (
      <Link to={href} className={className}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={`${className} text-left`} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

export function DashboardPanel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`dashboard-panel dashboard-panel--glass ${className}`}>
      <div className="dashboard-panel__header">
        <div className="min-w-0">
          {eyebrow ? <p className="dashboard-panel__eyebrow">{eyebrow}</p> : null}
          <h2 className="dashboard-panel__title">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function DashboardPanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="dashboard-panel space-y-3" aria-hidden>
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

/** Крупное число для primary-карточек (legacy cards) */
export function DashboardHeroMetric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 text-center sm:text-left">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))]">
        {label}
      </p>
      <p
        className={`mt-0.5 tabular-nums font-bold leading-none ${
          accent ? "text-[rgb(var(--app-accent))]" : "text-[rgb(var(--app-text))]"
        } text-2xl sm:text-3xl`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))] tabular-nums">{sub}</p>
      ) : null}
    </div>
  );
}
