import { cn } from "../../lib/utils";
import { StatusBadge } from "../analytics/StatusBadge";
import { getSourceDisplay } from "../../utils/workoutSources";

export function WorkoutSourceBadge({
  sourceType,
  label,
  size = "sm",
  className,
}: {
  sourceType?: string | null;
  label?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!sourceType && !label) return null;
  const display = getSourceDisplay(sourceType);
  const text = label || display.shortLabel;

  return (
    <StatusBadge
      tone="neutral"
      size={size === "md" ? "sm" : "xs"}
      className={cn(display.colorClass, size === "md" && "px-2.5 py-1 text-xs", className)}
      title={display.label}
    >
      {text}
    </StatusBadge>
  );
}
