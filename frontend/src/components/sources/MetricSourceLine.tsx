import { WorkoutSourceBadge } from "./WorkoutSourceBadge";
import { metricLabel } from "../../utils/workoutSources";

export function MetricSourceLine({
  metric,
  effectiveLabel,
  effectiveSource,
  isFallback,
  fallbackLabels,
}: {
  metric: string;
  effectiveLabel?: string | null;
  effectiveSource?: string | null;
  isFallback?: boolean;
  fallbackLabels?: string[];
}) {
  if (!effectiveLabel && !effectiveSource) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--app-text-muted))]">
      <span className="font-medium text-[rgb(var(--app-text))]">{metricLabel(metric)}:</span>
      <WorkoutSourceBadge sourceType={effectiveSource} label={effectiveLabel} />
      {isFallback && fallbackLabels?.length ? (
        <span className="text-[10px] sm:text-xs">
          fallback: {fallbackLabels.join(", ")}
        </span>
      ) : null}
    </div>
  );
}
