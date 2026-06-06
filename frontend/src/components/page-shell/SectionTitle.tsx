import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function SectionTitle({
  children,
  as: Comp = "h3",
  size = "default",
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <Comp className={cn("section-title", size === "lg" && "section-title--lg", className)}>
      {children}
    </Comp>
  );
}
