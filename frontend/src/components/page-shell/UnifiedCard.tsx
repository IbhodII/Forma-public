import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/utils";

type CardVariant = "panel" | "metric" | "nested" | "flat";

export function UnifiedCard({
  children,
  variant = "panel",
  interactive = false,
  className,
  as,
}: {
  children: ReactNode;
  variant?: CardVariant;
  interactive?: boolean;
  className?: string;
  as?: ElementType;
}) {
  const Comp = as ?? "div";
  return (
    <Comp
      className={cn(
        variant === "panel" && "card-panel",
        variant === "metric" && "card-metric",
        variant === "nested" && "unified-card unified-card--nested",
        variant === "flat" && "unified-card unified-card--flat",
        interactive && "unified-card--interactive",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
