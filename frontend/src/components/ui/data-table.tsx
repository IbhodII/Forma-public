import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { EmptyState } from "./empty-state";

export function DataTable({
  children,
  className,
  stickyHeader = true,
  tableClassName,
  density = "default",
}: {
  children: ReactNode;
  className?: string;
  stickyHeader?: boolean;
  tableClassName?: string;
  density?: "default" | "compact";
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "w-full max-w-full overflow-x-auto rounded-xl border",
        "border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)]",
        className,
      )}
    >
      <table
        className={cn(
          "w-full min-w-[560px] sm:min-w-0 text-sm text-left border-collapse table-auto",
          compact
            ? "[&_thead_th]:py-2 [&_thead_th]:px-3 [&_thead_th]:text-[11px]"
            : "[&_thead_th]:py-3 [&_thead_th]:px-4 [&_thead_th]:text-xs",
          "[&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:font-semibold [&_thead_th]:text-[rgb(var(--app-text-muted))]",
          compact ? "[&_tbody_td]:py-2 [&_tbody_td]:px-3" : "[&_tbody_td]:py-3 [&_tbody_td]:px-4",
          "[&_tbody_td]:align-middle",
          "[&_thead_th]:whitespace-nowrap [&_tbody_td]:whitespace-nowrap sm:[&_tbody_td]:whitespace-normal",
          "[&_tbody_tr]:border-b [&_tbody_tr]:border-[rgb(var(--app-border)/0.45)] [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-150",
          "[&_tbody_tr:hover]:bg-[rgb(var(--app-surface-subtle)/0.65)]",
          "[&_thead]:bg-[rgb(var(--app-surface-subtle))] [&_thead]:shadow-[inset_0_-1px_0_rgb(var(--app-border)/0.6)]",
          stickyHeader
            ? "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10"
            : "",
          tableClassName,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function DataTableEmptyRow({
  title,
  description,
  action,
  colSpan = 1,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  colSpan?: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="!p-0 !border-0">
        <EmptyState
          title={title}
          description={description}
          action={action}
          className="border-0 rounded-none bg-transparent"
        />
      </td>
    </tr>
  );
}

