import type { ReactNode } from "react";
import { statusClasses } from "./metricStatus";
import type { MetricStatus } from "./types";

export function AnalyticsMetricCard({
  label,
  value,
  unit,
  sub,
  status = "unknown",
  hint,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  status?: MetricStatus;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const cls = statusClasses(status);
  return (
    <div className={`card-metric border ${cls.border} flex flex-col gap-2`}>
      <p className="text-xs text-[rgb(var(--app-text-muted))] uppercase tracking-wide inline-flex items-center gap-1.5">
        {label}
        {hint}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${cls.text}`}>
        {value}
        {unit && <span className="text-sm font-normal text-[rgb(var(--app-text-muted))] ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-[rgb(var(--app-text-muted))] leading-snug">{sub}</p>}
      {children}
    </div>
  );
}
