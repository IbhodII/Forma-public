import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type StatusBannerTone = "info" | "warning" | "error" | "success";

const TONE_CLASS: Record<StatusBannerTone, string> = {
  info: "border-l-sky-500 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  warning: "border-l-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  error: "border-l-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-100",
  success: "border-l-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
};

export function StatusBanner({
  tone,
  title,
  children,
  icon,
  compact = true,
  className,
  role = "status",
}: {
  tone: StatusBannerTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-lg border border-[rgb(var(--app-border)/0.45)] border-l-[3px]",
        compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm",
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="flex gap-2">
        {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
        <div className="min-w-0 flex-1 space-y-1">
          {title ? <p className="font-medium leading-snug">{title}</p> : null}
          {children ? <div className="leading-snug opacity-95">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function StatusBannerList({
  tone,
  items,
  className,
}: {
  tone: StatusBannerTone;
  items: ReactNode[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <StatusBanner tone={tone} className={className}>
      <ul className="space-y-0.5">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </StatusBanner>
  );
}
