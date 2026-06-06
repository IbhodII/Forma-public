import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function HeroStatsRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hero-stats-row", className)}>{children}</div>;
}
