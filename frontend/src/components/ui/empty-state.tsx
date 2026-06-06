import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed",
        "border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface-subtle)/0.35)]",
        className,
      )}
    >
      {Icon ? (
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            borderColor: "rgb(var(--app-border) / 0.85)",
            backgroundColor: "rgb(var(--app-surface))",
            color: "rgb(var(--app-accent))",
          }}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      ) : null}
      <p className="text-base font-semibold text-[rgb(var(--app-text))]">{title}</p>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed max-w-md text-[rgb(var(--app-text-muted))]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

