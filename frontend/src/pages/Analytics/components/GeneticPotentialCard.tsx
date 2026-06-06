import { useQuery } from "@tanstack/react-query";
import { fetchGeneticLimit } from "../../../api/body";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { useUnits } from "../../../hooks/useUnits";
import { formatDateRu } from "../../../utils/format";
import { parseApiError } from "../../../utils/validation";
import { GENETIC_POTENTIAL_DISCLAIMER, GENETIC_POTENTIAL_HINT } from "../analyticsHints";
import { metricCardClasses } from "../utils/metricColors";
import {
  musclePotentialInterpretation,
  muscleRatioColorFromPercent,
} from "../utils/musclePotential";
import { MetricHelp } from "./MetricHelp";

export function GeneticPotentialCard({
  compact = true,
  embedded = false,
  enabled = true,
}: {
  compact?: boolean;
  /** Без отдельной рамки и заголовка — секция уже даёт card-panel. */
  embedded?: boolean;
  enabled?: boolean;
}) {
  const { formatWeight } = useUnits();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.bodyGeneticLimit,
    queryFn: fetchGeneticLimit,
    enabled,
  });

  const title = (
    <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))] inline-flex items-center gap-1.5">
      Генетический предел
      <MetricHelp hint={GENETIC_POTENTIAL_HINT} />
    </p>
  );

  const shell = embedded ? "" : compact ? "analytics-nested-block" : "card-panel analytics-panel min-w-0";

  if (isLoading) {
    return (
      <div className={`${shell} flex flex-col justify-center min-h-[7rem]`.trim()}>
        {!embedded ? title : null}
        <Loader label="Предел…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={shell || undefined}>
        <ErrorAlert message={parseApiError(error)} />
      </div>
    );
  }

  if (!data) return null;

  if (data.status === "no_height" || data.status === "no_body") {
    return (
      <div className={`${shell} border-dashed`.trim()}>
        {!embedded ? title : null}
        <p className="text-sm text-[rgb(var(--app-text-muted))] mt-2 leading-snug">{data.message}</p>
        {data.status === "no_body" && data.max_lean_mass != null && (
          <p className="text-xs text-[rgb(var(--app-text-muted))] mt-2 tabular-nums">
            макс. ≈ {formatWeight(data.max_lean_mass)} (FFMI {data.ffmi_limit ?? 25})
          </p>
        )}
      </div>
    );
  }

  const percent = data.percent ?? 0;
  const fmtMass = (kg: number | null | undefined) =>
    kg != null && Number.isFinite(kg) ? formatWeight(kg) : "—";
  const colorLevel = muscleRatioColorFromPercent(percent);
  const { value, border } = metricCardClasses(colorLevel);
  const barWidth = Math.min(percent, 100);
  const interpretation =
    data.interpretation ?? musclePotentialInterpretation(percent / 100);

  const barColor =
    colorLevel === "green"
      ? "bg-emerald-500"
      : colorLevel === "yellow"
        ? "bg-amber-500"
        : colorLevel === "red"
          ? "bg-rose-500"
          : "bg-[rgb(var(--app-accent))]";

  return (
    <div className={`${embedded ? "" : `${shell} ${border}`}`.trim()}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
        <div className="shrink-0 sm:w-28">
          {!embedded ? title : null}
          <p className={`text-3xl font-bold tabular-nums mt-1 ${value}`}>{percent}%</p>
          <p className="text-[10px] text-[rgb(var(--app-text-muted))] mt-0.5 leading-snug line-clamp-2">
            {interpretation}
          </p>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex justify-between text-xs text-[rgb(var(--app-text-muted))] tabular-nums gap-2">
            <span>{fmtMass(data.lean_mass)}</span>
            <span>{fmtMass(data.max_lean_mass)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
              style={{ width: `${barWidth}%` }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-500/5 dark:bg-slate-800/50 px-2 py-1.5">
              <p className="text-[rgb(var(--app-text-muted))]">Сухая масса</p>
              <p className="font-semibold tabular-nums mt-0.5">{fmtMass(data.lean_mass)}</p>
            </div>
            <div className="rounded-lg bg-slate-500/5 dark:bg-slate-800/50 px-2 py-1.5">
              <p className="text-[rgb(var(--app-text-muted))]">До предела</p>
              <p className="font-semibold tabular-nums mt-0.5">{fmtMass(data.remaining_kg)}</p>
            </div>
            <div className="rounded-lg bg-slate-500/5 dark:bg-slate-800/50 px-2 py-1.5">
              <p className="text-[rgb(var(--app-text-muted))]">FFMI {data.ffmi_limit ?? 25}</p>
              <p className="font-semibold tabular-nums mt-0.5">{fmtMass(data.max_lean_mass)}</p>
            </div>
          </div>
        </div>
      </div>

      {(data.weight_date || data.body_fat_date) && (
        <p className="text-[10px] mt-3 text-[rgb(var(--app-text-muted))] leading-snug">
          {data.weight_kg != null && data.weight_date && (
            <span>
              вес {formatWeight(data.weight_kg)} — {formatDateRu(data.weight_date)}
            </span>
          )}
          {data.weight_date && data.body_fat_date && data.weight_date !== data.body_fat_date && (
            <span> · </span>
          )}
          {data.body_fat_percent != null && data.body_fat_date && (
            <span>
              {data.body_fat_percent}% жира — {formatDateRu(data.body_fat_date)}
            </span>
          )}
        </p>
      )}
      <p className="text-[10px] mt-1.5 text-[rgb(var(--app-text-muted))]/80 leading-snug line-clamp-2">
        {data.disclaimer || GENETIC_POTENTIAL_DISCLAIMER}
      </p>
    </div>
  );
}
