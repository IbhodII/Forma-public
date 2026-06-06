import { cn } from "../lib/utils";

export function Loader({
  label = "Загрузка…",
  className,
  compact = false,
}: {
  label?: string;
  className?: string;
  /** Меньше вертикальных отступов (внутри карточек и таблиц). */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-[rgb(var(--app-text-muted))]",
        compact ? "py-6" : "py-12",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[rgb(var(--app-accent))] border-t-transparent"
        aria-hidden
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
