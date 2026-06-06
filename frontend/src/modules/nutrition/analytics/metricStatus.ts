import type { MetricStatus } from "./types";

export type StatusLevel = "yellow" | "orange" | "danger" | "ok" | "unknown";

const STATUS_MAP: Record<string, { text: string; border: string; bg: string }> = {
  ok: {
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-300 dark:border-emerald-800",
    bg: "bg-emerald-500",
  },
  caution: {
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-300 dark:border-amber-800",
    bg: "bg-amber-500",
  },
  danger: {
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-300 dark:border-rose-800",
    bg: "bg-rose-500",
  },
  unknown: {
    text: "text-[rgb(var(--app-text-muted))]",
    border: "border-[rgb(var(--app-border))]",
    bg: "bg-slate-400",
  },
};

export function statusClasses(status: MetricStatus | string) {
  const key = status === "caution" ? "caution" : status in STATUS_MAP ? status : "unknown";
  return STATUS_MAP[key] ?? STATUS_MAP.unknown;
}

export function warningLevelClasses(level: string) {
  if (level === "danger") return "border-rose-300 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200";
  if (level === "orange") return "border-orange-300 bg-orange-50/80 dark:bg-orange-950/30 text-orange-900 dark:text-orange-100";
  return "border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100";
}
