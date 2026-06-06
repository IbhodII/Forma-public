import {
  ChevronDown,
  Gauge,
  Heart,
  MapPin,
  Pencil,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import type { CardioWorkout } from "../../../types";
import {
  CardioWorkoutPanel,
  bikeRowMetrics,
  cardioSecondarySummary,
} from "../../CardioWorkoutPanel";
import { WorkoutCategoryIcon } from "../../fitness/WorkoutCategoryIcon";
import { CARDIO_BIKE, CARDIO_POOL, cardioTypeLabel } from "../../../utils/constants";
import { chestStrapKcal, formatDateRu, formatDuration } from "../../../utils/format";
import { cardioVisual } from "../../../utils/workoutVisuals";
import { legacyDataSourceToType } from "../../../utils/workoutSources";
import type { UnitsFormatters } from "../../../hooks/useUnits";
import { cn } from "../../../lib/utils";
import { WorkoutSourceBadge } from "../../sources/WorkoutSourceBadge";

type CardioUnits = Pick<
  UnitsFormatters,
  "formatSpeed" | "formatSwimSpeed" | "formatPace" | "formatEnergy" | "formatDistance"
>;

export function CardioWorkoutCard({
  workout,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  readOnly,
  units,
  availability,
}: {
  workout: CardioWorkout;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  units: CardioUnits;
  availability: { has_hr: boolean; has_gps: boolean; has_sensors: boolean };
}) {
  const visual = cardioVisual(workout.type);
  const isBike = workout.type === CARDIO_BIKE;
  const isPool = workout.type === CARDIO_POOL;
  const bike = isBike ? bikeRowMetrics(workout, units) : null;
  const chestKcal = chestStrapKcal(workout);

  return (
    <article
      className={cn(
        "rounded-2xl border overflow-hidden transition-all duration-200",
        "bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)]",
        expanded
          ? "border-[rgb(var(--app-accent)/0.35)] ring-1 ring-[rgb(var(--app-accent)/0.15)]"
          : "border-[rgb(var(--app-border)/0.75)] hover:border-[rgb(var(--app-accent)/0.25)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex gap-3 sm:gap-4 p-4 sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent)/0.4)]"
      >
        <WorkoutCategoryIcon visual={visual} size="md" />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <time className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
                {formatDateRu(workout.date)}
              </time>
              <h3 className="text-base sm:text-lg font-semibold text-[rgb(var(--app-text))] mt-0.5">
                {cardioTypeLabel(workout.type)}
              </h3>
              <div className="mt-1">
                <WorkoutSourceBadge
                  sourceType={
                    workout.source_summary?.primary_source_type ??
                    legacyDataSourceToType(workout.data_source)
                  }
                  label={workout.source_summary?.primary_label ?? workout.data_source ?? undefined}
                />
              </div>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-[rgb(var(--app-text-muted))] transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <MetricPill
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={units.formatDistance(workout.distance_km)}
            />
            {workout.duration_sec > 0 ? (
              <MetricPill
                icon={<Timer className="h-3.5 w-3.5" />}
                label={formatDuration(workout.duration_sec)}
              />
            ) : null}
            {workout.avg_hr != null ? (
              <MetricPill icon={<Heart className="h-3.5 w-3.5" />} label={`${workout.avg_hr} уд/мин`} />
            ) : null}
            {isBike && bike ? (
              <>
                {bike.speed !== "—" ? (
                  <MetricPill icon={<Gauge className="h-3.5 w-3.5" />} label={bike.speed} muted />
                ) : null}
                {bike.cadence !== "—" ? <MetricPill label={bike.cadence} muted /> : null}
              </>
            ) : null}
            {!isBike ? (
              <MetricPill label={cardioSecondarySummary(workout, units)} muted />
            ) : null}
            {chestKcal != null ? (
              <MetricPill icon={<Zap className="h-3.5 w-3.5" />} label={units.formatEnergy(chestKcal)} muted />
            ) : null}
            {isPool && workout.swolf != null ? (
              <MetricPill label={`SWOLF ${workout.swolf}`} muted />
            ) : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="px-4 sm:px-5 pb-5 border-t border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.25)]">
          <div className="pt-4">
            <CardioWorkoutPanel
              workout={workout}
              hasHr={availability.has_hr}
              hasGps={availability.has_gps}
              hasSensors={availability.has_sensors}
            />
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[rgb(var(--app-border)/0.4)]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--app-border))] px-3 py-2 text-sm font-medium hover:bg-[rgb(var(--app-subtab-hover))]"
              >
                <Pencil className="h-4 w-4" />
                Редактировать
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MetricPill({
  icon,
  label,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium tabular-nums max-w-full truncate",
        muted
          ? "bg-[rgb(var(--app-subtab-track)/0.6)] text-[rgb(var(--app-text-muted))]"
          : "bg-[rgb(var(--app-accent)/0.08)] text-[rgb(var(--app-text))]",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}
