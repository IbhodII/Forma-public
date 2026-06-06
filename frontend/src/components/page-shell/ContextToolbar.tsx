import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function ContextToolbar({
  children,
  layout = "stack",
  className,
}: {
  children: ReactNode;
  layout?: "stack" | "row";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "context-toolbar",
        layout === "row" && "context-toolbar--row",
        className,
      )}
    >
      {children}
    </div>
  );
}
