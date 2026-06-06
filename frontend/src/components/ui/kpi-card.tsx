import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  valueClassName,
  children,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: string;
  delta?: ReactNode;
  deltaTone?: "up" | "down" | "neutral";
  valueClassName?: string;
  children?: ReactNode;
  className?: string;
}) {
  const deltaClass =
    deltaTone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : deltaTone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-[rgb(var(--app-text-muted))]";

  return (
    <div className={cn("card-metric flex flex-col gap-2 min-w-0", className)}>
      <p className="min-w-0 max-w-full text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight text-[rgb(var(--app-text))]",
          valueClassName,
        )}
      >
        {value}
      </p>
      {delta != null ? <p className={cn("text-xs font-medium tabular-nums", deltaClass)}>{delta}</p> : null}
      {sub ? <p className="text-xs text-[rgb(var(--app-text-muted))] leading-snug">{sub}</p> : null}
      {children ? <div className="mt-auto pt-1">{children}</div> : null}
    </div>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-3", className)}>
      {children}
    </div>
  );
}

