import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Recharts ResponsiveContainer needs a definite block height, not only min-height. */
const HEIGHT_CLASS = {
  sm: "h-[12rem] min-h-[12rem]",
  md: "h-[14rem] min-h-[14rem]",
  lg: "h-[18rem] min-h-[18rem]",
  hero: "h-[22rem] min-h-[22rem]",
  auto: "min-h-[12rem] h-[12rem]",
} as const;

export type ChartContainerHeight = keyof typeof HEIGHT_CLASS;

export function ChartContainer({
  children,
  title,
  actions,
  height = "md",
  className,
}: {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  height?: ChartContainerHeight;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface))] p-3 shadow-[var(--app-shadow-sm)]",
        className,
      )}
    >
      {title || actions ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title ? (
            typeof title === "string" ? (
              <p className="analytics-label">{title}</p>
            ) : (
              title
            )
          ) : (
            <span />
          )}
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          "w-full min-w-0 desktop-chart-panel relative overflow-hidden",
          HEIGHT_CLASS[height],
        )}
      >
        {children}
      </div>
    </div>
  );
}
