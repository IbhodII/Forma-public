import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type AppPageWidth = "default" | "medium" | "narrow" | "wide" | "fluid";

export function AppPageShell({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: AppPageWidth;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "app-page-shell",
        width === "medium" && "app-page-shell--medium",
        width === "narrow" && "app-page-shell--narrow",
        width === "wide" && "app-page-shell--wide",
        width === "fluid" && "app-page-shell--fluid",
        className,
      )}
    >
      {children}
    </div>
  );
}
