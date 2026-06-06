import { ChevronDown, Heart, Pencil, Timer, Trash2, Zap } from "lucide-react";
import type { StrengthSession } from "../../../types";
import { formatDateRu, formatDuration } from "../../../utils/format";
import { workoutVisual } from "../../../utils/workoutVisuals";
import { WorkoutCategoryIcon } from "../../fitness/WorkoutCategoryIcon";
import { cn } from "../../../lib/utils";
import { SessionDetailContent } from "./SessionDetailContent";

export function WorkoutSessionCard({
  session,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  readOnly,
  showWorkoutTitle,
  formatEnergy,
}: {
  session: StrengthSession;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  showWorkoutTitle?: boolean;
  formatEnergy: (kcal: number) => string;
}) {
  const visual = workoutVisual(session.workout_title);
  const setsLabel =
    session.sets_count > 0
      ? `${session.sets_count} подход${session.sets_count === 1 ? "" : session.sets_count < 5 ? "а" : "ов"}`
      : null;

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
                {formatDateRu(session.date)}
              </time>
              {showWorkoutTitle ? (
                <h3 className="text-base sm:text-lg font-bold text-[rgb(var(--app-text))] mt-0.5">
                  {session.workout_title || "Силовая"}
                </h3>
              ) : (
                <h3 className="text-base sm:text-lg font-bold text-[rgb(var(--app-text))] mt-0.5">
                  {visual.label}
                </h3>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-[rgb(var(--app-text-muted))] transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {setsLabel ? (
              <MetricPill icon={<Zap className="h-3.5 w-3.5" />} label={setsLabel} />
            ) : null}
            {session.duration_sec != null && session.duration_sec > 0 ? (
              <MetricPill
                icon={<Timer className="h-3.5 w-3.5" />}
                label={formatDuration(session.duration_sec)}
              />
            ) : null}
            {session.avg_hr != null ? (
              <MetricPill icon={<Heart className="h-3.5 w-3.5" />} label={`${session.avg_hr} уд/мин`} />
            ) : null}
            {session.calories_chest != null ? (
              <MetricPill label={formatEnergy(session.calories_chest)} muted />
            ) : null}
            {session.volume_kg != null && session.volume_kg > 0 ? (
              <MetricPill label={`${Math.round(session.volume_kg)} кг объём`} muted />
            ) : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="px-4 sm:px-5 pb-5 border-t border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.25)]">
          <SessionDetailContent
            date={session.date}
            workoutTitle={session.workout_title}
            hasHrHint={Boolean(session.has_hr)}
          />
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
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium tabular-nums",
        muted
          ? "bg-[rgb(var(--app-subtab-track)/0.6)] text-[rgb(var(--app-text-muted))]"
          : "bg-[rgb(var(--app-accent)/0.08)] text-[rgb(var(--app-text))]",
      )}
    >
      {icon}
      {label}
    </span>
  );
}
