import { AlertTriangle } from "lucide-react";
import { StatusBanner } from "../analytics/StatusBanner";
import type { SourceConflict } from "../../utils/workoutSources";
import { metricLabel } from "../../utils/workoutSources";

export function SourceConflictBanner({ conflicts }: { conflicts: SourceConflict[] }) {
  if (!conflicts.length) return null;

  return (
    <StatusBanner
      tone="warning"
      title="Конфликт источников данных"
      icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
    >
      <ul className="space-y-0.5 text-xs">
        {conflicts.map((c) => (
          <li key={c.metric}>
            <span className="font-medium">{metricLabel(c.metric)}:</span>{" "}
            {c.values.map((v, i) => (
              <span key={v.source_type}>
                {i > 0 ? " vs " : ""}
                {v.label} {v.value} kcal
              </span>
            ))}
          </li>
        ))}
      </ul>
    </StatusBanner>
  );
}
