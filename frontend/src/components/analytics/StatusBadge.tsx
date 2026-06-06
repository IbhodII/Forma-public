import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type StatusBadgeTone = "neutral" | "info" | "warning" | "success" | "accent";

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: "bg-[rgb(var(--app-surface-subtle))] text-[rgb(var(--app-text-muted))] border-[rgb(var(--app-border)/0.6)]",
  info: "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/25",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/25",
  success: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/25",
  accent: "bg-[rgb(var(--app-accent)/0.12)] text-[rgb(var(--app-accent))] border-[rgb(var(--app-accent)/0.25)]",
};

const SIZE_CLASS = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-[11px]",
} as const;

export function StatusBadge({
  children,
  tone = "neutral",
  size = "sm",
  className,
  title,
}: {
  children: ReactNode;
  tone?: StatusBadgeTone;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border font-medium leading-none",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
